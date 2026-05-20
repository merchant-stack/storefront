// Enqueue a fresh dmarket-sync job so we don't wait for the next 5-minute tick.
import '../env.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '../env.js';

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue('dmarket-sync', { connection });

await queue.add(
  'manual-trigger',
  { gameId: 'rust' },
  { removeOnComplete: true, removeOnFail: 5 },
);
console.log('Sync job enqueued');
await queue.close();
await connection.quit();
