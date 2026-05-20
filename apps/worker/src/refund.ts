// Refund helper for buy-and-dispatch failures.
//
// Called when a paid order can't be fulfilled (source buy failed, item gone,
// etc). Provider-agnostic: goes through the same registry the api uses, so
// new providers plug in automatically — no edits here when adding a provider.

import { prisma } from '@rustskinpay/db';
import {
  createPaymentRegistry,
  type PaymentRegistry,
} from '@rustskinpay/shared/payments';
import { env } from './env.js';

let registry: PaymentRegistry | null = null;
const getRegistry = (): PaymentRegistry => {
  if (!registry) {
    registry = createPaymentRegistry({
      webOrigin: env.WEB_ORIGIN,
      mockPayments: env.MOCK_PAYMENTS,
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: undefined, // worker never verifies webhooks
      },
    });
  }
  return registry;
};

export interface RefundResult {
  status: 'refunded' | 'manual_required' | 'mock';
  refundId?: string;
  reason?: string;
}

export async function refundOrder(orderId: string, reason: string): Promise<RefundResult> {
  const payments = await prisma.payment.findMany({
    where: { orderId, status: { in: ['SUCCEEDED', 'PROCESSING'] } },
    orderBy: { succeededAt: 'desc' },
  });
  const payment = payments.find((p) => p.providerPaymentIntentId);

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

  if (!payment?.providerPaymentIntentId) {
    // No payment intent to refund against — flag for manual ops intervention.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED' },
    });
    return { status: 'manual_required', reason: 'no_payment_intent' };
  }

  const provider = getRegistry().get(payment.provider);
  if (!provider || !provider.supportsRefunds()) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'FAILED' },
    });
    return {
      status: 'manual_required',
      reason: `provider_unavailable:${payment.provider.toLowerCase()}`,
    };
  }

  const result = await provider.refund({
    orderId,
    providerPaymentIntentId: payment.providerPaymentIntentId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    reason,
  });

  if (result.status === 'refunded') {
    await prisma.$transaction([
      prisma.payment.updateMany({
        where: { orderId, providerPaymentIntentId: payment.providerPaymentIntentId },
        data: { status: 'REFUNDED' },
      }),
      prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } }),
    ]);
    return { status: 'refunded', refundId: result.refundId, reason };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'FAILED' },
  });
  return { status: 'manual_required', reason: result.reason };
}
