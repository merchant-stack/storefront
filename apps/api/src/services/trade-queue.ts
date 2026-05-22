import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';

const TRADE_DISPATCH_QUEUE = 'trade-dispatch';
const BUY_AND_DISPATCH_QUEUE = 'buy-and-dispatch';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

interface TradeDispatchJob {
  tradeId: string;
}

interface BuyAndDispatchJob {
  orderId: string;
}

const tradeQueue = new Queue<TradeDispatchJob>(TRADE_DISPATCH_QUEUE, { connection });
const buyQueue = new Queue<BuyAndDispatchJob>(BUY_AND_DISPATCH_QUEUE, { connection });

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
