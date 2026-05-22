import pino from 'pino';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from './env.js';
import {
  TRADE_DISPATCH_QUEUE,
  DMARKET_SYNC_QUEUE,
  BUY_AND_DISPATCH_QUEUE,
  POLL_TRADE_STATUS_QUEUE,
  dmarketSyncQueue,
  pollTradeStatusQueue,
  type TradeDispatchJob,
  type SyncDMarketJobData,
  type BuyAndDispatchJobData,
  type PollTradeStatusJobData,
} from './queue.js';
import { dispatchTrade } from './jobs/dispatch-trade.js';
import { syncDMarket } from './jobs/sync-dmarket.js';
import { buyAndDispatch } from './jobs/buy-and-dispatch.js';
import { pollTradeStatus } from './jobs/poll-trade-status.js';
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

// Single-instance worker — a polling tick reads the same Trade rows, so we
// don't want parallel processors fighting over them. Updates are race-safe
// (conditional updateMany) but parallelism would burn Waxpeer API calls.
const pollTradeStatusWorker = new Worker<PollTradeStatusJobData>(
  POLL_TRADE_STATUS_QUEUE,
  async (job) => {
    await pollTradeStatus(job);
  },
  { connection, concurrency: 1 },
);

for (const w of [tradeWorker, dmarketSyncWorker, buyAndDispatchWorker, pollTradeStatusWorker]) {
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

/**
 * Set up the repeatable rust-sync job. Wrapped in a Redis SETNX lock so that
 * during a rolling restart (two worker pods alive briefly), only one rewrites
 * the repeat schedule. Without the lock the worse-case is a stretch of double
 * syncs while one of the workers' jobs hadn't yet been removed by the other —
 * not catastrophic but wasteful and visible in logs as duplicate runs. Lock
 * TTL is intentionally short so a crashed worker doesn't keep the slot.
 */
async function scheduleRecurring(): Promise<void> {
  const SCHEDULE_LOCK_KEY = 'rustskinpay:worker:schedule-lock';
  const SCHEDULE_LOCK_TTL_SECONDS = 60;
  const acquired = await connection.set(
    SCHEDULE_LOCK_KEY,
    process.pid.toString(),
    'EX',
    SCHEDULE_LOCK_TTL_SECONDS,
    'NX',
  );
  if (acquired !== 'OK') {
    log.info('another worker holds the schedule lock; skipping repeat-job setup');
    return;
  }

  try {
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

    const pollRepeatables = await pollTradeStatusQueue.getRepeatableJobs();
    for (const r of pollRepeatables) {
      await pollTradeStatusQueue.removeRepeatableByKey(r.key);
    }
    await pollTradeStatusQueue.add(
      'tick',
      {},
      {
        repeat: { every: env.POLL_TRADE_STATUS_INTERVAL_MS },
        jobId: 'poll-trade-status-recurring',
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    log.info({ intervalMs: env.POLL_TRADE_STATUS_INTERVAL_MS }, 'poll-trade-status scheduled');
  } finally {
    // Drop the lock only if we still own it (TTL would clear it anyway on
    // crash). Best-effort: any failure here is harmless because the TTL is
    // short enough that the next restart will succeed.
    const current = await connection.get(SCHEDULE_LOCK_KEY);
    if (current === process.pid.toString()) {
      await connection.del(SCHEDULE_LOCK_KEY);
    }
  }
}

scheduleRecurring().catch((err) => log.error({ err }, 'failed to schedule recurring sync'));

const shutdown = async (signal: string): Promise<void> => {
  log.info({ signal }, 'shutdown signal received');
  await stopHealthServer();
  await Promise.all([
    tradeWorker.close(),
    dmarketSyncWorker.close(),
    buyAndDispatchWorker.close(),
    pollTradeStatusWorker.close(),
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
