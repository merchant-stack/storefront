// Deliver an outbound merchant webhook (e.g. session.paid → cobalt.skin).
//
// Each row in MerchantOutboundWebhook represents one delivery objective with
// a frozen JSON payload. The worker signs the payload at attempt time with a
// fresh timestamp, POSTs it to the merchant's webhook URL, and either marks
// DELIVERED on 2xx or schedules the next retry per the backoff schedule.
//
// The retry schedule is fixed (5min, 15min, 1h, 6h, 24h) and lives in code
// rather than relying on BullMQ's automatic retry-with-backoff, because we
// want the delivery timeline to be visible+queryable from the DB row's
// `attempts` / `lastAttemptAt` columns and resumable across worker restarts.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { signWebhook } from '@rustskinpay/shared/merchant-hmac';
import { env } from '../env.js';
import { merchantWebhookQueue, type MerchantWebhookJobData } from '../queue.js';

const log = pino({ name: 'merchant-webhook' });

/** Delays between attempts, in ms. Index N is the wait BEFORE attempt N+2 (since attempt 1 fires immediately on enqueue). */
const RETRY_DELAYS_MS: number[] = [
  5 * 60 * 1000, // 5 min  → 2nd attempt
  15 * 60 * 1000, // 15 min → 3rd attempt
  60 * 60 * 1000, // 1 hour → 4th attempt
  6 * 60 * 60 * 1000, // 6 hours → 5th attempt
  24 * 60 * 60 * 1000, // 24 hours → 6th (final) attempt
];

const DELIVERY_TIMEOUT_MS = 10_000;

interface MerchantSecrets {
  webhookUrl: string;
  webhookSecret: string;
}

function resolveSecrets(merchantId: string): MerchantSecrets | null {
  // Phase 1 single-merchant: cobalt.skin. Keys live in env vars; if either is
  // missing we can't deliver and have to defer (rather than mark FAILED) so
  // an ops fix-up lets the queued webhook drain.
  if (merchantId !== 'm_cobalt_skin') return null;
  if (!env.MERCHANT_COBALT_WEBHOOK_URL || !env.MERCHANT_COBALT_WEBHOOK_SECRET) return null;
  return {
    webhookUrl: env.MERCHANT_COBALT_WEBHOOK_URL,
    webhookSecret: env.MERCHANT_COBALT_WEBHOOK_SECRET,
  };
}

export async function deliverMerchantWebhook(job: Job<MerchantWebhookJobData>): Promise<void> {
  const { webhookId } = job.data;

  const webhook = await prisma.merchantOutboundWebhook.findUnique({ where: { id: webhookId } });
  if (!webhook) {
    log.warn({ webhookId }, 'webhook row missing — dropping job');
    return;
  }
  if (webhook.status !== 'PENDING') {
    log.info({ webhookId, status: webhook.status }, 'webhook already terminal — skipping');
    return;
  }

  const secrets = resolveSecrets(webhook.merchantId);
  if (!secrets) {
    // Configuration error on our side. Defer indefinitely so an ops fix
    // (set env var → restart worker) lets the queued webhook drain.
    log.error(
      { webhookId, merchantId: webhook.merchantId },
      'merchant webhook secrets not configured — deferring 1h',
    );
    await prisma.merchantOutboundWebhook.update({
      where: { id: webhook.id },
      data: { lastError: 'config_missing', lastAttemptAt: new Date() },
    });
    await scheduleRetry(webhookId, 60 * 60 * 1000); // 1h
    return;
  }

  const attempt = webhook.attempts + 1;
  // Serialise the payload identically on every attempt so the merchant sees
  // a stable body across retries; the dynamic part is just the timestamp +
  // signature in headers.
  const body = JSON.stringify(webhook.payload);
  const signed = signWebhook({
    secret: secrets.webhookSecret,
    eventId: webhook.eventId,
    body,
  });

  let statusCode: number | null = null;
  let networkError: string | null = null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const res = await fetch(secrets.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Event-Id': signed.eventId,
          'X-Timestamp': signed.timestamp,
          'X-Signature': signed.signature,
          'User-Agent': 'RustSupply-Webhook/1.0',
        },
        body,
        signal: controller.signal,
      });
      statusCode = res.status;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err);
  }

  const succeeded = statusCode !== null && statusCode >= 200 && statusCode < 300;

  if (succeeded) {
    await prisma.merchantOutboundWebhook.update({
      where: { id: webhook.id },
      data: {
        status: 'DELIVERED',
        attempts: attempt,
        lastStatusCode: statusCode,
        lastAttemptAt: new Date(),
        deliveredAt: new Date(),
        lastError: null,
      },
    });
    log.info(
      { webhookId, eventId: webhook.eventId, attempt, statusCode },
      'merchant webhook delivered',
    );
    return;
  }

  const errorSummary =
    networkError ?? (statusCode !== null ? `http_${statusCode}` : 'unknown_failure');

  // Out of retries? Mark permanently failed and surface to AuditLog so ops
  // can replay manually if needed.
  if (attempt > RETRY_DELAYS_MS.length) {
    await prisma.merchantOutboundWebhook.update({
      where: { id: webhook.id },
      data: {
        status: 'FAILED',
        attempts: attempt,
        lastStatusCode: statusCode,
        lastError: errorSummary,
        lastAttemptAt: new Date(),
      },
    });
    await prisma.auditLog
      .create({
        data: {
          actorType: 'SYSTEM',
          action: 'merchant_webhook.exhausted',
          entityType: 'MerchantOutboundWebhook',
          entityId: webhook.id,
          metadata: {
            eventId: webhook.eventId,
            merchantId: webhook.merchantId,
            orderId: webhook.orderId,
            attempts: attempt,
            lastStatusCode: statusCode,
            lastError: errorSummary,
          },
        },
      })
      .catch((err) => log.warn({ err }, 'audit log write failed'));
    log.error(
      { webhookId, eventId: webhook.eventId, attempt, statusCode, errorSummary },
      'merchant webhook exhausted retries',
    );
    return;
  }

  // Schedule next retry.
  const nextDelay = RETRY_DELAYS_MS[attempt - 1]!;
  await prisma.merchantOutboundWebhook.update({
    where: { id: webhook.id },
    data: {
      attempts: attempt,
      lastStatusCode: statusCode,
      lastError: errorSummary,
      lastAttemptAt: new Date(),
    },
  });
  await scheduleRetry(webhookId, nextDelay);
  log.warn(
    { webhookId, eventId: webhook.eventId, attempt, statusCode, errorSummary, nextDelay },
    'merchant webhook attempt failed — retry scheduled',
  );
}

async function scheduleRetry(webhookId: string, delayMs: number): Promise<void> {
  await merchantWebhookQueue.add(
    'deliver',
    { webhookId },
    {
      jobId: `mwh_${webhookId}_retry_${Date.now()}`,
      delay: delayMs,
      attempts: 1,
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );
}
