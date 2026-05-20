import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env.local') });

const optionalNonEmpty = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(1).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  STEAM_BOT_USERNAME: optionalNonEmpty,
  STEAM_BOT_PASSWORD: optionalNonEmpty,
  STEAM_BOT_SHARED_SECRET: optionalNonEmpty,
  STEAM_BOT_IDENTITY_SECRET: optionalNonEmpty,
  DMARKET_PUBLIC_KEY: optionalNonEmpty,
  DMARKET_SECRET_KEY: optionalNonEmpty,
  DMARKET_BASE_URL: z.string().url().default('https://api.dmarket.com'),
  DMARKET_DEFAULT_MARKUP_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
  WAXPEER_API_KEY: optionalNonEmpty,
  DMARKET_SYNC_LIMIT: z.coerce.number().int().positive().default(60),
  DMARKET_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(5 * 60 * 1000),
  STRIPE_SECRET_KEY: optionalNonEmpty,
  MOCK_PAYMENTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(4001),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
