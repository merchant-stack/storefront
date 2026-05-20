import { prisma, type PaymentProvider, type Prisma } from '@rustskinpay/db';
import { createCheckoutSession } from './stripe.js';
import { enqueueBuyAndDispatch } from './trade-queue.js';
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
  buyerEmail?: string;
}

/**
 * Mark an order as PAID and start fulfilment. Enqueues buy-and-dispatch — the
 * worker buys the item on the source marketplace and then sends a Steam trade.
 *
 * Idempotent: a no-op if the order is already PAID/FULFILLED. Returns whether
 * a follow-up job got enqueued so the caller can log it. If the buyer has no
 * trade URL, fulfilment is held (Order still goes PAID) and ops/UI can prompt
 * the buyer.
 */
export const finalizeOrderPayment = async (
  input: FinalizeOrderInput,
): Promise<{ buyAndDispatchEnqueued: boolean }> => {
  const enqueueBuy = await prisma.$transaction(async (tx) => {
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
      include: { buyer: true },
    });
    if (!order || order.status === 'PAID' || order.status === 'FULFILLED') {
      return false;
    }

    // Stripe Checkout collects an email from the card; persist it on the
    // Order if we didn't have one. Also backfill User.email if the buyer
    // signed in via Steam without one (Steam OpenID doesn't expose email).
    if (input.buyerEmail) {
      if (!order.buyerEmail) {
        await tx.order.update({
          where: { id: input.orderId },
          data: { buyerEmail: input.buyerEmail },
        });
      }
      if (order.buyer && !order.buyer.email) {
        // Best-effort: ignore unique-constraint violation if another user
        // already claimed this email.
        await tx.user
          .update({ where: { id: order.buyer.id }, data: { email: input.buyerEmail } })
          .catch(() => undefined);
      }
    }

    await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    return Boolean(order.buyer?.tradeUrl);
  });

  if (enqueueBuy) {
    await enqueueBuyAndDispatch(input.orderId);
  }

  return { buyAndDispatchEnqueued: enqueueBuy };
};

/**
 * Abort a PENDING_PAYMENT order: mark payments FAILED, flip the Order to
 * FAILED, and mark any PENDING SourceTransactions FAILED with a cancel code.
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

    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order || order.status !== 'PENDING_PAYMENT') return;

    await tx.order.update({
      where: { id: input.orderId },
      data: { status: 'FAILED', cancelledAt: new Date() },
    });

    await tx.sourceTransaction.updateMany({
      where: { orderId: order.id, state: 'PENDING' },
      data: { state: 'FAILED', errorCode: 'CHECKOUT_CANCELLED' },
    });
  });
};
