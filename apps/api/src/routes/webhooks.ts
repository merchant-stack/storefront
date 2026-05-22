import type { FastifyInstance } from 'fastify';
import { prisma } from '@rustskinpay/db';
import type { PaymentProvider as PaymentProviderEnum } from '@rustskinpay/db';
import {
  cancelOrderPayment,
  finalizeOrderPayment,
  getPaymentRegistry,
  markPaymentRefunded,
} from '../services/payments.js';

/**
 * Generic webhook endpoint. The provider is named in the URL path. Every
 * provider implementation owns its signature verification + event translation
 * via the PaymentProvider interface; the route only deals with idempotency,
 * persistence, and dispatch to the orchestrator.
 *
 * Adding a new provider's webhook is automatic — once the provider is in the
 * registry, the matching /api/webhooks/:provider URL starts accepting events.
 */
export const registerWebhookRoutes = (server: FastifyInstance): void => {
  server.post(
    '/api/webhooks/:provider',
    { config: { rawBody: true } },
    async (request, reply) => {
      const { provider: providerParam } = request.params as { provider: string };
      const providerId = providerParam.toUpperCase();
      const provider = getPaymentRegistry().get(providerId);
      if (!provider) {
        return reply.code(404).send({ error: 'unknown_provider' });
      }

      const rawBody = (request as unknown as { rawBody?: string | Buffer }).rawBody;
      if (!rawBody) {
        return reply.code(400).send({ error: 'missing_raw_body' });
      }

      const envelope = provider.verifyWebhook({
        rawBody,
        headers: request.headers,
      });
      if (!envelope) {
        // Diagnostic logging — print header names + signature shape so we can
        // diff against the provider's actual delivery format when verification
        // fails. Values are intentionally truncated to avoid logging secrets.
        request.log.warn(
          {
            provider: provider.id,
            headerNames: Object.keys(request.headers),
            signatureHeader: shorten(headerValue(request.headers, 'webhook-signature')),
            whopSignature: shorten(headerValue(request.headers, 'whop-signature')),
            xWhopSignature: shorten(headerValue(request.headers, 'x-whop-signature')),
            timestamp: headerValue(request.headers, 'webhook-timestamp'),
            id: headerValue(request.headers, 'webhook-id'),
            bodyLength: typeof rawBody === 'string' ? rawBody.length : rawBody.length,
            bodyPrefix: shorten(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'), 200),
          },
          'webhook signature verification failed',
        );
        return reply.code(400).send({ error: 'invalid_signature' });
      }

      // Idempotency check keyed by (provider, providerEventId). A duplicate
      // delivery (the provider retried) short-circuits here.
      const seen = await prisma.webhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: provider.id as PaymentProviderEnum,
            providerEventId: envelope.eventId,
          },
        },
      });
      if (seen?.processed) {
        return reply.code(200).send({ received: true, duplicate: true });
      }

      const stored =
        seen ??
        (await prisma.webhookEvent.create({
          data: {
            provider: provider.id as PaymentProviderEnum,
            providerEventId: envelope.eventId,
            eventType: envelope.eventType,
            signatureValid: true,
            rawPayload: envelope.parsed as object,
          },
        }));

      try {
        const interpreted = provider.interpretEvent(envelope);
        if (interpreted) {
          switch (interpreted.kind) {
            case 'payment_succeeded':
              await finalizeOrderPayment({
                orderId: interpreted.orderId,
                providerSessionId: interpreted.providerSessionId,
                providerPaymentIntentId: interpreted.providerPaymentIntentId,
                buyerEmail: interpreted.buyerEmail,
              });
              break;
            case 'payment_cancelled':
            case 'payment_failed':
              await cancelOrderPayment({
                orderId: interpreted.orderId,
                providerSessionId: interpreted.providerSessionId,
              });
              break;
            case 'refunded':
              await markPaymentRefunded(interpreted.providerPaymentIntentId);
              break;
          }
        }
        await prisma.webhookEvent.update({
          where: { id: stored.id },
          data: { processed: true, processedAt: new Date() },
        });
      } catch (err) {
        request.log.error(
          { err, provider: provider.id, eventId: envelope.eventId },
          'failed to process webhook event',
        );
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

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function shorten(value: string | null, max = 80): string | null {
  if (!value) return value;
  return value.length <= max ? value : `${value.slice(0, max)}…[${value.length}]`;
}
