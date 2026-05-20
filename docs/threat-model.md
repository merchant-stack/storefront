# RustSkinPay — threat model

> Last updated: 2026-05-20
> Status: Draft (pre-launch)
> Owner: Dmitriy

This document captures **what we protect**, **against whom**, **how**, and **what's deliberately out of scope**. Review at every major architecture change and quarterly thereafter.

---

## What we protect

In rough order of consequence-if-compromised:

| Asset                                     | Why it matters                                                                      | Where it lives                                                            |
| ----------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Buyer payment details**                 | Card data → identity theft + chargebacks. PCI scope if mishandled.                  | Stripe-hosted Checkout; we hold only `payment_intent` IDs + Stripe tokens |
| **DMarket Trading API keys**              | Lets an attacker drain our balance + place arbitrary orders                         | `.env.local` in dev, hosting provider env in prod                         |
| **Steam bot credentials + shared secret** | Lets an attacker move our inventory, log into our bot, intercept incoming trades    | `.env.local` / hosting env                                                |
| **Stripe secret key + webhook secret**    | Lets an attacker spoof webhooks (mark orders paid without payment) or issue refunds | `.env.local` / hosting env                                                |
| **Buyer Steam trade URL**                 | Tied to a real Steam account; URL change = potential takeover signal                | Postgres `User.tradeUrl`                                                  |
| **JWT cookie signing secret**             | Lets an attacker forge session cookies → impersonate any user                       | `.env.local` / hosting env (`COOKIE_SECRET`)                              |
| **Order + Payment history**               | PII (which user bought what + when)                                                 | Postgres                                                                  |
| **Source code + infra config**            | Reveals attack surface; secrets if committed by mistake                             | GitHub                                                                    |

---

## Who we defend against

Threat actors, ranked by likelihood:

1. **Opportunistic abusers** — running automated tools (CSRF, credential stuffing, chargeback fraud) against any storefront.
2. **Targeted fraudsters** — refund-loop abusers, chargeback farmers, stolen-card buyers.
3. **Skin-market competitors** — scraping inventory, attempting to outbid sync, spamming.
4. **Insiders / supply chain** — compromised npm packages, malicious co-maintainers, leaked CI secrets.
5. **State / sophisticated** — out of scope for current resources; rely on hosting + Stripe defenses.

**Explicitly out of scope:** physical theft of Dmitriy's laptop (use FDE), Stripe being breached, Valve being breached, Postgres ZDE in Supabase.

---

## Attack surfaces

### HTTPS / API

| Threat                               | Mitigation                                                                                 | Where                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| CSRF on state-changing routes        | Origin/Referer hook + SameSite=Lax cookies + CORS restricted to WEB_ORIGIN                 | `apps/api/src/server.ts`                              |
| Rate-limited brute force on /auth/\* | `@fastify/rate-limit`: 20/min auth, 30/h checkout, 200/min default                         | `apps/api/src/server.ts`, route configs               |
| HTTP header injection / clickjacking | `@fastify/helmet` (frameguard=deny, COOP, CORP, HSTS in prod)                              | `apps/api/src/server.ts`                              |
| XSS in web                           | CSP allowlist (img Steam CDN only, connect API+Stripe only, script self)                   | `apps/web/next.config.mjs`                            |
| Stripe webhook forgery               | Stripe signature verify via `whsec` shared secret, raw body required                       | `apps/api/src/routes/webhooks.ts`                     |
| Replayed Steam OpenID                | Each `openid.response_nonce` claimed atomically in Redis `SETNX EX 600`                    | `apps/api/src/services/steam.ts`                      |
| Forged JWT cookie                    | HS256 with 64-byte `COOKIE_SECRET`. `fast-jwt >=6.2.4` pinned (closes empty-secret bypass) | `apps/api/src/auth/session.ts`, root `pnpm.overrides` |
| Trade URL belongs to another user    | URL is parsed, `partner=` reconstructed to SteamID64, matched against session SteamID      | `apps/api/src/auth/steam-id.ts`                       |

### Payments

| Threat                                | Mitigation                                                                                        | Where                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Client tampers with price at checkout | Price always re-read from `SourceItem.salePriceMinor` server-side                                 | `apps/api/src/routes/checkout.ts`                                       |
| Double-charge on retry                | `Idempotency-Key` header → unique `Order.idempotencyKey`; replays return existing order           | same                                                                    |
| Paid but undeliverable order          | `buy-and-dispatch` failure → automatic Stripe refund + `Order=REFUNDED`                           | `apps/worker/src/jobs/buy-and-dispatch.ts`, `apps/worker/src/refund.ts` |
| Chargeback after delivery             | Stripe webhook on `charge.dispute.created` (to-be-wired); evidence of delivery saved in Trade row | TODO before launch                                                      |

### Bot / Steam

| Threat                    | Mitigation                                                                       | Where                                    |
| ------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------- |
| Bot account bans          | Single bot is single point of failure; multi-bot fleet planned Phase 3           | PLAN.md Phase 3                          |
| Trade hold abuse (15-day) | UI clearly warns to enable Mobile Auth before checkout                           | Item + checkout pages                    |
| Bot inventory drift       | Worker pulls live inventory before each trade; mismatches → trade FAILED + alert | `apps/worker/src/jobs/dispatch-trade.ts` |

### Secrets / supply chain

| Threat                       | Mitigation                                                                                                                                                                          | Where                                                                |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Secret committed by accident | Pre-commit `scripts/scan-secrets.mjs` blocks Stripe/AWS/Steam/DMarket patterns + high-entropy values                                                                                | `.husky/pre-commit`                                                  |
| Vulnerable transitive dep    | `pnpm.overrides` for critical CVEs (fast-jwt, protobufjs, form-data, tough-cookie, qs, nth-check, postcss, hono). CI `pnpm audit --audit-level high` on PR. Dependabot weekly bumps | `package.json`, `.github/workflows/ci.yml`, `.github/dependabot.yml` |
| Secret in logs               | Pino redact paths for cookie, signing headers, all `*_SECRET` / `*_KEY` env names                                                                                                   | `apps/api/src/server.ts`                                             |
| Leaked stack trace           | Prod error handler returns `internal_error` for 5xx; no stack to client                                                                                                             | same                                                                 |

### Database

| Threat                         | Mitigation                                                                                                         | Where                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| SQL injection                  | Prisma everywhere; no `$queryRawUnsafe` (grep-verified)                                                            | All routes                                    |
| Unauthorized cross-user reads  | Every order/account route checks `buyerId === session.sub` before returning                                        | `apps/api/src/routes/checkout.ts`, account.ts |
| Direct DB access from internet | Local dev: localhost only. Prod: Supabase + RLS planned; direct PG TLS already blocked at network layer on dev box | Memory `network-postgres-tls-blocked`         |

---

## Defense layers (defense in depth)

1. **Network / CDN** (hosting provider Cloudflare proxy or equivalent — pre-launch) — DDoS, basic WAF.
2. **CORS + CSRF + CSP** — block cross-origin abuse at the browser.
3. **Rate limits** — slow targeted brute force.
4. **AuthN / AuthZ** — Steam OpenID + JWT cookie + per-route session check.
5. **Input validation** — Zod on every body/query.
6. **Idempotency + transaction guards** — Prisma transactions, idempotency keys.
7. **Audit log** — login + trade URL changes (more events planned).
8. **Secret hygiene** — pre-commit scan + log redaction + env-only storage.
9. **Refund safety net** — auto-refund on undeliverable.

---

## Known accepted risks (revisit before launch)

- **`lodash.pick` (high) + `request` (moderate)** in `steamcommunity` transitive deps — abandoned upstream, no fix. Used only by Steam HTML scraping; we don't pass user input through it.
- **No bot fleet yet** — single bot is a SPoF for delivery. Mitigation: alert + manual refund. Plan: multi-bot Phase 3.
- **Mock-pay endpoint** (`/api/_dev/mock-pay`) — only registered when `MOCK_PAYMENTS=true`. **Must** be false in prod. Add deploy-time guard.
- **No external pentest yet** — pre-launch requirement.

---

## How to apply this document

- When adding a new route: walk through this doc and decide which row covers your concern. If none, add a row.
- When bumping a critical dep (Fastify, Prisma, Stripe, fast-jwt): re-read the "Secrets / supply chain" row.
- When changing auth flow: re-read the HTTPS / API and Bot / Steam rows; update if invariants change.
- When the buyer-visible surface grows: re-check Payments row, especially price-tampering + idempotency.

Re-audit quarterly. Treat as a living document.
