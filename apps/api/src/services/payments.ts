import { prisma, type PaymentProvider, type Prisma } from '@rustskinpay/db';
import { createCheckoutSession } from './stripe.js';
import { enqueueBuyAndDispatch, enqueueTradeDispatch } from './trade-queue.js';
import { env } from '../env.js';

export interface CreateSessionInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  imageUrl?: string;
  buyerEmail?: string;
}

export interface CreateSessionResult {
  paymentId: string;
  redirectUrl: string;
}

const buildMockSessionId = (orderId: string): string =>
  `mock_${orderId}_${Date.now().toString(36)}`;

/**
 * Provider-agnostic entry point: given an Order, create a payment session.
 * When env.MOCK_PAYMENTS is true, Stripe is skipped and we redirect to our
 * local /checkout/mock page; the Payment row is still written so downstream
 * code is identical.
 */
export const createPaymentSession = async (
  provider: PaymentProvider,
  input: CreateSessionInput,
): Promise<CreateSessionResult | null> => {
  if (provider !== 'STRIPE') {
    throw new Error(`payment provider not yet implemented: ${provider}`);
  }

  if (env.MOCK_PAYMENTS) {
    const providerSessionId = buildMockSessionId(input.orderId);
    const payment = await prisma.payment.create({
      data: {
        orderId: input.orderId,
        provider: 'STRIPE',
        providerSessionId,
        amountMinor: input.amountMinor,
        currency: input.currency,
        status: 'PENDING',
      },
    });
    const redirectUrl = `${env.WEB_ORIGIN}/checkout/mock?orderId=${encodeURIComponent(input.orderId)}`;
    return { paymentId: payment.id, redirectUrl };
  }

  const successUrl = `${env.WEB_ORIGIN}/checkout/success?orderId=${input.orderId}`;
  const cancelUrl = `${env.WEB_ORIGIN}/checkout/cancelled?orderId=${input.orderId}`;

  const session = await createCheckoutSession({
    ...input,
    successUrl,
    cancelUrl,
  });
  if (!session) return null;

  const payment = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      provider: 'STRIPE',
      providerSessionId: session.id,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'PENDING',
    },
  });

  return { paymentId: payment.id, redirectUrl: session.url };
};

export interface FinalizeOrderInput {
  orderId: string;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
}

/**
 * Mark an order as PAID and start fulfilment. For SourceItem orders (post-pivot,
 * the only path going forward) we enqueue buy-and-dispatch — the worker buys
 * the item on the source marketplace and then sends a Steam trade. For legacy
 * Listing orders we keep the old direct trade-dispatch path.
 *
 * Idempotent: a no-op if the order is already PAID/FULFILLED. Returns which
 * follow-up jobs (if any) got enqueued so the caller can log them.
 */
export const finalizeOrderPayment = async (
  input: FinalizeOrderInput,
): Promise<{ buyAndDispatchEnqueued: boolean; tradeId: string | null }> => {
  const result = await prisma.$transaction(async (tx) => {
    const paymentWhere: Prisma.PaymentWhereInput = input.providerSessionId
      ? { providerSessionId: input.providerSessionId, status: { in: ['PENDING', 'PROCESSING'] } }
      : { orderId: input.orderId, status: { in: ['PENDING', 'PROCESSING'] } };

    await tx.payment.updateMany({
      where: paymentWhere,
      data: {
        status: 'SUCCEEDED',
        succeededAt: new Date(),
        ...(input.providerPaymentIntentId
          ? { providerPaymentIntentId: input.providerPaymentIntentId }
          : {}),
      },
    });

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true, buyer: true, sourceTransactions: true },
    });
    if (!order || order.status === 'PAID' || order.status === 'FULFILLED') {
      return { enqueueBuy: false, tradeId: null as string | null };
    }

    await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    const hasSourceTx = order.sourceTransactions.length > 0;

    // Legacy: marketplace listing orders — transition Listing→SOLD + Trade(QUEUED).
    if (!hasSourceTx) {
      for (const item of order.items) {
        if (item.listingId) {
          await tx.listing.update({
            where: { id: item.listingId },
            data: { status: 'SOLD', soldAt: new Date() },
          });
        }
      }

      if (!order.buyer?.tradeUrl || !order.buyerSteamId64) {
        await tx.trade.create({
          data: {
            orderId: input.orderId,
            botSteamId64: 'PENDING',
            buyerSteamId64: order.buyerSteamId64 ?? '',
            buyerTradeUrl: '',
            status: 'QUEUED',
            errorCode: order.buyer?.tradeUrl ? null : 'BUYER_NO_TRADE_URL',
          },
        });
        return { enqueueBuy: false, tradeId: null };
      }

      const trade = await tx.trade.create({
        data: {
          orderId: input.orderId,
          botSteamId64: 'AUTO',
          buyerSteamId64: order.buyerSteamId64,
          buyerTradeUrl: order.buyer.tradeUrl,
          status: 'QUEUED',
        },
      });
      return { enqueueBuy: false, tradeId: trade.id };
    }

    // New path: source-item orders. Worker handles buy + trade.
    if (!order.buyer?.tradeUrl) {
      // Block fulfilment — buyer hasn't set their trade URL yet. We still mark
      // the order PAID; ops/UI can prompt the buyer to add the URL and then
      // operators re-enqueue.
      return { enqueueBuy: false, tradeId: null };
    }
    return { enqueueBuy: true, tradeId: null };
  });

  if (result.enqueueBuy) {
    await enqueueBuyAndDispatch(input.orderId);
  } else if (result.tradeId) {
    await enqueueTradeDispatch(result.tradeId);
  }

  return { buyAndDispatchEnqueued: result.enqueueBuy, tradeId: result.tradeId };
};

/**
 * Abort a PENDING_PAYMENT order. For legacy listing orders, frees the reserved
 * Listing rows. For source-item orders, marks SourceTransactions FAILED.
 */
export const cancelOrderPayment = async (input: {
  orderId: string;
  providerSessionId?: string;
}): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    const paymentWhere: Prisma.PaymentWhereInput = input.providerSessionId
      ? { providerSessionId: input.providerSessionId, status: { in: ['PENDING', 'PROCESSING'] } }
      : { orderId: input.orderId, status: { in: ['PENDING', 'PROCESSING'] } };

    await tx.payment.updateMany({ where: paymentWhere, data: { status: 'FAILED' } });

    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { items: true, sourceTransactions: true },
    });
    if (!order || order.status !== 'PENDING_PAYMENT') return;

    await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'FAILED', cancelledAt: new Date() },
    });

    for (const item of order.items) {
      if (item.listingId) {
        await tx.listing.update({
          where: { id: item.listingId },
          data: { status: 'ACTIVE', reservedAt: null },
        });
      }
    }

    if (order.sourceTransactions.length > 0) {
      await tx.sourceTransaction.updateMany({
        where: { orderId: order.id, state: 'PENDING' },
        data: { state: 'FAILED', errorCode: 'CHECKOUT_CANCELLED' },
      });
    }
  });
};
