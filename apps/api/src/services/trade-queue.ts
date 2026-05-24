import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';

const TRADE_DISPATCH_QUEUE = 'trade-dispatch';
const BUY_AND_DISPATCH_QUEUE = 'buy-and-dispatch';
const MERCHANT_WEBHOOK_QUEUE = 'merchant-webhook';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

interface TradeDispatchJob {
  tradeId: string;
}

interface BuyAndDispatchJob {
  orderId: string;
}

interface MerchantWebhookJob {
  webhookId: string;
}

const tradeQueue = new Queue<TradeDispatchJob>(TRADE_DISPATCH_QUEUE, { connection });
const buyQueue = new Queue<BuyAndDispatchJob>(BUY_AND_DISPATCH_QUEUE, { connection });
const merchantWebhookQueue = new Queue<MerchantWebhookJob>(MERCHANT_WEBHOOK_QUEUE, { connection });

export const enqueueTradeDispatch = async (tradeId: string): Promise<void> => {
  await tradeQueue.add(
    'dispatch',
    { tradeId },
    {
      jobId: `trade_${tradeId}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );
};

export const enqueueBuyAndDispatch = async (orderId: string): Promise<void> => {
  await buyQueue.add(
    'buy',
    { orderId },
    {
      jobId: `buy_${orderId}`,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );
};

/**
 * Enqueue delivery of an outbound merchant webhook (e.g. "session.paid"
 * notification to cobalt.skin). The webhook row in the DB carries the signed
 * payload + retry state; the worker just dispatches.
 */
export const enqueueMerchantWebhook = async (webhookId: string): Promise<void> => {
  await merchantWebhookQueue.add(
    'deliver',
    { webhookId },
    {
      jobId: `mwh_${webhookId}`,
      // Initial enqueue. Long-tail retries are scheduled by the worker
      // itself with explicit delays (5m, 15m, 1h, 6h, 24h) — we don't use
      // BullMQ's automatic retry because we want the backoff to be visible
      // and queryable in the DB row.
      attempts: 1,
      removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
      removeOnFail: { age: 60 * 60 * 24 * 7 },
    },
  );
};
