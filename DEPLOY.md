# Deployment guide

End-to-end runbook for taking RustSkinPay from `pnpm dev` on Windows to a live site. Stack:

- **Web** (Next.js) → **Vercel** (free hobby tier)
- **API + Worker** (Fastify + BullMQ) → **Aeza VPS** (Frankfurt, ~300₽/mo, crypto payment)
- **Database** → **Supabase** (project `rsryrdppywowaagxmjfo`)
- **Redis** → **Upstash** (HTTPS-friendly, works through proxied dev networks)
- **Domain + DNS** → **Cloudflare Registrar** (at-cost domains, free Email Routing)
- **Container registry** → **GHCR** (GitHub Container Registry — free for this repo)

The site is launched **with sales disabled** (`CHECKOUT_DISABLED=true`). Catalog + Steam sign-in + trade-URL save all work; the buy button shows "Sales launching soon". Flip the flag once a payment provider is wired (see `PAYMENT_PROVIDERS.md`).

---

## 1. Pre-flight

### 1.1 Apply pending Supabase migrations

Two migrations are committed locally but not yet applied to prod:

- `packages/db/prisma/migrations/20260520180000_source_item_bg_color/migration.sql`
- `packages/db/prisma/migrations/20260520200000_source_provider_waxpeer/migration.sql`

Open Supabase project → SQL Editor → paste each file's contents → Run. Order doesn't matter.

Verify: `SELECT enum_range(NULL::"SourceProvider");` should include `WAXPEER`.

### 1.2 Domain

Register `rustskinpay.com` at Cloudflare Registrar (~$10/year, at-cost). DNS plan:

- `rustskinpay.com` and `www.rustskinpay.com` → Vercel (apex A record + www CNAME)
- `api.rustskinpay.com` → Aeza VPS (A record → server IP)

All three should have Cloudflare proxy **disabled** (grey cloud) — Vercel handles its own TLS, and Caddy on the VPS handles `api.rustskinpay.com`'s TLS via Let's Encrypt.

### 1.3 Email

`RustSkinPay@proton.me` is fine as the contact address in legal docs. If you want `support@rustskinpay.com`, set up free Cloudflare Email Routing → forward to ProtonMail.

---

## 2. Provision external services

Create accounts (all sign in with GitHub):

- **Vercel** — <https://vercel.com/signup>
- **Upstash** — <https://console.upstash.com/login>
- **Aeza** — <https://aeza.net/> (pay with crypto if needed)

### 2.1 Upstash

Create a Redis database, region `eu-west-1` (close to Supabase). Copy the **rediss://** URL — this is `REDIS_URL` for both api and worker.

### 2.2 Supabase

Project Settings → Database → Connection string → URI. Use the **transaction-pooler** variant on port 6543. This is `DATABASE_URL`.

### 2.3 Generate session secret

```sh
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Save it — paste the same value into api env.

---

## 3. Provision the VPS (Aeza)

1. Sign up at <https://aeza.net/>, top up balance with crypto.
2. Order a VPS:
   - **Location:** Frankfurt (Germany)
   - **OS:** Ubuntu 24.04 LTS
   - **Plan:** ~1 vCPU, 2 GB RAM, 20 GB NVMe (cheapest "Premium" tier is enough)
3. Aeza emails you the IP and root password.
4. Add the VPS IP as the A record for `api.rustskinpay.com` in Cloudflare DNS (proxy off).

### 3.1 First-time setup

You need an SSH key on your GitHub account first — go to <https://github.com/settings/keys> and add your public key (`~/.ssh/id_ed25519.pub` or generate one with `ssh-keygen -t ed25519`).

Then SSH in as root using the Aeza web console (or `ssh root@<ip>` with the temporary password) and run:

```sh
curl -fsSL https://raw.githubusercontent.com/merchant-stack/storefront/main/deploy/bootstrap.sh \
  | bash -s -- <your-github-username>
```

This installs Docker, configures the firewall, fetches your GitHub SSH keys for a new `deploy` user, then disables root SSH + password auth. Test by opening a NEW terminal:

```sh
ssh deploy@<server-ip>
```

If that works, the old root session can be closed.

### 3.2 Create env files on the server

As `deploy` user:

```sh
cd /opt/rustskinpay
# Pull templates from the repo
curl -fsSLO https://raw.githubusercontent.com/merchant-stack/storefront/main/deploy/api.env.example
curl -fsSLO https://raw.githubusercontent.com/merchant-stack/storefront/main/deploy/worker.env.example
mv api.env.example api.env
mv worker.env.example worker.env
nano api.env       # fill in real values
nano worker.env    # fill in real values
chmod 0600 api.env worker.env
```

---

## 4. Set up GitHub Actions deploy

The repo already has `.github/workflows/deploy.yml`. It needs three secrets on the GitHub repo (Settings → Secrets and variables → Actions):

| Secret           | Value                                                       |
| ---------------- | ----------------------------------------------------------- |
| `DEPLOY_HOST`    | Server IP (e.g. `1.2.3.4`)                                  |
| `DEPLOY_USER`    | `deploy`                                                    |
| `DEPLOY_SSH_KEY` | The PRIVATE key matching the public key you added on GitHub |

For `DEPLOY_SSH_KEY`: paste the full contents of `~/.ssh/id_ed25519` (or whichever private key matches the public one you added on GitHub at step 3.1). Include the `-----BEGIN OPENSSH PRIVATE KEY-----` and `-----END OPENSSH PRIVATE KEY-----` lines. <!-- allow-secret: docs reference, not a real key -->

### 4.1 First deploy

The workflow runs automatically on every push to `main` that touches code, deps, or the deploy/ folder. You can also trigger it manually: Actions tab → Deploy → Run workflow.

What it does:

1. Builds `apps/api/Dockerfile` and `apps/worker/Dockerfile`, pushes to `ghcr.io/merchant-stack/storefront-{api,worker}:sha-XXX` + `:latest`
2. scp's `deploy/docker-compose.yml` + `deploy/Caddyfile` to `/opt/rustskinpay/` on the server
3. SSH's in, writes `IMAGE_TAG` to `.env`, runs `docker compose pull && docker compose up -d`

### 4.2 GHCR package visibility

First push creates two packages under <https://github.com/orgs/RustSkinPay/packages> (or your user packages page). They're private by default — that means the VPS needs to `docker login ghcr.io` to pull.

**Easier option** — make them public (the images contain no secrets; env vars are not baked in):

1. Go to the package page on GHCR
2. Package settings → Change visibility → Public
3. Confirm

If you'd rather keep them private, on the VPS as `deploy`:

```sh
# Generate a PAT at https://github.com/settings/tokens with 'read:packages' scope
echo <PAT> | docker login ghcr.io -u <github-username> --password-stdin
```

---

## 5. Deploy the web (Vercel)

1. Vercel dashboard → **Add New** → **Project** → import this GitHub repo.
2. **Framework Preset:** Next.js
3. **Root Directory:** `apps/web`
4. **Build Command:** default (`next build`)
5. **Install Command:** `pnpm install --frozen-lockfile`
6. **Environment Variables** (set for both Production AND Preview):

   | Variable                        | Value                                             |
   | ------------------------------- | ------------------------------------------------- |
   | `NEXT_PUBLIC_API_URL`           | `https://api.rustskinpay.com`                     |
   | `NEXT_PUBLIC_CHECKOUT_DISABLED` | `true` — must match the api's `CHECKOUT_DISABLED` |

7. Deploy.
8. Settings → Domains → add `rustskinpay.com` + `www.rustskinpay.com`. Vercel gives DNS records — add to Cloudflare DNS, proxy off.

---

## 6. Smoke test

From mobile data (not your local Wi-Fi, to bypass any cache weirdness):

1. `https://rustskinpay.com` → catalog renders, item images load
2. Click "Sign in" → Steam OpenID flow → returns signed in
3. `/account` → name + avatar present, save a Steam trade URL → success
4. Click an item → "Buy" → "Sales launching soon" panel (because `CHECKOUT_DISABLED=true`)
5. `/terms`, `/privacy`, `/refunds` → render with entity address

If something fails, check:

- API logs on VPS: `ssh deploy@<ip> 'cd /opt/rustskinpay && docker compose logs -f api'`
- Caddy logs: `docker compose logs -f caddy` — TLS errors here mean DNS A record didn't propagate yet
- Vercel logs in the dashboard (Functions tab)
- Browser devtools Network tab for CORS / cookie errors

---

## 7. Reference: env vars

### 7.1 API (`api.env` on the VPS)

| Variable                  | Required | Example                                                       | Notes                                                                                |
| ------------------------- | -------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `NODE_ENV`                | yes      | `production`                                                  |                                                                                      |
| `PORT`                    | yes      | `4000`                                                        | Must match the port Caddy reverse-proxies to (`api:4000`) and the Dockerfile EXPOSE. |
| `DATABASE_URL`            | yes      | `postgresql://postgres:...@pooler.supabase.com:6543/postgres` | Pooler URL, not direct                                                               |
| `REDIS_URL`               | yes      | `rediss://default:...@xxx.upstash.io:6379`                    |                                                                                      |
| `WEB_ORIGIN`              | yes      | `https://rustskinpay.com`                                     |                                                                                      |
| `API_ORIGIN`              | yes      | `https://api.rustskinpay.com`                                 | Public URL of this service. Used for OpenID return-to.                               |
| `CORS_EXTRA_ORIGINS`      | optional | `https://www.rustskinpay.com`                                 | Comma-separated.                                                                     |
| `COOKIE_SECRET`           | yes      | (32+ random chars)                                            | Generate with the node one-liner in §2.3                                             |
| `SESSION_SAMESITE`        | yes      | `lax`                                                         | `lax` for web+api on same registrable domain; `none` if they diverge                 |
| `CHECKOUT_DISABLED`       | yes      | `true`                                                        | Flip to `false` only after payment provider wired                                    |
| `MOCK_PAYMENTS`           | yes      | `false`                                                       | Never `true` in prod                                                                 |
| `STEAM_API_KEY`           | optional |                                                               | Improves Steam profile fetch                                                         |
| `MAX_BUY_PRICE_MINOR`     | optional | `500` (= $5)                                                  | Soft cap                                                                             |
| `MAX_LISTING_AGE_SECONDS` | optional | `600`                                                         |                                                                                      |
| `STRIPE_SECRET_KEY`       | optional |                                                               | Wire at payment launch                                                               |
| `STRIPE_WEBHOOK_SECRET`   | optional |                                                               | Wire at payment launch                                                               |

### 7.2 Worker (`worker.env` on the VPS)

| Variable                   | Required   | Notes                                                                            |
| -------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `NODE_ENV`                 | yes        | `production`                                                                     |
| `DATABASE_URL`             | yes        | Same as api                                                                      |
| `REDIS_URL`                | yes        | Same as api                                                                      |
| `WAXPEER_API_KEY`          | yes        | Without it, catalog sync runs in mock mode                                       |
| `DMARKET_SYNC_LIMIT`       | optional   | default `60`                                                                     |
| `DMARKET_SYNC_INTERVAL_MS` | optional   | default `300000` (5 min)                                                         |
| `WORKER_HEALTH_PORT`       | optional   | default `4001` (not exposed to public; container healthcheck uses it)            |
| `STRIPE_SECRET_KEY`        | optional   | Required once `CHECKOUT_DISABLED=false` (worker issues refunds when a buy fails) |
| `MOCK_PAYMENTS`            | yes        | `false`                                                                          |
| `STEAM_BOT_*`              | not needed | Waxpeer P2P delivery — no own-bot                                                |

### 7.3 Web (Vercel)

| Variable                        | Required | Value                                             |
| ------------------------------- | -------- | ------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | yes      | `https://api.rustskinpay.com`                     |
| `NEXT_PUBLIC_CHECKOUT_DISABLED` | yes      | `true` — must match the api's `CHECKOUT_DISABLED` |

---

## 8. Operational notes

### 8.1 Logs

- VPS: `ssh deploy@<ip>` then `cd /opt/rustskinpay && docker compose logs -f <service>`
- Vercel: Functions tab in the dashboard

### 8.2 Editing env on the VPS

```sh
ssh deploy@<ip>
cd /opt/rustskinpay
nano api.env                       # or worker.env
docker compose up -d api           # picks up new env
```

### 8.3 Database migrations after launch

When you add a new Prisma migration locally:

1. Commit it under `packages/db/prisma/migrations/`
2. Apply to Supabase prod manually (SQL Editor) — there's no automated apply step in CI yet
3. Push the commit; GitHub Actions rebuilds + redeploys

### 8.4 Flipping sales on

When a payment provider is picked (`PAYMENT_PROVIDERS.md` has the per-provider integration guide):

1. Add the provider's keys to `api.env` (and `worker.env` if it issues refunds), `docker compose up -d`
2. Webhook URL in the provider dashboard: `https://api.rustskinpay.com/api/webhooks/<provider-id>`
3. Edit `api.env`: `CHECKOUT_DISABLED=false`, `docker compose up -d api`
4. Set `NEXT_PUBLIC_CHECKOUT_DISABLED=false` on Vercel and redeploy web (Next.js bakes `NEXT_PUBLIC_*` at build time)
5. Test a real $1 purchase end-to-end

### 8.5 Costs at launch

- Vercel hobby: $0
- Aeza VPS (Frankfurt, 1 vCPU / 2GB): ~300₽/mo (~$3-4)
- Upstash free: $0 (10k commands/day; catalog sync uses ~200/day)
- Supabase free: $0 (project already provisioned)
- Cloudflare Registrar: ~$10/year for `.com`

Total at-launch hosting: ~$4-5/mo + domain.

### 8.6 Backups

Supabase free tier includes daily backups (7-day retention). For the VPS itself, Aeza offers snapshot backups in the dashboard — enable weekly snapshots for ~30₽/mo extra. The VPS holds no irreplaceable state (Caddy can re-issue certs, env files can be re-pasted), but a snapshot saves time if you ever need to rebuild.
