// Stripe implementation of the PaymentProvider interface.
//
// All Stripe-specific bits live here. The rest of the codebase only sees the
// abstract interface in ./types.ts. To replace Stripe with another card
// provider, write a sibling file (e.g. ./checkout-com.ts) and register it in
// ./registry.ts — nothing else changes.

import Stripe from 'stripe';
import type {
  CreateSessionInput,
  CreateSessionResult,
  InterpretedEvent,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEnvelope,
  WebhookVerifyInput,
} from './types.js';

export interface StripeProviderConfig {
  secretKey: string | undefined;
  webhookSecret: string | undefined;
}

const STRIPE_API_VERSION: Stripe.StripeConfig['apiVersion'] = '2025-02-24.acacia';

export function createStripeProvider(config: StripeProviderConfig): PaymentProvider {
  let client: Stripe | null = null;
  const getClient = (): Stripe | null => {
    if (client) return client;
    if (!config.secretKey) return null;
    client = new Stripe(config.secretKey, {
      apiVersion: STRIPE_API_VERSION,
      typescript: true,
    });
    return client;
  };

  return {
    id: 'STRIPE',
    displayName: 'Card (Stripe)',

    isEnabled(): boolean {
      // Treat the provider as enabled only when both keys are present. Without
      // the webhook secret we cannot safely accept callbacks, so we refuse
      // session creation up front.
      return Boolean(config.secretKey && config.webhookSecret);
    },

    supportsRefunds(): boolean {
      return true;
    },

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult | null> {
      const stripe = getClient();
      if (!stripe) return null;

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountMinor,
              product_data: {
                name: input.description,
                ...(input.imageUrl ? { images: [input.imageUrl] } : {}),
              },
            },
          },
        ],
        metadata: { orderId: input.orderId },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        ...(input.buyerEmail ? { customer_email: input.buyerEmail } : {}),
        payment_intent_data: {
          metadata: { orderId: input.orderId },
        },
      });

      if (!session.url) return null;
      return {
        providerSessionId: session.id,
        providerPaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        redirectUrl: session.url,
      };
    },

    verifyWebhook(input: WebhookVerifyInput): WebhookEnvelope | null {
      const stripe = getClient();
      if (!stripe || !config.webhookSecret) return null;
      const sigHeader = input.headers['stripe-signature'];
      const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      if (!signature) return null;
      try {
        const event = stripe.webhooks.constructEvent(
          input.rawBody,
          signature,
          config.webhookSecret,
        );
        return { eventId: event.id, eventType: event.type, parsed: event };
      } catch {
        return null;
      }
    },

    interpretEvent(envelope: WebhookEnvelope): InterpretedEvent | null {
      const event = envelope.parsed as Stripe.Event;
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const orderId = session.metadata?.orderId;
          if (!orderId) return null;
          return {
            kind: 'payment_succeeded',
            orderId,
            providerSessionId: session.id,
            providerPaymentIntentId:
              typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
            buyerEmail: session.customer_details?.email ?? session.customer_email ?? undefined,
          };
        }
        case 'checkout.session.expired':
        case 'checkout.session.async_payment_failed': {
          const session = event.data.object;
          const orderId = session.metadata?.orderId;
          if (!orderId) return null;
          return {
            kind: event.type === 'checkout.session.expired' ? 'payment_cancelled' : 'payment_failed',
            orderId,
            providerSessionId: session.id,
          };
        }
        case 'charge.refunded': {
          const charge = event.data.object;
          const paymentIntent =
            typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
          if (!paymentIntent) return null;
          return { kind: 'refunded', providerPaymentIntentId: paymentIntent };
        }
        default:
          return null;
      }
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      const stripe = getClient();
      if (!stripe) {
        return { status: 'manual_required', reason: 'stripe_not_configured' };
      }
      try {
        const refund = await stripe.refunds.create({
          payment_intent: input.providerPaymentIntentId,
          ...(input.amountMinor !== undefined ? { amount: input.amountMinor } : {}),
          metadata: { orderId: input.orderId, reason: input.reason },
        });
        return { status: 'refunded', refundId: refund.id };
      } catch (err) {
        return {
          status: 'manual_required',
          reason: err instanceof Error ? err.message : 'unknown_error',
        };
      }
    },
  };
}
