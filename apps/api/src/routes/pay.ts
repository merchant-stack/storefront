// GET /api/pay/:id — public lookup endpoint for the merchant-gateway payment
// page (/pay/[id] on the web).
//
// Auth model: the session id (= Order.id) is a long cuid that an attacker
// can't guess; we treat the URL itself as the bearer token. This matches
// Stripe's "checkout session" pattern. No Steam login, no merchant HMAC —
// just the random id in the path.
//
// What we DON'T expose:
//   - The merchant's API secret / webhook secret (env-only on our side)
//   - The buyer's email if it was attached server-side later
//   - Any other order's data — the lookup is keyed by the public id only

import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import { prisma } from '@rustskinpay/db';
import { env } from '../env.js';
import { getRedis } from '../services/redis.js';

// The shape the /pay web page consumes. Both the local-order branch and the
// cobalt pull-flow branch must produce exactly this.
interface PayPageSession {
  session_id: string;
  status:
    | 'PENDING_PAYMENT'
    | 'PAID'
    | 'FULFILLING'
    | 'FULFILLED'
    | 'FAILED'
    | 'CANCELLED'
    | 'REFUNDED';
  amount_minor: number;
  currency: string;
  merchant_name: string;
  plan_id: string | null;
  return_url: string | null;
  cancel_url: string | null;
  paid_at: string | null;
  cover_skin: { name: string; icon_url: string | null } | null;
}

// ---------------------------------------------------------------------------
// cobalt.skin pull-flow.
//
// A /pay id starting with "cmvd" is a cobalt-hosted invoice — there is NO Order
// on our side. cobalt created the Whop plan itself and owns the source of
// truth; our page is just the white-label surface that renders the Whop iframe.
// So we fetch the display data (Whop plan id + amount + item) server-side from
// cobalt's callback endpoint, cache it in Redis, and return the same shape the
// page already understands.
//
// SECURITY: the shared token is used here, on the server, ONLY. It is never
// placed in any response, so it can't leak to the browser.
// ---------------------------------------------------------------------------

const COBALT_ID_PREFIX = 'cmvd';
const COBALT_CACHE_TTL_SECONDS = 30 * 60;
const COBALT_FETCH_TIMEOUT_MS = 5000;

function mapCobaltPayload(id: string, payload: unknown): PayPageSession | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.status !== 'success') return null;
  const data = p.data as Record<string, unknown> | undefined;
  if (!data) return null;

  const whoopId = data.whoopID;
  const paySum = data.paySum;
  // whoopID === the Whop plan id; the embed renders the iframe from it.
  if (typeof whoopId !== 'string' || whoopId.length === 0) return null;
  // paySum is the amount in MINOR units (cents) — same convention as our
  // Order.totalAmountMinor and what the page's formatPrice expects.
  if (typeof paySum !== 'number' || !Number.isFinite(paySum) || paySum <= 0) return null;

  const item = typeof data.item === 'string' && data.item.length > 0 ? data.item : null;

  return {
    session_id: id,
    // We always present the form: cobalt owns paid-state and receives Whop's
    // webhook directly, so we don't track terminal states for this flow.
    status: 'PENDING_PAYMENT',
    amount_minor: paySum,
    currency: 'USD',
    // White-label: never shown to the buyer; kept generic.
    merchant_name: 'cobalt',
    plan_id: whoopId,
    return_url: typeof data.return_url === 'string' ? data.return_url : null,
    cancel_url: typeof data.cancel_url === 'string' ? data.cancel_url : null,
    paid_at: null,
    cover_skin: item ? { name: item, icon_url: null } : null,
  };
}

async function fetchCobaltPaySession(
  id: string,
  log: FastifyBaseLogger,
): Promise<PayPageSession | null> {
  const redis = getRedis();
  const cacheKey = `cobalt:pay:${id}`;

  // 1. Serve from cache if we've already resolved this invoice (refresh / re-open).
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as PayPageSession;
    } catch {
      // Corrupt entry — fall through and re-fetch.
    }
  }

  // 2. No config → can't resolve. 404 (not 500) so a probe learns nothing.
  if (!env.COBALT_PAY_CALLBACK_URL || !env.COBALT_PAY_CALLBACK_TOKEN) {
    log.error({ id }, 'cobalt pay-callback not configured; cannot resolve cmvd invoice');
    return null;
  }

  // 3. Fetch server-side. Token rides in the query string per cobalt's spec and
  //    never leaves our server.
  const url =
    `${env.COBALT_PAY_CALLBACK_URL}/?token=${encodeURIComponent(env.COBALT_PAY_CALLBACK_TOKEN)}` +
    `&invoiceID=${encodeURIComponent(id)}`;

  let res: Awaited<ReturnType<typeof fetch>>;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COBALT_FETCH_TIMEOUT_MS);
    try {
      res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    log.error(
      { id, err: err instanceof Error ? err.message : String(err) },
      'cobalt pay-callback fetch failed',
    );
    return null;
  }

  if (!res.ok) {
    log.warn({ id, status: res.status }, 'cobalt pay-callback non-200');
    return null;
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    log.warn({ id }, 'cobalt pay-callback returned non-JSON');
    return null;
  }

  const session = mapCobaltPayload(id, payload);
  if (!session) {
    log.warn({ id }, 'cobalt pay-callback payload not success / missing fields');
    return null;
  }

  // 4. Cache so repeat loads don't hammer cobalt.
  await redis
    .set(cacheKey, JSON.stringify(session), 'EX', COBALT_CACHE_TTL_SECONDS)
    .catch(() => undefined);
  return session;
}

export const registerPayRoutes = (server: FastifyInstance): void => {
  server.get('/api/pay/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    // cobalt-hosted invoice (no local Order) — resolve via cobalt's callback.
    if (id.startsWith(COBALT_ID_PREFIX)) {
      const session = await fetchCobaltPaySession(id, request.log);
      if (!session) return reply.code(404).send({ error: 'not_found' });
      return reply.send(session);
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        merchant: { select: { id: true, name: true, isInternal: true, status: true } },
        payments: {
          where: { provider: 'WHOP' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { providerSessionId: true },
        },
      },
    });
    if (!order) return reply.code(404).send({ error: 'not_found' });

    // The /pay page is for the MERCHANT deposit flow only. Internal storefront
    // orders go through /checkout/[sourceItemId]; refusing them here keeps a
    // probing client from poking at internal-order ids.
    if (order.merchant.isInternal) {
      return reply.code(404).send({ error: 'not_found' });
    }
    if (order.merchant.status !== 'ACTIVE') {
      return reply.code(404).send({ error: 'not_found' });
    }

    const meta = (order.metadata ?? {}) as Record<string, unknown>;
    const returnUrl = typeof meta.returnUrl === 'string' ? meta.returnUrl : null;
    const cancelUrl = typeof meta.cancelUrl === 'string' ? meta.cancelUrl : null;

    // Cover skin: the real Rust skin name (+ icon) we picked at session create.
    // The /pay page renders it as the item being "purchased" — priced at the
    // deposit amount, not the skin's own reference price. iconUrl may be null
    // (Steam lookup failed at create) → the page shows a generated placeholder.
    const coverSkinName = typeof meta.coverSku === 'string' ? meta.coverSku : null;
    const coverSkinIconUrl = typeof meta.coverSkuIconUrl === 'string' ? meta.coverSkuIconUrl : null;

    // Only expose the Whop plan id when the order is still PENDING — once
    // PAID/FAILED there's nothing to render an iframe for, and exposing
    // planId after the fact gives no value while marginally increasing
    // attack surface.
    const planId =
      order.status === 'PENDING_PAYMENT' ? (order.payments[0]?.providerSessionId ?? null) : null;

    return reply.send({
      session_id: order.id,
      status: order.status,
      amount_minor: order.totalAmountMinor,
      currency: order.currency,
      merchant_name: order.merchant.name,
      plan_id: planId,
      return_url: returnUrl,
      cancel_url: cancelUrl,
      paid_at: order.paidAt ? order.paidAt.toISOString() : null,
      cover_skin: coverSkinName
        ? { name: coverSkinName, icon_url: coverSkinIconUrl }
        : null,
    });
  });
};
