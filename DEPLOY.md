# Deployment guide

This is the end-to-end runbook for taking RustSkinPay from `pnpm dev` on Windows to a live site on the public internet. Recommended stack:

- **Web** (Next.js) → **Vercel** (free hobby tier covers MVP)
- **API + Worker** (Fastify + BullMQ) → **Render** (free starter tiers, Docker-native)
- **Database** → **Supabase** (already provisioned: `rsryrdppywowaagxmjfo`)
- **Redis** → **Upstash** (HTTPS-friendly, generous free tier, works through Dmitriy's proxied network)
- **Domain + DNS** → **Cloudflare Registrar** (at-cost domains, free Email Routing)
- **Container registry** → not needed; Render builds from the Dockerfile directly

You can swap Render for Railway / Fly.io / DigitalOcean App Platform without code changes — the Dockerfiles in `apps/api/` and `apps/worker/` are platform-neutral.

The site is launched **with sales disabled** (`CHECKOUT_DISABLED=true`). Catalog + Steam sign-in + trade-URL save all work; the buy button shows "Sales launching soon". Flip the flag once a payment provider is wired.

---

## 1. Pre-flight (one-time, manual)

### 1.1 Apply pending Supabase migrations

Two migrations are committed locally but not yet applied to the prod Supabase database:

- `packages/db/prisma/migrations/20260520180000_source_item_bg_color/migration.sql`
- `packages/db/prisma/migrations/20260520200000_source_provider_waxpeer/migration.sql`

Open Supabase project → SQL Editor → paste each file's contents → Run. Order doesn't matter, both are independent.

Verify with a quick `SELECT enum_range(NULL::"SourceProvider");` — `WAXPEER` should appear.

### 1.2 Register the domain

Use Cloudflare Registrar for at-cost pricing. Pick `rustskinpay.com` if available.

Once registered, do NOT change nameservers (Cloudflare manages them by default for Registrar). Plan to use these subdomains:

- `rustskinpay.com` and `www.rustskinpay.com` → Vercel (web)
- `api.rustskinpay.com` → Render (api)

Worker has no public ingress, so no DNS record.

### 1.3 Email forwarding for `RustSkinPay@proton.me`

Two options:

- **Easiest**: leave the legal documents pointing at `RustSkinPay@proton.me` and skip domain email entirely. The brand is RustSkinPay but the inbox is ProtonMail-hosted.
- **Branded**: use Cloudflare Email Routing (free) to forward `support@rustskinpay.com` → `RustSkinPay@proton.me`, then change `SUPPORT_EMAIL` in `apps/web/src/lib/support.ts` to the new address.

Either way, the address listed in the legal docs is the one customers will write to.

---

## 2. Provision external services

Create accounts (all sign in with GitHub):

1. **Vercel** — <https://vercel.com/signup>
2. **Render** — <https://render.com/register>
3. **Upstash** — <https://console.upstash.com/login>

In Upstash: create a new Redis database, region `eu-west-1` (or wherever your Supabase is). After creation, copy the **rediss://** URL (with credentials embedded). This is the value for `REDIS_URL` everywhere.

In Supabase: project Settings → Database → Connection string → URI (use the **transaction-pooler** variant on port 6543, not the direct 5432 one). This is `DATABASE_URL`.

Generate a `COOKIE_SECRET`:

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Save it — you'll paste the same value into api env.

---

## 3. Deploy the API (Render)

1. Render dashboard → **New +** → **Web Service** → Connect this GitHub repo.
2. **Name**: `rustskinpay-api`
3. **Region**: same region as Upstash / Supabase if possible.
4. **Branch**: `main`
5. **Runtime**: Docker
6. **Dockerfile Path**: `apps/api/Dockerfile`
7. **Docker Build Context Directory**: `.` (repo root)
8. **Instance Type**: Starter (the free tier sleeps after 15 min idle — fine for soft launch; upgrade once orders flow).
9. **Environment Variables** — paste the values from §5 below.
10. Deploy. First build pulls deps, generates Prisma client, and runs `pnpm start` (which is `tsx src/index.ts`). Expect ~4-5 minutes on a cold build.

After it's live:

- Render gives you a URL like `https://rustskinpay-api-xxx.onrender.com` — health-check it: `curl https://rustskinpay-api-xxx.onrender.com/health` → `{"ok":true,"service":"rustskinpay-api"}`
- Add a custom domain in Settings → Custom Domains: `api.rustskinpay.com`. Render gives you a CNAME target; add it in Cloudflare DNS as a CNAME record with proxy **disabled** (orange cloud → off / grey). Wait ~2 min for SSL cert.

---

## 4. Deploy the worker (Render)

1. Render dashboard → **New +** → **Background Worker** (NOT Web Service).
2. **Name**: `rustskinpay-worker`
3. **Branch**: `main`
4. **Runtime**: Docker
5. **Dockerfile Path**: `apps/worker/Dockerfile`
6. **Docker Build Context Directory**: `.`
7. **Environment Variables** — see §5 below.
8. Deploy.

The worker has no public URL. Check its health from the Render logs panel — you should see periodic `dmarket sync` job-completed lines (every 5 min by default).

---

## 5. Environment variables

### 5.1 API (`rustskinpay-api`)

| Variable                  | Required | Example / default                                             | Notes                                                                                                                                              |
| ------------------------- | -------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                | yes      | `production`                                                  |                                                                                                                                                    |
| `PORT`                    | auto     | `10000` (Render injects)                                      | Don't hardcode                                                                                                                                     |
| `DATABASE_URL`            | yes      | `postgresql://postgres:...@pooler.supabase.com:6543/postgres` | Use the pooler URL, not direct                                                                                                                     |
| `REDIS_URL`               | yes      | `rediss://default:...@xxx.upstash.io:6379`                    | Upstash URL with credentials                                                                                                                       |
| `WEB_ORIGIN`              | yes      | `https://rustskinpay.com`                                     | Canonical web URL (used for redirects + Stripe success URL)                                                                                        |
| `CORS_EXTRA_ORIGINS`      | optional | `https://www.rustskinpay.com`                                 | Comma-separated. Add the www variant and any Vercel preview URLs you want to allow.                                                                |
| `API_ORIGIN`              | yes      | `https://api.rustskinpay.com`                                 | Public URL of this service. Used for OpenID return-to.                                                                                             |
| `COOKIE_SECRET`           | yes      | (32+ random chars)                                            | Generate with the node one-liner in §2. Must match across api replicas.                                                                            |
| `SESSION_SAMESITE`        | yes      | `lax`                                                         | `lax` is correct when web + api share a registrable domain (rustskinpay.com + api.rustskinpay.com). Set to `none` if they're on different domains. |
| `CHECKOUT_DISABLED`       | yes      | `true`                                                        | Set `false` only after a payment provider is wired.                                                                                                |
| `MOCK_PAYMENTS`           | yes      | `false`                                                       | Never `true` in prod — would allow free "purchases".                                                                                               |
| `STEAM_API_KEY`           | optional |                                                               | Improves Steam profile name/avatar. Without it we fall back to derived names. <https://steamcommunity.com/dev/apikey>                              |
| `MAX_BUY_PRICE_MINOR`     | optional | `500` (= $5)                                                  | Soft cap on what's purchasable.                                                                                                                    |
| `MAX_LISTING_AGE_SECONDS` | optional | `600`                                                         | Rejects checkout for stale listings.                                                                                                               |
| `WAXPEER_API_KEY`         | optional |                                                               | Not used by api directly, but if you want `/api/scripts/waxpeer-probe.ts` to work locally, set it.                                                 |
| `STRIPE_SECRET_KEY`       | optional |                                                               | Wire when payments go live.                                                                                                                        |
| `STRIPE_WEBHOOK_SECRET`   | optional |                                                               | Wire when payments go live.                                                                                                                        |

### 5.2 Worker (`rustskinpay-worker`)

| Variable                   | Required   | Example       | Notes                                                                                         |
| -------------------------- | ---------- | ------------- | --------------------------------------------------------------------------------------------- |
| `NODE_ENV`                 | yes        | `production`  |                                                                                               |
| `DATABASE_URL`             | yes        | (same as api) | Must point at the same Supabase database                                                      |
| `REDIS_URL`                | yes        | (same as api) | Must point at the same Upstash instance                                                       |
| `WAXPEER_API_KEY`          | yes        |               | Without it the worker runs in mock mode and your catalog is fake items                        |
| `DMARKET_SYNC_LIMIT`       | optional   | `60`          |                                                                                               |
| `DMARKET_SYNC_INTERVAL_MS` | optional   | `300000`      | 5 minutes                                                                                     |
| `WORKER_HEALTH_PORT`       | optional   | `4001`        | Render doesn't expose this publicly, but the health-check inside the container still uses it. |
| `STRIPE_SECRET_KEY`        | optional   |               | Worker uses it to issue refunds when a buy fails. Required once `CHECKOUT_DISABLED=false`.    |
| `MOCK_PAYMENTS`            | yes        | `false`       | Same logic as api.                                                                            |
| `STEAM_BOT_*`              | not needed |               | Waxpeer P2P delivery means no own-bot Steam account. Leave unset.                             |

### 5.3 Web (Vercel)

Vercel reads `NEXT_PUBLIC_*` vars at build time. Set them under Settings → Environment Variables for both **Production** and **Preview** environments.

| Variable                        | Required | Example                                           |
| ------------------------------- | -------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | yes      | `https://api.rustskinpay.com`                     |
| `NEXT_PUBLIC_CHECKOUT_DISABLED` | yes      | `true` — must match the api's `CHECKOUT_DISABLED` |

---

## 6. Deploy the web (Vercel)

1. Vercel dashboard → **Add New** → **Project** → import this GitHub repo.
2. **Framework Preset**: Next.js (auto-detected)
3. **Root Directory**: `apps/web`
4. **Build Command**: leave default (`next build`)
5. **Output Directory**: leave default
6. **Install Command**: `pnpm install --frozen-lockfile`
7. **Environment Variables**: see §5.3
8. Deploy. First build ~3 minutes.

After deploy:

- Vercel assigns `rustskinpay-xxx.vercel.app`. Visit and verify the catalog loads and Steam sign-in routes to api (it will, once `NEXT_PUBLIC_API_URL` is set correctly).
- Settings → Domains → add `rustskinpay.com` and `www.rustskinpay.com`. Vercel gives you DNS records:
  - Apex `rustskinpay.com`: A record → `76.76.21.21`
  - `www`: CNAME → `cname.vercel-dns.com`
- Add both in Cloudflare DNS with proxy **disabled** (grey cloud). Wait ~2 min for SSL.

---

## 7. Smoke test

From a different network (mobile data is fine, to avoid any local-cache weirdness):

1. Open `https://rustskinpay.com` → catalog renders, item images load.
2. Click "Sign in" → lands on `/account` with the legal acceptance text. Click "Continue with Steam" → routes to Steam OAuth → returns signed in.
3. Navigate to `/account` → name + avatar present.
4. Save a Steam trade URL → success message.
5. Click an item → click "Buy" → see "Sales launching soon" panel (because `CHECKOUT_DISABLED=true`).
6. Visit `/terms`, `/privacy`, `/refunds` → all render with the entity address.

If any of those fail, check:

- Render API logs for the failing endpoint
- Browser devtools Network tab for CORS or cookie errors
- Vercel function logs (if any)

---

## 8. Operational notes

### 8.1 Logs

- Render: realtime tail via the dashboard, or `render logs --service rustskinpay-api`.
- Vercel: realtime tail under the Project → Functions tab.

### 8.2 Database migrations after launch

When you add a new Prisma migration locally:

1. Commit it under `packages/db/prisma/migrations/`.
2. Apply to Supabase prod manually (SQL Editor) — there is no automated apply step in CI yet.
3. Push the commit; Render rebuilds both api and worker.

If you ever want auto-apply, add a `prisma migrate deploy` step to the api's Dockerfile entrypoint — but be careful, that introduces deploy-time DB writes that can fail.

### 8.3 Flipping sales on

When a payment provider is ready:

1. Set the provider's keys in Render env (`STRIPE_SECRET_KEY`, etc. — both api and worker).
2. Set `CHECKOUT_DISABLED=false` on both api and worker (worker doesn't use it directly today, but keep them in sync to avoid drift).
3. Set `NEXT_PUBLIC_CHECKOUT_DISABLED=false` on Vercel, then redeploy the web (Next.js bakes `NEXT_PUBLIC_*` at build time — env-only changes require a redeploy).
4. Test a real $1 purchase end-to-end.

### 8.4 Costs at launch

- Vercel hobby: $0
- Render starter: $0 each (api sleeps after 15 min idle; worker stays alive)
- Upstash free: $0 (10k commands/day; catalog sync uses maybe 200/day)
- Supabase free: $0 (project already provisioned)
- Cloudflare Registrar: ~$10/year for `.com`

Total at-launch hosting cost: domain only.

Once orders flow, upgrade Render API to `Standard` ($7/mo) so it doesn't cold-start, and consider Upstash pay-as-you-go if you exceed the free quota.
