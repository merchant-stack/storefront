import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@rustskinpay/db';
import { readSession } from '../auth/session.js';
import { createPaymentSession } from '../services/payments.js';

const createCheckoutSchema = z.object({
  sourceItemId: z.string().min(1),
});

const INTERNAL_MERCHANT_ID = 'internal-merchant';

export const registerCheckoutRoutes = (server: FastifyInstance): void => {
  /**
   * Create an Order for the given SourceItem and kick off a Stripe Checkout
   * session. Price is always re-read server-side from SourceItem; we never
   * trust client input. A pending SourceTransaction is created so the
   * buy-and-dispatch worker can later execute the buy against the source.
   */
  // Stricter rate limit for checkout: payment flows are higher-cost + higher-
  // abuse-value than reads. 30 attempts/hour per IP is plenty for legitimate use.
  server.post('/api/checkout', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (request, reply) => {
    const session = readSession(request);
    if (!session) return reply.code(401).send({ error: 'not_authenticated' });

    const parse = createCheckoutSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
    }
    const { sourceItemId } = parse.data;

    // Idempotency: if the client retries the same checkout with the same
    // Idempotency-Key header (per-buyer), return the existing order instead of
    // creating a duplicate. Key is scoped per-user via session.sub.
    const idempotencyHeader = request.headers['idempotency-key'];
    const rawKey = Array.isArray(idempotencyHeader) ? idempotencyHeader[0] : idempotencyHeader;
    const idempotencyKey = rawKey ? `${session.sub}:${rawKey}` : null;
    if (idempotencyKey) {
      const existing = await prisma.order.findUnique({
        where: { idempotencyKey },
        select: { id: true, buyerId: true },
      });
      if (existing) {
        if (existing.buyerId !== session.sub) {
          return reply.code(409).send({ error: 'idempotency_key_conflict' });
        }
        return reply.code(200).send({ orderId: existing.id, redirectUrl: null, replayed: true });
      }
    }

    const created = await prisma.$transaction(async (tx) => {
      const item = await tx.sourceItem.findUnique({ where: { id: sourceItemId } });
      if (!item || !item.available) return null;

      const buyer = await tx.user.findUnique({ where: { id: session.sub } });
      if (!buyer) return null;

      const order = await tx.order.create({
        data: {
          merchantId: INTERNAL_MERCHANT_ID,
          buyerId: buyer.id,
          buyerSteamId64: buyer.steamId64,
          buyerEmail: buyer.email,
          status: 'PENDING_PAYMENT',
          totalAmountMinor: item.salePriceMinor,
          currency: item.currency,
          description: item.displayName,
          idempotencyKey,
          items: {
            create: {
              sourceItemId: item.id,
              itemName: item.displayName,
              iconUrl: item.iconUrl,
              priceMinor: item.salePriceMinor,
              currency: item.currency,
            },
          },
          sourceTransactions: {
            create: {
              provider: item.provider,
              sourceOfferId: item.sourceOfferId,
              amountSpentMinor: item.sourcePriceMinor,
              currency: item.currency,
              state: 'PENDING',
            },
          },
        },
      });

      return { order, item };
    });

    if (!created) {
      return reply.code(409).send({ error: 'item_unavailable' });
    }

    const result = await createPaymentSession('STRIPE', {
      orderId: created.order.id,
      amountMinor: created.order.totalAmountMinor,
      currency: created.order.currency,
      description: created.item.displayName,
      imageUrl: created.item.iconUrl ?? undefined,
    });

    if (!result) {
      await prisma.order.update({
        where: { id: created.order.id },
        data: { status: 'FAILED', cancelledAt: new Date() },
      });
      return reply.code(503).send({ error: 'payment_provider_unavailable' });
    }

    return reply.code(201).send({
      orderId: created.order.id,
      redirectUrl: result.redirectUrl,
    });
  });

  server.get('/api/orders/:id', async (request, reply) => {
    const session = readSession(request);
    if (!session) return reply.code(401).send({ error: 'not_authenticated' });

    const { id } = request.params as { id: string };
    // Explicit select — never expose internal fields like sourceTransactions.provider
    // (our arbitrage source) or rawRequest/rawResponse to the buyer.
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        totalAmountMinor: true,
        currency: true,
        createdAt: true,
        paidAt: true,
        fulfilledAt: true,
        buyerId: true,
        items: {
          select: { id: true, itemName: true, iconUrl: true, priceMinor: true, currency: true },
        },
        payments: {
          select: {
            id: true,
            status: true,
            provider: true,
            succeededAt: true,
          },
        },
        trades: {
          select: { id: true, status: true, sentAt: true, completedAt: true },
        },
        sourceTransactions: {
          select: { id: true, state: true, errorCode: true, succeededAt: true },
        },
      },
    });
    if (!order || order.buyerId !== session.sub) {
      return reply.code(404).send({ error: 'not_found' });
    }
    // Strip buyerId from the response — the client already knows who they are.
    const { buyerId: _, ...safe } = order;
    return { order: safe };
  });

  // Paginated list of the authenticated user's orders. Powers /account history
  // and the /checkout/success polling page.
  const listOrdersQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(50).default(20),
    cursor: z.string().optional(),
  });

  server.get('/api/me/orders', async (request, reply) => {
    const session = readSession(request);
    if (!session) return reply.code(401).send({ error: 'not_authenticated' });

    const parse = listOrdersQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parse.error.flatten() });
    }
    const { limit, cursor } = parse.data;

    const rows = await prisma.order.findMany({
      where: { buyerId: session.sub },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        items: {
          select: { id: true, itemName: true, iconUrl: true, priceMinor: true, currency: true },
        },
        sourceTransactions: {
          select: { id: true, state: true, errorCode: true, succeededAt: true },
        },
        payments: {
          select: { id: true, status: true, provider: true, succeededAt: true },
        },
      },
    });

    const hasMore = rows.length > limit;
    const orders = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (orders[orders.length - 1]?.id ?? null) : null;

    return { orders, nextCursor };
  });
};
