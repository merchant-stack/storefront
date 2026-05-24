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
  // Used by the payment-provider registry only — worker never serves HTTP
  // back to buyers, so a default suffices for shapes that still ask for it.
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  STEAM_BOT_USERNAME: optionalNonEmpty,
  STEAM_BOT_PASSWORD: optionalNonEmpty,
  STEAM_BOT_SHARED_SECRET: optionalNonEmpty,
  STEAM_BOT_IDENTITY_SECRET: optionalNonEmpty,
  DMARKET_PUBLIC_KEY: optionalNonEmpty,
  DMARKET_SECRET_KEY: optionalNonEmpty,
  DMARKET_BASE_URL: z.string().url().default('https://api.dmarket.com'),
  DMARKET_DEFAULT_MARKUP_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
  WAXPEER_API_KEY: optionalNonEmpty,
  RUSTTM_API_KEY: optionalNonEmpty,
  DMARKET_SYNC_LIMIT: z.coerce.number().int().positive().default(60),
  // 2-minute sync interval keeps the catalog tight enough that the api's
  // 4-minute staleness guard (MAX_LISTING_AGE_SECONDS) has ~2x buffer before
  // it fires. Was 5min — buyers were hitting "listing_stale" on slow clicks.
  DMARKET_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(2 * 60 * 1000),
  // 90s tick — fast enough to react to Steam-trade outcomes within ~p95 of a
  // human's accept window, but 3× less BullMQ chatter than the old 30s tick
  // (which burned through Upstash's 500k/month free quota in ~2 days, 2026-05-23).
  POLL_TRADE_STATUS_INTERVAL_MS: z.coerce.number().int().positive().default(90 * 1000),
  STRIPE_SECRET_KEY: optionalNonEmpty,
  // Whop — worker only needs these for issuing refunds. createSession is
  // api-side. Keep parity with apps/api/src/env.ts so a leaked-half deploy
  // doesn't silently break refunds.
  WHOP_API_KEY: optionalNonEmpty,
  WHOP_WEBHOOK_SECRET: optionalNonEmpty,
  WHOP_COMPANY_ID: optionalNonEmpty,
  WHOP_PRODUCT_ID: optionalNonEmpty,
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
