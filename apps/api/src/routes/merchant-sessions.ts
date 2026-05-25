// POST /api/merchant/sessions — the deposit-gateway entry point.
//
// Authenticated by HMAC-SHA256 over the request method + path + timestamp +
// nonce + sha256(body). Verified against the merchant's apiSecret loaded from
// env at boot. Nonces are tracked in Redis with TTL = 2 × the timestamp
// tolerance window, so a replay attempt within the legitimate-clock-drift
// window is still rejected.
//
// On success we create an Order under the merchant (NOT internal) and a
// Whop Plan covered by a random near-priced Rust skin name. The merchant
// gets back a URL to redirect the customer to.
//
// Idempotency: a second call with the same merchant_order_id returns the
// existing session unchanged (so the merchant can safely retry after a
// network blip without double-creating Whop plans).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@rustskinpay/db';
import { verifyRequestSignature } from '@rustskinpay/shared/merchant-hmac';
import { pickCoverSku } from '@rustskinpay/shared/cover-sku';
import { resolveMerchantContext } from '../services/merchant.js';
import { getMarketPriceIndex } from '../services/market-prices-cache.js';
import { createPaymentSession } from '../services/payments.js';
import { getRedis } from '../services/redis.js';
import { isIpAllowed } from '../services/ip-allowlist.js';
import { env } from '../env.js';

// ---------------------------------------------------------------------------
// Request body schema (zod) — strict so unknown fields are rejected outright.
// Field naming mirrors Stripe / Whop conventions to ease the integrator's
// learning curve: snake_case in JSON, lowercase, no nested objects beyond
// the opaque metadata blob.
// ---------------------------------------------------------------------------

const createSessionSchema = z
  .object({
    merchant_order_id: z.string().min(1).max(120),
    amount_minor: z.number().int().positive().max(1_000_000_00), // $1,000,000 sanity cap
    currency: z.literal('USD'), // Phase 1: USD only. Add EUR / RUB when needed.
    return_url: z.string().url(),
    cancel_url: z.string().url().optional(),
    user_identifier: z.string().max(120).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

type CreateSessionInputBody = z.infer<typeof createSessionSchema>;

// ---------------------------------------------------------------------------
// Nonce-store wrappers (Redis-backed). Key shape is intentionally narrow so
// we can't accidentally collide with OpenID nonces or other cached values.
// ---------------------------------------------------------------------------

const nonceKey = (merchantId: string, nonce: string): string =>
  `merchant:nonce:${merchantId}:${nonce}`;

function makeIsNonceSeen(merchantId: string): (nonce: string) => Promise<boolean> {
  return async (nonce: string) => {
    const redis = getRedis();
    const v = await redis.get(nonceKey(merchantId, nonce));
    return v !== null;
  };
}

function makeMarkNonceSeen(merchantId: string): (nonce: string, ttl: number) => Promise<void> {
  return async (nonce: string, ttl: number) => {
    const redis = getRedis();
    // SET ... NX EX prevents race conditions between the seen-check and the
    // mark — if two parallel requests with the same nonce arrive at the same
    // instant, only one wins the NX.
    await redis.set(nonceKey(merchantId, nonce), '1', 'EX', ttl, 'NX');
  };
}

// ---------------------------------------------------------------------------
// Return-URL whitelist check. Defends against an attacker who somehow gets a
// signed session-create request through (e.g. via a vulnerability in the
// merchant's own stack) from setting return_url=evil.com and phishing buyers
// after they pay. We reject unless the URL's hostname is on the allowlist.
// ---------------------------------------------------------------------------

function isAllowedReturnUrl(rawUrl: string, allowed: Set<string>): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return allowed.has(parsed.hostname.toLowerCase());
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export const registerMerchantSessionRoutes = (server: FastifyInstance): void => {
  server.post(
    '/api/merchant/sessions',
    { config: { rawBody: true } },
    async (request, reply) => {
      const merchantId =
        headerString(request.headers['x-merchant-id']) ?? '';

      // Look up the merchant FIRST so we know which secret to verify against.
      // resolveMerchantContext returns null both for unknown merchants and
      // for merchants we know about but can't authenticate (env missing) —
      // collapsing those two cases prevents merchant-id enumeration via
      // timing differences.
      const ctx = await resolveMerchantContext(merchantId);
      if (!ctx) {
        return reply.code(401).send({ error: 'unauthorized' });
      }

      // IP allowlist check — runs BEFORE the (relatively expensive) HMAC
      // verify so a stray scanner / attacker on the wrong IP doesn't even
      // get a chance to brute-force signatures. Empty allowlist = disabled
      // (relies on HMAC alone); see env MERCHANT_COBALT_ALLOWED_IPS.
      // request.ip is trustworthy because fastify is configured with
      // trustProxy:true and Caddy sets X-Forwarded-For.
      if (!isIpAllowed(request.ip, ctx.allowedIps)) {
        request.log.warn(
          { merchantId, ip: request.ip },
          'merchant session rejected: caller IP not on allowlist',
        );
        return reply.code(401).send({ error: 'unauthorized' });
      }

      // Verify HMAC + nonce. rawBody is exactly the bytes the merchant
      // signed; using request.body would let fastify's body parser silently
      // re-canonicalise (e.g. by re-encoding strings) and break verification.
      const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
      const rawBodyStr =
        typeof rawBody === 'string'
          ? rawBody
          : rawBody
            ? rawBody.toString('utf8')
            : '';

      const verifyResult = await verifyRequestSignature({
        method: request.method,
        path: request.url.split('?')[0] ?? '/api/merchant/sessions',
        headers: request.headers,
        body: rawBodyStr,
        secret: ctx.apiSecret,
        isNonceSeen: makeIsNonceSeen(merchantId),
        markNonceSeen: makeMarkNonceSeen(merchantId),
      });
      if (!verifyResult.valid) {
        request.log.warn(
          { merchantId, reason: verifyResult.reason },
          'merchant session signature rejected',
        );
        // Return a generic message — don't leak which check failed to a
        // potential attacker. The reason is in our server logs.
        return reply.code(401).send({ error: 'unauthorized' });
      }

      // Validate body shape.
      const parsed = createSessionSchema.safeParse(JSON.parse(rawBodyStr || '{}'));
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          details: parsed.error.flatten().fieldErrors,
        });
      }
      const body: CreateSessionInputBody = parsed.data;

      // Return URL must be on the configured allowlist for this merchant.
      if (!isAllowedReturnUrl(body.return_url, ctx.allowedReturnDomains)) {
        return reply.code(400).send({ error: 'return_url_not_allowed' });
      }
      if (body.cancel_url && !isAllowedReturnUrl(body.cancel_url, ctx.allowedReturnDomains)) {
        return reply.code(400).send({ error: 'cancel_url_not_allowed' });
      }

      // Idempotency: the merchant's merchant_order_id is the unique key on
      // our side. A repeat call (e.g. their server retried after our reply
      // timed out) returns the EXISTING Order — same checkout URL, same
      // Whop Plan, no double-charge.
      const idempotencyKey = `${ctx.merchant.id}:${body.merchant_order_id}`;
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
      });
      if (existing) {
        if (existing.merchantId !== ctx.merchant.id) {
          // Belt-and-suspenders: the idempotency key already encodes the
          // merchant id, so this shouldn't be reachable. But if it ever is,
          // refuse rather than handing the wrong merchant another's order.
          return reply.code(409).send({ error: 'idempotency_collision' });
        }
        const existingPlanId = existing.payments[0]?.providerSessionId;
        if (!existingPlanId) {
          // The original create errored after Order insert but before
          // Whop Plan creation. We need a usable plan now — fall through to
          // creating one and patch the row. For simplicity in Phase 1 we
          // return 409 and ask the merchant to use a new merchant_order_id;
          // this only happens if our previous response was 5xx.
          return reply.code(409).send({ error: 'idempotency_incomplete' });
        }
        return reply.code(200).send(buildResponse(existing.id, existingPlanId, body));
      }

      // Pick the cover SKU: a real Rust skin whose floor price sits near the
      // requested amount. Whop sees a normal-looking marketplace transaction.
      let coverSku;
      try {
        const index = await getMarketPriceIndex();
        coverSku = pickCoverSku({ index, amountMinor: body.amount_minor });
      } catch (err) {
        request.log.error(
          { err, merchantId, amount: body.amount_minor },
          'price index unavailable; cannot pick cover SKU',
        );
        return reply.code(503).send({ error: 'price_oracle_unavailable' });
      }
      if (!coverSku) {
        return reply.code(503).send({ error: 'price_oracle_empty' });
      }

      // Create the Order (in a transaction with a unique-violation guard so
      // a parallel request with the same merchant_order_id can't double-create).
      let orderId: string;
      try {
        const order = await prisma.order.create({
          data: {
            merchantId: ctx.merchant.id,
            // Deposit flow: no Steam-logged-in buyer. buyerId stays null.
            // user_identifier (cobalt.skin's user id) lives in metadata
            // and is echoed back in the outbound webhook so the merchant
            // can credit the right user.
            buyerId: null,
            buyerSteamId64: null,
            status: 'PENDING_PAYMENT',
            totalAmountMinor: body.amount_minor,
            currency: body.currency,
            description: `Deposit ${formatAmount(body.amount_minor, body.currency)}`,
            idempotencyKey,
            metadata: {
              kind: 'merchant_deposit',
              merchantOrderId: body.merchant_order_id,
              returnUrl: body.return_url,
              cancelUrl: body.cancel_url ?? null,
              userIdentifier: body.user_identifier ?? null,
              coverSku: coverSku.marketHashName,
              coverSkuReferencePriceMinor: coverSku.referencePriceMinor,
              merchantMetadata: (body.metadata ?? null) as never,
            } as object,
          },
        });
        orderId = order.id;
      } catch (err) {
        // P2002 unique-violation on idempotencyKey: another request beat us.
        // Re-read and return the existing one. We don't expose the race to
        // the caller.
        if (isUniqueViolation(err)) {
          const winner = await prisma.order.findUnique({
            where: { idempotencyKey },
            include: { payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
          });
          const planId = winner?.payments[0]?.providerSessionId;
          if (winner && planId) {
            return reply.code(200).send(buildResponse(winner.id, planId, body));
          }
        }
        throw err;
      }

      // Create the Whop Plan. createPaymentSession also writes a Payment row
      // bound to this Order, so the inbound Whop webhook can route back via
      // metadata.orderId.
      const session = await createPaymentSession({
        orderId,
        amountMinor: body.amount_minor,
        currency: body.currency,
        // Whop Plan title (truncated to 30 inside the provider) = our cover
        // SKU. Whop sees a plausible "skin name — $X" listing.
        description: coverSku.marketHashName,
        buyerSteamId: body.user_identifier ?? `merchant:${ctx.merchant.id}`,
        buyerEmail: undefined,
        providerId: 'WHOP',
      });

      if (!session) {
        // Roll back the Order — the integrator should be able to retry with
        // the same merchant_order_id without being stuck behind a half-done
        // session.
        await prisma.order
          .update({
            where: { id: orderId },
            data: { status: 'FAILED', cancelledAt: new Date(), idempotencyKey: null },
          })
          .catch(() => undefined);
        return reply.code(503).send({ error: 'payment_provider_unavailable' });
      }

      return reply.code(201).send(buildResponse(orderId, session.providerSessionId, body));
    },
  );
};

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

const SESSION_TTL_SECONDS = 30 * 60; // 30 minutes UX expectation, informational only

function buildResponse(
  orderId: string,
  // The Whop plan id binds an Order to a Whop payment server-side via the
  // Payment row; we deliberately DON'T expose it in the merchant-facing
  // response so the merchant integration stays PSP-agnostic.
  _whopPlanId: string,
  body: Pick<CreateSessionInputBody, 'merchant_order_id' | 'amount_minor' | 'currency'>,
): {
  session_id: string;
  checkout_url: string;
  expires_at: string;
  merchant_order_id: string;
  amount_minor: number;
  currency: string;
} {
  return {
    session_id: orderId,
    checkout_url: `${env.WEB_ORIGIN}/pay/${orderId}`,
    // Informational: we don't strictly enforce expiry server-side in Phase 1,
    // but the merchant's UX should reflect "expect the buyer to complete
    // within 30 minutes" so we surface it.
    expires_at: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    merchant_order_id: body.merchant_order_id,
    amount_minor: body.amount_minor,
    currency: body.currency,
  };
}

function headerString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function formatAmount(minor: number, currency: string): string {
  return `${(minor / 100).toFixed(2)} ${currency}`;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}
