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
  // Public URL of the API itself, used as the OpenID return_to / realm and
  // anywhere we need to round-trip a redirect through the api. Defaults to
  // a localhost guess for dev. Set explicitly in prod (e.g.
  // https://api.rustskinpay.com).
  API_ORIGIN: z.string().url().default('http://localhost:4000'),
  // Comma-separated extra origins allowed by CORS and the CSRF origin check.
  // Use when www.rustskinpay.com and rustskinpay.com both need to talk to api,
  // or for a Vercel preview deploy URL. WEB_ORIGIN remains the canonical one
  // used for OAuth redirects and Stripe success/cancel URLs.
  CORS_EXTRA_ORIGINS: z.string().default(''),
  COOKIE_SECRET: z.string().min(32),
  // Session cookie SameSite policy. Use 'lax' (default) when web and api share
  // a registrable domain in prod (e.g. rustskinpay.com + api.rustskinpay.com).
  // Use 'none' if they are on entirely different domains; browsers require
  // Secure=true in that case, which we enforce automatically in production.
  SESSION_SAMESITE: z.enum(['lax', 'none']).default('lax'),
  STEAM_API_KEY: optionalNonEmpty,
  STRIPE_SECRET_KEY: optionalNonEmpty,
  STRIPE_WEBHOOK_SECRET: optionalNonEmpty,
  MOCK_PAYMENTS: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // Comma-separated SteamID64 allowlist. When MOCK_PAYMENTS=true in production
  // this MUST be non-empty: only buyers whose Steam ID is on the list can
  // actually trigger checkout / mock-pay. Lets the founder smoke-test the live
  // site end-to-end without exposing free skins to the world.
  MOCK_PAYMENTS_ALLOWED_STEAM_IDS: z.string().default(''),
  DMARKET_PUBLIC_KEY: optionalNonEmpty,
  DMARKET_SECRET_KEY: optionalNonEmpty,
  DMARKET_BASE_URL: z.string().url().default('https://api.dmarket.com'),
  DMARKET_DEFAULT_MARKUP_BPS: z.coerce.number().int().min(0).max(10000).default(1500),
  // Soft cap on what we'll actually fulfil. Items priced above this are still
  // shown on the storefront but can't be purchased yet — we display a
  // "restocking" message. Raise (in cents) as bot balance + ops confidence grows.
  MAX_BUY_PRICE_MINOR: z.coerce.number().int().positive().default(500),
  // Reject checkout if the SourceItem snapshot is older than this. Prevents
  // charging the buyer for a listing that's gone stale between sync cycles.
  // The post-payment refund flow still catches actual buy failures, but this
  // cuts the failure window meaningfully without hitting Waxpeer per click.
  MAX_LISTING_AGE_SECONDS: z.coerce.number().int().positive().default(600),
  // Global kill-switch for the checkout endpoint. When true the site is in
  // browse-only mode: catalog and Steam sign-in still work, the buy button
  // shows "Sales launching soon" on the web, and POST /api/checkout returns
  // 503 with `sales_not_active`. Flip to false once a payment provider is
  // wired and the operator is ready to accept orders. Must match the web side's
  // NEXT_PUBLIC_CHECKOUT_DISABLED at deploy time.
  CHECKOUT_DISABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const extraOrigins = parsed.data.CORS_EXTRA_ORIGINS
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const mockPaymentsAllowedSteamIds = new Set(
  parsed.data.MOCK_PAYMENTS_ALLOWED_STEAM_IDS
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

if (
  parsed.data.MOCK_PAYMENTS &&
  parsed.data.NODE_ENV === 'production' &&
  mockPaymentsAllowedSteamIds.size === 0
) {
  console.error(
    'MOCK_PAYMENTS=true in production requires MOCK_PAYMENTS_ALLOWED_STEAM_IDS to be a non-empty comma-separated list of SteamID64 values.',
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  /** All origins that CORS and the CSRF origin check should accept. */
  ALLOWED_ORIGINS: [parsed.data.WEB_ORIGIN, ...extraOrigins],
  /** Parsed MOCK_PAYMENTS_ALLOWED_STEAM_IDS as a Set for O(1) membership checks. */
  MOCK_PAYMENTS_ALLOWED_STEAM_IDS_SET: mockPaymentsAllowedSteamIds,
};
