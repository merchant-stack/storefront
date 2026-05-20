import type { FastifyInstance } from 'fastify';
import type Stripe from 'stripe';
import { prisma } from '@rustskinpay/db';
import { verifyWebhookEvent } from '../services/stripe.js';
import { cancelOrderPayment, finalizeOrderPayment } from '../services/payments.js';

export const registerWebhookRoutes = (server: FastifyInstance): void => {
  /**
   * Stripe webhook handler.
   *
   * Stripe signs every webhook with STRIPE_WEBHOOK_SECRET. We verify the signature
   * against the *raw* request body (Fastify-style: see config.rawBody below). If
   * verification fails we 400 — Stripe will retry with backoff.
   *
   * We persist a WebhookEvent row keyed by (provider, providerEventId) for
   * idempotency: if Stripe sends the same event twice we recognise it and skip.
   */
  server.post(
    '/api/webhooks/stripe',
    {
      config: { rawBody: true },
    },
    async (request, reply) => {
      const signature = request.headers['stripe-signature'];
      const sigHeader = Array.isArray(signature) ? signature[0] : signature;

      const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
      if (!rawBody) {
        return reply.code(400).send({ error: 'missing_raw_body' });
      }

      const event = verifyWebhookEvent(rawBody, sigHeader);
      if (!event) {
        return reply.code(400).send({ error: 'invalid_signature' });
      }

      // Idempotency check
      const seen = await prisma.webhookEvent.findUnique({
        where: { provider_providerEventId: { provider: 'STRIPE', providerEventId: event.id } },
      });
      if (seen?.processed) {
        return reply.code(200).send({ received: true, duplicate: true });
      }

      const stored = seen
        ? seen
        : await prisma.webhookEvent.create({
            data: {
              provider: 'STRIPE',
              providerEventId: event.id,
              eventType: event.type,
              signatureValid: true,
              rawPayload: event as unknown as object,
            },
          });

      try {
        await handleStripeEvent(event);
        await prisma.webhookEvent.update({
          where: { id: stored.id },
          data: { processed: true, processedAt: new Date() },
        });
      } catch (err) {
        request.log.error({ err, eventId: event.id }, 'failed to process stripe event');
        await prisma.webhookEvent.update({
          where: { id: stored.id },
          data: { errorMessage: err instanceof Error ? err.message : String(err) },
        });
        return reply.code(500).send({ error: 'processing_failed' });
      }

      return reply.code(200).send({ received: true });
    },
  );
};

const handleStripeEvent = async (event: Stripe.Event): Promise<void> => {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (!orderId) return;
      const buyerEmail =
        session.customer_details?.email ?? session.customer_email ?? undefined;
      await finalizeOrderPayment({
        orderId,
        providerSessionId: session.id,
        providerPaymentIntentId:
          typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        buyerEmail,
      });
      break;
    }
    case 'checkout.session.expired':
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;
      if (!orderId) return;
      await cancelOrderPayment({ orderId, providerSessionId: session.id });
      break;
    }
    case 'charge.refunded': {
      const charge = event.data.object;
      const paymentIntent =
        typeof charge.payment_intent === 'string' ? charge.payment_intent : null;
      if (!paymentIntent) return;
      await prisma.payment.updateMany({
        where: { providerPaymentIntentId: paymentIntent },
        data: { status: 'REFUNDED' },
      });
      break;
    }
    default:
      // No-op for events we don't care about (yet).
      break;
  }
};
