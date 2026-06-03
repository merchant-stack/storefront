// Order/payment orchestrator. Provider-agnostic: every call into a payment
// provider goes through the registry in @rustskinpay/shared/payments. To plug
// in a new provider (NOWPayments, Coinbase Commerce, CryptoCloud, …) write an
// implementation, register it in shared/payments/registry.ts, and add its env
// vars — this file does not change.

import { prisma, type PaymentProvider as PaymentProviderEnum, type Prisma } from '@rustskinpay/db';
import {
  createPaymentRegistry,
  type PaymentProvider as ProviderImpl,
  type PaymentProviderId,
  type PaymentRegistry,
} from '@rustskinpay/shared/payments';
import { enqueueBuyAndDispatch, enqueueMerchantWebhook } from './trade-queue.js';
import { env } from '../env.js';

// Singleton registry instance. Constructed lazily so tests can override.
let registry: PaymentRegistry | null = null;
export const getPaymentRegistry = (): PaymentRegistry => {
  if (!registry) {
    // Defense-in-depth: env.ts already exits on boot if MOCK_PAYMENTS=true in
    // production without a non-empty allowlist. Re-check here so any future
    // code path that constructs the registry directly still fails closed.
    if (
      env.MOCK_PAYMENTS &&
      env.NODE_ENV === 'production' &&
      env.MOCK_PAYMENTS_ALLOWED_STEAM_IDS_SET.size === 0
    ) {
      throw new Error(
        'MOCK_PAYMENTS=true in production requires MOCK_PAYMENTS_ALLOWED_STEAM_IDS',
      );
    }
    registry = createPaymentRegistry({
      webOrigin: env.WEB_ORIGIN,
      mockPayments: env.MOCK_PAYMENTS,
      stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      },
      whop: {
        apiKey: env.WHOP_API_KEY,
        webhookSecret: env.WHOP_WEBHOOK_SECRET,
        companyId: env.WHOP_COMPANY_ID,
        productId: env.WHOP_PRODUCT_ID,
        planProxyUrl: env.WHOP_PLAN_PROXY_URL,
        planProxyToken: env.WHOP_PLAN_PROXY_TOKEN,
      },
    });
  }
  return registry;
};

export interface CreateSessionInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  imageUrl?: string;
  buyerEmail?: string;
  /** SteamID64 of the authenticated buyer — required so the mock-on-prod
   * allowlist can be enforced as defense-in-depth, in case any future caller
   * skips the route-level check. */
  buyerSteamId: string;
  /** Force a specific provider; otherwise the registry default is used. */
  providerId?: PaymentProviderId;
}

export interface CreateSessionResult {
  paymentId: string;
  redirectUrl: string;
  providerId: PaymentProviderId;
  /** Pass-through of the provider-side session/plan id. For Whop this is the
   *  plan_xxx string the embedded-checkout iframe needs; for other providers
   *  the analogous identifier (e.g. Stripe checkout_session_xxx). */
  providerSessionId: string;
}

const buildSuccessUrl = (orderId: string): string =>
  `${env.WEB_ORIGIN}/checkout/success?orderId=${orderId}`;
const buildCancelUrl = (orderId: string): string =>
  `${env.WEB_ORIGIN}/checkout/cancelled?orderId=${orderId}`;

const resolveProvider = (providerId?: PaymentProviderId): ProviderImpl | null => {
  const reg = getPaymentRegistry();
  return providerId ? reg.get(providerId) : reg.default();
};

/**
 * Create a payment session via the chosen provider, persisting a Payment row
 * so downstream webhook + refund flows can look it up.
 *
 * Returns null when no provider is enabled or the provider call fails — the
 * caller (route handler) translates this into a 503 to the buyer.
 */
export const createPaymentSession = async (
  input: CreateSessionInput,
): Promise<CreateSessionResult | null> => {
  // Defense-in-depth: even though the checkout route already gates, re-check
  // here so any future caller (admin tools, retry helpers, scheduled re-bills)
  // also fails closed when mock-on-prod is active and the caller is not on the
  // allowlist.
  if (
    env.MOCK_PAYMENTS &&
    env.NODE_ENV === 'production' &&
    !env.MOCK_PAYMENTS_ALLOWED_STEAM_IDS_SET.has(input.buyerSteamId)
  ) {
    return null;
  }

  const provider = resolveProvider(input.providerId);
  if (!provider) return null;

  const session = await provider.createSession({
    orderId: input.orderId,
    amountMinor: input.amountMinor,
    currency: input.currency,
    description: input.description,
    imageUrl: input.imageUrl,
    buyerEmail: input.buyerEmail,
    successUrl: buildSuccessUrl(input.orderId),
    cancelUrl: buildCancelUrl(input.orderId),
  });
  if (!session) return null;

  // Persist provider on the Payment row using the registry's id (Prisma enum
  // values match the registry ids exactly).
  const payment = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      provider: provider.id as PaymentProviderEnum,
      providerSessionId: session.providerSessionId,
      providerPaymentIntentId: session.providerPaymentIntentId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      status: 'PENDING',
    },
  });

  return {
    paymentId: payment.id,
    redirectUrl: session.redirectUrl,
    providerId: provider.id,
    providerSessionId: session.providerSessionId,
  };
};

export interface FinalizeOrderInput {
  orderId: string;
  providerSessionId?: string;
  providerPaymentIntentId?: string;
  buyerEmail?: string;
}

/** Decision made inside the finalize transaction about what happens next. */
type FinalizeOutcome =
  | { kind: 'none' }
  | { kind: 'buy_and_dispatch'; orderId: string }
  | { kind: 'merchant_webhook'; webhookId: string };

/**
 * Mark an order as PAID and start fulfilment. Idempotent: a no-op if the order
 * is already PAID/FULFILLED.
 *
 * Routing on PAID is based on the merchant the order belongs to:
 *   - Internal merchant (the rustsupply storefront): fulfilment is the
 *     buy-and-dispatch worker that buys the skin / dispatches from the bot.
 *     Held if the buyer has no Steam trade URL — ops can prompt them.
 *   - External merchant (e.g. cobalt.skin deposit gateway): we don't deliver
 *     anything ourselves; we just notify the merchant via an outbound
 *     HMAC-signed webhook so they can credit their user's balance.
 */
export const finalizeOrderPayment = async (
  input: FinalizeOrderInput,
): Promise<{ buyAndDispatchEnqueued: boolean; merchantWebhookEnqueued: boolean }> => {
  const outcome = await prisma.$transaction(async (tx): Promise<FinalizeOutcome> => {
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
      include: { buyer: true, merchant: true },
    });
    if (!order || order.status === 'PAID' || order.status === 'FULFILLED') {
      return { kind: 'none' };
    }

    if (input.buyerEmail) {
      if (!order.buyerEmail) {
        await tx.order.update({
          where: { id: input.orderId },
          data: { buyerEmail: input.buyerEmail },
        });
      }
      if (order.buyer && !order.buyer.email) {
        await tx.user
          .update({ where: { id: order.buyer.id }, data: { email: input.buyerEmail } })
          .catch(() => undefined);
      }
    }

    // Race-safe state transition: only PENDING_PAYMENT → PAID succeeds. If a
    // concurrent webhook delivery already flipped the row (PSP retry
    // overlapping the original, or two interpreted events for the same order),
    // the updateMany count is 0 and we must NOT enqueue downstream work
    // again — otherwise the worker buys twice / notifies the merchant twice.
    const flipped = await tx.order.updateMany({
      where: { id: input.orderId, status: 'PENDING_PAYMENT' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (flipped.count === 0) return { kind: 'none' };

    // Branch on merchant type. The Order row carries this via the related
    // Merchant.isInternal flag (true for our own storefront, false for
    // external integrators like cobalt.skin).
    if (!order.merchant.isInternal) {
      const meta = (order.metadata ?? {}) as Record<string, unknown>;
      const merchantOrderId = typeof meta.merchantOrderId === 'string' ? meta.merchantOrderId : null;
      const userIdentifier = typeof meta.userIdentifier === 'string' ? meta.userIdentifier : null;
      const merchantMetadata =
        typeof meta.merchantMetadata === 'object' && meta.merchantMetadata !== null
          ? meta.merchantMetadata
          : null;

      // Build the canonical payload here. The worker that delivers it can
      // sign with a fresh timestamp on each retry, but the payload body
      // itself is frozen so the merchant gets a consistent message across
      // retries (and can dedupe by eventId).
      const eventId = `evt_${cuidish()}`;
      const payload = {
        event: 'session.paid' as const,
        event_id: eventId,
        session_id: order.id,
        merchant_order_id: merchantOrderId,
        amount_minor: order.totalAmountMinor,
        currency: order.currency,
        paid_at: new Date().toISOString(),
        user_identifier: userIdentifier,
        metadata: merchantMetadata,
      };

      const webhook = await tx.merchantOutboundWebhook.create({
        data: {
          merchantId: order.merchantId,
          orderId: order.id,
          eventId,
          eventType: 'session.paid',
          payload,
        },
      });

      return { kind: 'merchant_webhook', webhookId: webhook.id };
    }

    // Internal-storefront flow: enqueue buy-and-dispatch only when the buyer
    // has a Steam trade URL. Without it the bot can't deliver, so we leave
    // the Order in PAID and surface a prompt in the UI.
    if (order.buyer?.tradeUrl) {
      return { kind: 'buy_and_dispatch', orderId: input.orderId };
    }
    return { kind: 'none' };
  });

  // Outside the transaction so a BullMQ enqueue failure doesn't roll back
  // the PAID state. Worst case: order is PAID but the job didn't enqueue —
  // ops can replay manually via a script.
  if (outcome.kind === 'buy_and_dispatch') {
    await enqueueBuyAndDispatch(outcome.orderId);
    return { buyAndDispatchEnqueued: true, merchantWebhookEnqueued: false };
  }
  if (outcome.kind === 'merchant_webhook') {
    await enqueueMerchantWebhook(outcome.webhookId);
    return { buyAndDispatchEnqueued: false, merchantWebhookEnqueued: true };
  }
  return { buyAndDispatchEnqueued: false, merchantWebhookEnqueued: false };
};

// Cuid-ish identifier without pulling another dep. The merchant doesn't see
// our DB-row id (that's `MerchantOutboundWebhook.id`), they see the public
// `eventId` we put in the payload + the X-Event-Id header.
function cuidish(): string {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10)
  );
}

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

/** Mark all Payments matching the provider's payment_intent as REFUNDED. */
export const markPaymentRefunded = async (providerPaymentIntentId: string): Promise<void> => {
  await prisma.payment.updateMany({
    where: { providerPaymentIntentId },
    data: { status: 'REFUNDED' },
  });
};
