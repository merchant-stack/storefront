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

import type { FastifyInstance } from 'fastify';
import { prisma } from '@rustskinpay/db';

export const registerPayRoutes = (server: FastifyInstance): void => {
  server.get('/api/pay/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

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
