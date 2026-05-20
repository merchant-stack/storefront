import Stripe from 'stripe';
import { env } from '../env.js';

let cached: Stripe | null = null;

/**
 * Get a singleton Stripe SDK client. Returns null if STRIPE_SECRET_KEY isn't
 * configured — calling code must check and degrade gracefully (the app should
 * still boot without Stripe keys so dev work on unrelated features isn't blocked).
 */
export const getStripe = (): Stripe | null => {
  if (cached) return cached;
  if (!env.STRIPE_SECRET_KEY) return null;
  cached = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  return cached;
};

export interface CreateCheckoutSessionParams {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  imageUrl?: string;
  successUrl: string;
  cancelUrl: string;
  buyerEmail?: string;
}

/**
 * Create a Stripe Checkout Session for a single line item.
 *
 * We use Checkout Sessions (Stripe-hosted page) rather than Payment Elements
 * so we don't have to load Stripe.js on our pages and there is zero PCI surface
 * on our side. Stripe redirects the buyer to successUrl on completion.
 */
export const createCheckoutSession = async (
  params: CreateCheckoutSessionParams,
): Promise<{ id: string; url: string } | null> => {
  const stripe = getStripe();
  if (!stripe) return null;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency.toLowerCase(),
          unit_amount: params.amountMinor,
          product_data: {
            name: params.description,
            ...(params.imageUrl ? { images: [params.imageUrl] } : {}),
          },
        },
      },
    ],
    metadata: { orderId: params.orderId },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    ...(params.buyerEmail ? { customer_email: params.buyerEmail } : {}),
    payment_intent_data: {
      metadata: { orderId: params.orderId },
    },
  });

  if (!session.url) return null;
  return { id: session.id, url: session.url };
};

/**
 * Verify a Stripe webhook signature and parse the event. Returns null on
 * any verification failure — callers must NOT process unverified events.
 */
export const verifyWebhookEvent = (
  rawBody: string | Buffer,
  signature: string | undefined,
): Stripe.Event | null => {
  const stripe = getStripe();
  if (!stripe || !signature || !env.STRIPE_WEBHOOK_SECRET) return null;
  try {
    return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return null;
  }
};
