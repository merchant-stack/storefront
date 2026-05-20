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
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  COOKIE_SECRET: z.string().min(32),
  STEAM_API_KEY: optionalNonEmpty,
  STRIPE_SECRET_KEY: optionalNonEmpty,
  STRIPE_WEBHOOK_SECRET: optionalNonEmpty,
  MOCK_PAYMENTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  DMARKET_PUBLIC_KEY: optionalNonEmpty,
  DMARKET_SECRET_KEY: optionalNonEmpty,
  DMARKET_BASE_URL: z.string().url().default('https://api.dmarket.com'),
  DMARKET_DEFAULT_MARKUP_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
  // Soft cap on what we'll actually fulfil. Items priced above this are still
  // shown on the storefront but can't be purchased yet — we display a
  // "restocking" message. Raise (in cents) as bot balance + ops confidence grows.
  MAX_BUY_PRICE_MINOR: z.coerce.number().int().positive().default(500),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
