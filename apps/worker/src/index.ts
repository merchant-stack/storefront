import pino from 'pino';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './env.js';
import {
  TRADE_DISPATCH_QUEUE,
  DMARKET_SYNC_QUEUE,
  BUY_AND_DISPATCH_QUEUE,
  dmarketSyncQueue,
  type TradeDispatchJob,
  type SyncDMarketJobData,
  type BuyAndDispatchJobData,
} from './queue.js';
import { dispatchTrade } from './jobs/dispatch-trade.js';
import { syncDMarket } from './jobs/sync-dmarket.js';
import { buyAndDispatch } from './jobs/buy-and-dispatch.js';
import { jobsProcessed, startHealthServer, stopHealthServer } from './health-server.js';

const log = pino({
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
});

log.info({ env: env.NODE_ENV }, 'rustskinpay-worker starting');

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const tradeWorker = new Worker<TradeDispatchJob>(
  TRADE_DISPATCH_QUEUE,
  async (job) => {
    log.info({ jobId: job.id, tradeId: job.data.tradeId }, 'processing trade dispatch');
    await dispatchTrade(job);
  },
  { connection, concurrency: 2 },
);

const dmarketSyncWorker = new Worker<SyncDMarketJobData>(
  DMARKET_SYNC_QUEUE,
  async (job) => {
    log.info({ jobId: job.id, gameId: job.data.gameId }, 'processing dmarket sync');
    await syncDMarket(job);
  },
  { connection, concurrency: 1 },
);

const buyAndDispatchWorker = new Worker<BuyAndDispatchJobData>(
  BUY_AND_DISPATCH_QUEUE,
  async (job) => {
    log.info({ jobId: job.id, orderId: job.data.orderId }, 'processing buy-and-dispatch');
    await buyAndDispatch(job);
  },
  { connection, concurrency: 2 },
);

for (const w of [tradeWorker, dmarketSyncWorker, buyAndDispatchWorker]) {
  w.on('completed', (job) => {
    log.info({ queue: w.name, jobId: job.id }, 'job completed');
    jobsProcessed.inc({ queue: w.name, outcome: 'success' });
  });
  w.on('failed', (job, err) => {
    log.error({ queue: w.name, jobId: job?.id, err }, 'job failed');
    jobsProcessed.inc({ queue: w.name, outcome: 'failed' });
  });
}

startHealthServer(env.WORKER_HEALTH_PORT);
log.info({ port: env.WORKER_HEALTH_PORT }, 'health server listening');

async function scheduleRecurring(): Promise<void> {
  const repeatables = await dmarketSyncQueue.getRepeatableJobs();
  for (const r of repeatables) {
    await dmarketSyncQueue.removeRepeatableByKey(r.key);
  }
  await dmarketSyncQueue.add(
    'rust-sync',
    { gameId: 'rust', limit: env.DMARKET_SYNC_LIMIT },
    {
      repeat: { every: env.DMARKET_SYNC_INTERVAL_MS },
      jobId: 'rust-sync-recurring',
      removeOnComplete: 50,
      removeOnFail: 50,
    },
  );
  await dmarketSyncQueue.add(
    'rust-sync-initial',
    { gameId: 'rust', limit: env.DMARKET_SYNC_LIMIT },
    { removeOnComplete: true, removeOnFail: 10 },
  );
  log.info({ intervalMs: env.DMARKET_SYNC_INTERVAL_MS }, 'dmarket sync scheduled');
}

scheduleRecurring().catch((err) => log.error({ err }, 'failed to schedule recurring sync'));

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, 'shutdown signal received');
  await stopHealthServer();
  await Promise.all([
    tradeWorker.close(),
    dmarketSyncWorker.close(),
    buyAndDispatchWorker.close(),
  ]);
  await connection.quit();
  process.exit(0);
};

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
