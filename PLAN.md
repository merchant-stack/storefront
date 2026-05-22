# RustSkinPay — Project Plan

> Last updated: 2026-05-18
> Status: Phase 1 (Storefront MVP) — in progress
> Pivoted 2026-05-18 from "user-listed marketplace + embeddable widget" → "arbitrage storefront sourcing from DMarket".

---

## 1. What we're building

A **B2C arbitrage storefront** for Rust skins. We are a one-stop reseller — buyers pay us, we source the skin elsewhere, our Steam bot forwards it to them.

```
Buyer            RustSkinPay         DMarket             Steam
  │   browse        │                   │                   │
  │ ────────────►  │ ◄──── /market ────►│ (sync inventory)  │
  │   pay (Stripe) │                   │                   │
  │ ────────────►  │ ──── buy offer ──►│                   │
  │                │                   │ ──── trade ──────►│ (our bot)
  │                │ ◄────── notify ───────────────────────│
  │                │ ─────────── forward trade ───────────►│ (buyer)
  │ ◄──────────── receives skin ──────────────────────────│
```

**Margin** = sale price − DMarket cost − Stripe fee − bot ops cost. Typical target: 12–25% gross before fees.

**Anti-products** (out of scope, do not propose adding back):

- ~~User-listed marketplace~~ — users do not sell on our site
- ~~Embeddable payment widget for third-party merchants~~ — single B2C storefront only
- ~~Multi-tenant merchant model~~ — only one merchant exists (us)

---

## 2. Architecture

```
S:\Projects\skinpay\
├── apps/
│   ├── web/        Next.js 15 — public storefront + buyer account
│   ├── api/        Fastify — REST, DMarket service, Stripe webhooks
│   └── worker/     Node — Steam bot, BullMQ jobs (sync, buy, dispatch)
└── packages/
    ├── db/         Prisma schema + migrations
    └── shared/     TS types, Zod schemas, utils
```

**Stack** (settled, not for re-debate):

- TypeScript everywhere, strict
- Next.js 15 (App Router) + Tailwind + shadcn/ui
- Fastify + Prisma + Postgres (local dev) / Supabase Postgres (prod)
- Redis (Memurai local / Upstash prod) + BullMQ
- Steam OpenID for buyer auth → JWT cookie
- `steam-user` + `steamcommunity` + `steam-tradeoffer-manager` for the bot
- Stripe Checkout for buyer payments (no PCI surface)
- pnpm + Turborepo

**Why local Postgres for dev** — the dev network blocks PG protocol (port 5432/6543) for TLS. HTTPS:443 works fine, so production API on Render/Railway will talk to Supabase normally; only local dev needs the local DB.

---

## 3. Data model (post-pivot)

### Kept from old marketplace plan

- `User` — buyer profile (Steam OpenID), trade URL, optional email
- `Order` / `OrderItem` / `Payment` / `WebhookEvent` — buyer→us payment side
- `Trade` — Steam trade leg (our bot → buyer)
- `AuditLog` — operational logging
- `Merchant` — single internal merchant row (legacy infra, not a feature)

### New (post-pivot)

- `SourceItem` — cached snapshot of a DMarket offer we display on our store. Fields: `sourceProvider` (enum: DMARKET first, more later), `sourceOfferId`, `marketHashName`, `gameId`, `iconUrl`, `sourcePriceMinor`, `currency`, `salePriceMinor` (= source × markup), `markupBps` (basis points), `available` (bool), `lastSyncedAt`.
- `SourceTransaction` — our buy on DMarket triggered by a paid Order. Fields: `orderId`, `sourceProvider`, `sourceOfferId`, `sourcePaymentId` (DMarket-side), `state` (PENDING, SUCCESS, FAILED, REFUND_REQUIRED), `amountSpentMinor`, `errorCode`, `rawResponse`, timestamps.

### Dropped or repurposed

- `InventoryItem` (user's Steam inventory) — **dropped**. We don't track user inventory.
- `Listing` (user-listed sale) — **repurposed** in a separate migration: not deleted yet, but no new rows; `SourceItem` is the new "thing for sale". Will be removed in a cleanup pass once UI/API is migrated.
- `SteamItem` / `PriceSnapshot` — **kept**, useful as a canonical catalog joined with `SourceItem` rows. `PriceSnapshot.source` enum gains a `DMARKET` value.

---

## 4. Phased build (rebooted)

### Phase 1 — Storefront MVP

End-state: user lands on rustskinpay.com, browses Rust skins (sourced from DMarket), picks one, pays Stripe test, our bot forwards it from DMarket to their Steam account.

- [ ] **1.1** DMarket service client (`apps/api/src/services/dmarket.ts`) with Ed25519 signing, methods: `searchItems`, `buyOffer`, `getBalance`, `getMyTrades`. Mock-mode fallback when keys absent.
- [ ] **1.2** Schema migration — add `SourceItem`, `SourceTransaction`. Apply locally + via Supabase SQL Editor.
- [ ] **1.3** Sync job (`apps/worker/src/jobs/sync-dmarket.ts`) — periodic BullMQ job that calls `searchItems(gameId='rust')` and upserts top N items into `SourceItem` with our markup applied. Run on cron every 5 min.
- [ ] **1.4** Replace `/api/listings` with `/api/items` that returns `SourceItem` rows. Web `/market` page reads from this.
- [ ] **1.5** Refactor `/api/checkout` — instead of reserving a user `Listing`, it captures the chosen `sourceOfferId` into an `Order`+`OrderItem`+`SourceTransaction(PENDING)`, then redirects to Stripe.
- [ ] **1.6** Refactor Stripe webhook handler — on `checkout.session.completed`, enqueue a new `buy-and-dispatch` worker job (replaces the old "dispatch-trade").
- [ ] **1.7** New worker job — calls `dmarket.buyOffer(...)`, polls until DMarket delivers the item to our bot's Steam inventory, then sends Steam trade offer to the buyer's trade URL.
- [ ] **1.8** Bot trade-receive handler — when an incoming trade from DMarket arrives, auto-accept it and mark the `SourceTransaction` as SUCCESS.
- [ ] **1.9** Failure paths — DMarket buy fails (insufficient balance / offer gone) → refund order via Stripe; trade-out fails → human alert + manual refund.
- [ ] **1.10** UI polish — home copy reflects new model, item cards show source price hidden + our price displayed, no seller info.

Acceptance: real $5 test of one cheap Rust skin through full flow on Stripe test mode → buyer Steam account receives the skin.

### Phase 2 — Operational hardening

- Multi-source: add Skinport / Lis-Skins as additional providers behind the same `SourceItem` table.
- Price freshness / staleness handling (race when offer disappears between display and buy).
- Failure-mode UI: refund status visible to user.
- Inventory pre-check: don't display items where our bot can't reasonably receive (trade-hold, region-locked, etc).
- Admin panel for ops: SourceTransaction monitoring, manual refund/redrive.

### Phase 3 — Growth

- Live Stripe + real domain + region geo-fencing
- Crypto checkout via NOWPayments or Coinbase Commerce
- Smarter markup (tiered by price band / item liquidity)
- Bot fleet (multiple Steam accounts for capacity + risk distribution)

---

## 5. Deferred risks (don't lose)

| Risk                                | Why it matters                                                                                                                                           | When to revisit                            |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Jurisdiction / legal entity**     | High-risk vertical (gaming + skins). Stripe live may demand business verification + special category review.                                             | Before going live with real money          |
| **DMarket TOS**                     | They allow third-party use of their API, but mass-arbitrage at scale may attract attention. Their service availability is now a single point of failure. | Phase 2 — add second source                |
| **Steam ToS / bot bans**            | Valve can ban the bot. Mitigated by multi-bot fleet (Phase 3) + clean usage patterns.                                                                    | Ongoing                                    |
| **Trade holds (Mobile Auth)**       | Without Mobile Auth on the buyer's account, items get 7-day held even after we send. Affects UX.                                                         | Phase 1 — clear UI warning before checkout |
| **Race between display and buy**    | DMarket offer can disappear between user clicking buy and our buy hitting their API. Need refund flow.                                                   | Phase 1 — task 1.9                         |
| **Stripe high-risk classification** | Stripe may flag us as gaming/skins reseller and freeze funds.                                                                                            | Before going live                          |

---

## 6. What the operator needs to provide

These can NOT be done by Claude — require identity, accounts, or money.

### Now (blocks Phase 1 end-to-end)

1. **DMarket account + API keys**
   - Register at <https://dmarket.com> (Google/Steam/email OK)
   - Profile → Trading API → generate API key pair (public + secret/private)
   - Public key goes into `.env.local` as `DMARKET_PUBLIC_KEY=`. Secret as `DMARKET_SECRET_KEY=` (hex string).
   - Top up balance ~$5–10 in USD for first real-buy test (crypto or card)

2. **Stripe test-mode keys**
   - <https://dashboard.stripe.com> → toggle to Test mode → Developers → API keys
   - Paste both into `.env.local` as `STRIPE_SECRET_KEY=sk_test_...` and `STRIPE_PUBLISHABLE_KEY=pk_test_...`
   - For webhook → install Stripe CLI separately, `stripe listen --forward-to http://localhost:4000/api/webhooks/stripe` → puts `whsec_...` into `STRIPE_WEBHOOK_SECRET=`

3. **Dedicated Steam bot account**
   - New Steam account (NOT personal), phone-verified, ~$5 game purchased (Steam requires for trading)
   - Steam Guard Mobile Authenticator enabled
   - Bot's `shared_secret` + `identity_secret` extracted from Steam mobile app (separate doc when ready)
   - Goes into `.env.local`: `STEAM_BOT_USERNAME`, `STEAM_BOT_PASSWORD`, `STEAM_BOT_SHARED_SECRET`, `STEAM_BOT_IDENTITY_SECRET`
   - **NOT urgent** for first dev iteration — sync + checkout flow can be tested without bot

4. **Markup decision** — what % do we apply by default? Options:
   - Flat percentage (e.g. +15% across the board) — simplest
   - Tiered (e.g. <$5 → +25%, $5–50 → +15%, >$50 → +10%) — better margins on small items
   - Recommend: flat 15% to start; switch to tiered when we have sales data

### Later

5. **Domain name** — short, brandable, `.com` ideally. Namecheap/Porkbun. Before public deploy.
6. **Hosting** — Vercel (web), Render/Railway/Fly (api, worker), Supabase (db, already set up). Plan when Phase 1 acceptance lands.
7. **Stripe live mode** — high-risk classification likely; may need extra docs. Plan before flipping live.

---

## 7. Local dev runbook

Already set up as of 2026-05-18:

- Local Postgres at `localhost:5432/rustskinpay` (password `1808`)
- Local Memurai at `localhost:6379`
- Schema applied, seed data present (6 sample items with placeholder icons — these will be replaced by real DMarket sync)
- `NO_PROXY=localhost,127.0.0.1` in `.env.local` (system HTTP proxy blocks localhost otherwise)

To run:

```powershell
cd S:\Projects\skinpay
pnpm dev
```

API on :4000, Web on :3000, worker runs alongside.

Production schema is mirrored on Supabase (project `rustskinpay` in his Supabase org) — applied via SQL Editor since direct PG protocol is blocked. Same migration SQL accepted.

---

## 8. Status snapshot

**Infrastructure: done**. Local stack runs, brand is RustSkinPay, business model captured.

**Next concrete step (this turn):** schema rework + DMarket service client + UI cleanup.

---

## 9. Security checklist (must clear before public launch)

**Hard requirement 2026-05-18: full hardening pass before any real-money launch — treat as first-class deliverable, not an afterthought.** Items grouped by surface. Each item is "done" only with code + test + (where applicable) external check.

### Application / HTTP

- [ ] CSRF protection on all state-changing routes (POST/PATCH/DELETE) — double-submit cookie or origin-check + same-site cookies
- [ ] Rate limiting per IP and per session (Fastify rate-limit plugin): login, checkout, account changes, search. Stricter on /api/checkout and /api/auth/\*
- [ ] Input validation on every route via Zod (audit: every `request.body`/`request.query` parsed before use)
- [ ] HTTP security headers via middleware: HSTS, X-Frame-Options=DENY, X-Content-Type-Options=nosniff, Referrer-Policy=strict-origin-when-cross-origin, Permissions-Policy
- [ ] Content Security Policy — strict, allowlist for our domains + Steam/DMarket image CDNs only
- [ ] No `dangerouslySetInnerHTML` anywhere in `apps/web`
- [ ] Cookie flags audit: `httpOnly`, `Secure` (in prod), `SameSite=Lax` minimum on session cookie
- [ ] Errors leak no stack traces / internal paths to client in prod

### Auth

- [ ] Steam OpenID — full signature verification (re-check nonce against Steam's response, don't trust callback params)
- [ ] JWT cookie: short TTL + rotation strategy, COOKIE_SECRET rotation procedure documented
- [ ] Logout invalidates session server-side (revocation list or short TTL + refresh)
- [ ] Account-takeover guard: notify user (or block) on trade URL change
- [ ] No password auth → no enumeration risk; if email is added later, full enumeration-resistant flows

### Payments

- [ ] Stripe webhook signature verification — confirmed in `apps/api/src/routes/webhooks.ts`, must reject any unsigned/wrong-sig event
- [ ] Idempotency on order creation: use `Order.idempotencyKey` consistently; replays return same order, never double-charge
- [ ] Server-side price check on checkout: NEVER trust client-sent price, always re-read `SourceItem.salePriceMinor`
- [ ] Chargeback / refund flow: on Stripe `charge.dispute.created`, mark order, trigger ops alert
- [ ] Refund on DMarket failure: if `SourceTransaction` ends FAILED post-payment, auto-refund Stripe charge

### Secrets / external services

- [ ] DMarket secret key — only in env, never logged, never returned to client, never serialised into rawPayload columns
- [ ] Steam bot credentials — same rules. Rotate immediately if any leak suspected
- [ ] Logging filters: scrub `Authorization`, `X-Api-Key`, `X-Request-Sign`, `STEAM_BOT_*`, `STRIPE_SECRET_*` from any log line
- [ ] Outgoing fetches: timeout (5–30s), retry budget, circuit breaker on DMarket calls
- [ ] No secret committed in git — pre-commit hook or git-secrets scan in CI

### Database

- [ ] All queries via Prisma (no raw `$queryRawUnsafe` with user input)
- [ ] Connection-string in env only, never hardcoded
- [ ] Backups: Supabase auto-backups verified; test restore once before launch
- [ ] AuditLog populated for: login, trade URL change, role change, refund, manual admin actions

### Bot / abuse

- [ ] Trade URL validated by format AND ownership confirmation (Steam OpenID session must match the SteamID embedded in the trade URL)
- [ ] Anomaly detection on rapid buys / multiple failed payments from same IP
- [ ] Catpcha (hCaptcha/Turnstile) on /api/auth/login if rate exceeded
- [ ] No client-side enumeration of internal IDs: surface IDs only when the user owns the resource

### Infrastructure

- [ ] HTTPS everywhere — hosting provider gives this by default; verify Render/Railway/Vercel configs
- [ ] DDoS / WAF layer in front of API (Cloudflare proxy or Fly.io equivalent)
- [ ] Container images run as non-root, read-only filesystem where possible
- [ ] Public-facing services bound to 0.0.0.0 only through reverse proxy; internal services not internet-reachable
- [ ] Health/metrics endpoints have no sensitive info

### Dependencies

- [ ] `pnpm audit` clean (or known acceptable) before each release
- [ ] Dependabot or equivalent for automated PR-bumps
- [ ] Lockfile committed and reviewed
- [ ] No unmaintained / abandoned deps in critical path (Steam libs are notoriously older; flag and pin exact versions)

### Pre-launch

- [ ] External penetration test (OWASP top-10 minimum)
- [ ] Threat model document: what we're protecting, against whom, what's out of scope
- [ ] Incident response runbook: how we revoke bot creds, refund mass-orders, restore from backup
- [ ] Sentry / error tracking configured with PII filters; no env values leaked into error reports

Re-audit this list before flipping Stripe to live mode, then quarterly.
