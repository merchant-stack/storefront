import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './env.js';

export const TRADE_DISPATCH_QUEUE = 'trade-dispatch';
export const DMARKET_SYNC_QUEUE = 'dmarket-sync';
export const BUY_AND_DISPATCH_QUEUE = 'buy-and-dispatch';

export interface TradeDispatchJob {
  tradeId: string;
}

export interface SyncDMarketJobData {
  gameId?: string;
  limit?: number;
}

export interface BuyAndDispatchJobData {
  orderId: string;
}

export const queueConnection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const tradeDispatchQueue = new Queue<TradeDispatchJob>(TRADE_DISPATCH_QUEUE, {
  connection: queueConnection,
});

export const dmarketSyncQueue = new Queue<SyncDMarketJobData>(DMARKET_SYNC_QUEUE, {
  connection: queueConnection,
});

export const buyAndDispatchQueue = new Queue<BuyAndDispatchJobData>(BUY_AND_DISPATCH_QUEUE, {
  connection: queueConnection,
});
