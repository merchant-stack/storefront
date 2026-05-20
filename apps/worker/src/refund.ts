// Stripe refund helper for buy-and-dispatch failures.
//
// Called when a paid order can't be fulfilled (DMarket buy failed, item gone,
// etc). Issues a Stripe refund against the original payment_intent if one
// exists, and updates Payment/Order state. Mock-mode skips Stripe and just
// flips state for dev parity.

import Stripe from 'stripe';
import { prisma } from '@rustskinpay/db';
import { env } from './env.js';

let cached: Stripe | null = null;
function getStripe(): Stripe | null {
  if (cached) return cached;
  if (!env.STRIPE_SECRET_KEY) return null;
  cached = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2025-02-24.acacia', typescript: true });
  return cached;
}

export interface RefundResult {
  status: 'refunded' | 'manual_required' | 'mock';
  stripeRefundId?: string;
  reason?: string;
}

export async function refundOrder(orderId: string, reason: string): Promise<RefundResult> {
  const payments = await prisma.payment.findMany({
    where: { orderId, status: { in: ['SUCCEEDED', 'PROCESSING'] } },
    orderBy: { succeededAt: 'desc' },
  });

  if (env.MOCK_PAYMENTS) {
    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { orderId, status: { in: ['SUCCEEDED', 'PROCESSING'] } },
        data: { status: 'REFUNDED' },
      }),
      prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } }),
    ]);
    return { status: 'mock', reason };
  }

  const stripe = getStripe();
  const intent = payments.find((p) => p.providerPaymentIntentId)?.providerPaymentIntentId;
  if (!stripe || !intent) {
    // No real Stripe context — flag for manual ops intervention.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED' },
    });
    return { status: 'manual_required', reason };
  }

  const refund = await stripe.refunds.create({
    payment_intent: intent,
    metadata: { orderId, reason },
  });

  await prisma.$transaction([
    prisma.payment.updateMany({
      where: { orderId, providerPaymentIntentId: intent },
      data: { status: 'REFUNDED' },
    }),
    prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } }),
  ]);

  return { status: 'refunded', stripeRefundId: refund.id, reason };
}
