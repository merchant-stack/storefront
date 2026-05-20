// Shared Redis client for the api process. Used for OpenID nonce replay
// protection, future rate-limit store, etc.
import { Redis } from 'ioredis';
import { env } from '../env.js';

let cached: Redis | null = null;

export const getRedis = (): Redis => {
  if (!cached) {
    cached = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
  }
  return cached;
};
