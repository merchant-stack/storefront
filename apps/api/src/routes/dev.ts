import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '@rustskinpay/db';
import { env } from '../env.js';
import { readSession } from '../auth/session.js';
import { cancelOrderPayment, finalizeOrderPayment } from '../services/payments.js';

const bodySchema = z.object({ orderId: z.string().min(1) });

/**
 * Dev-only endpoints that simulate Stripe webhook outcomes locally without
 * requiring a real Stripe account or the Stripe CLI. Gated on MOCK_PAYMENTS=true
 * AND a logged-in session that owns the target order, so this can never be
 * accidentally hit in production.
 */
export const registerDevRoutes = (server: FastifyInstance): void => {
  if (!env.MOCK_PAYMENTS) return;

  const requireOwnedOrder = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<{ orderId: string } | null> => {
    const session = readSession(request);
    if (!session) {
      void reply.code(401).send({ error: 'not_authenticated' });
      return null;
    }
    // Mock-on-prod gate: in production the allowlist is the only thing that
    // separates "founder smoke-testing the live site" from "anyone gets a free
    // skin". The route handler already enforced this at checkout creation; we
    // re-check here because /mock-pay is the privileged action.
    if (
      env.NODE_ENV === 'production' &&
      !env.MOCK_PAYMENTS_ALLOWED_STEAM_IDS_SET.has(session.sid)
    ) {
      void reply.code(403).send({ error: 'mock_pay_not_allowed' });
      return null;
    }
    const parse = bodySchema.safeParse(request.body);
    if (!parse.success) {
      void reply.code(400).send({ error: 'invalid_body' });
      return null;
    }
    const order = await prisma.order.findUnique({
      where: { id: parse.data.orderId },
      select: { buyerId: true },
    });
    if (!order || order.buyerId !== session.sub) {
      void reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return { orderId: parse.data.orderId };
  };

  server.post('/api/_dev/mock-pay', async (request, reply) => {
    const ok = await requireOwnedOrder(request, reply);
    if (!ok) return;
    await finalizeOrderPayment({ orderId: ok.orderId });
    return reply.code(200).send({ ok: true });
  });

  server.post('/api/_dev/mock-cancel', async (request, reply) => {
    const ok = await requireOwnedOrder(request, reply);
    if (!ok) return;
    await cancelOrderPayment({ orderId: ok.orderId });
    return reply.code(200).send({ ok: true });
  });
};
