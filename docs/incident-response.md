# RustSkinPay — incident response runbook

> Last updated: 2026-05-20
> Status: Draft (pre-launch)

What to do when something goes wrong. Designed to be executed under pressure — short, concrete steps, with the destructive options at the end.

---

## Severity ladder

| Sev       | Definition                                               | Response time     | Examples                                                         |
| --------- | -------------------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| **SEV-1** | Money moving incorrectly OR auth compromised OR PII leak | < 30 min          | Mass false-charges, leaked Stripe key, JWT secret leak           |
| **SEV-2** | Customer-facing flow broken                              | < 4 h             | Checkout 500s, sync worker down, /market empty                   |
| **SEV-3** | Degraded but functional                                  | < 24 h            | Slow checkout, occasional failed trade, individual refund needed |
| **SEV-4** | Cosmetic / observability                                 | next business day | Wrong icon, log spam, metrics gap                                |

---

## Universal first steps (any sev)

1. **Confirm + acknowledge** — paste the alert / customer report into your incident notes (or just a chat window). Write down the time you started.
2. **Don't touch prod yet.** Read enough of the data to understand what's happening before changing anything.
3. **Check `/health` and `/metrics`** — `https://<api-host>/health` should be 200. Worker `/health` similarly. If either is down, that's your starting point.
4. **Check recent deploys** — `gh pr list --state merged --limit 5` and the hosting provider's deploy log. New issues usually correlate with new deploys.
5. **Decide blast radius** — how many users affected? all? one? Decide before any irreversible action.

---

## SEV-1 plays

### A leaked secret (Stripe / DMarket / Steam bot / JWT cookie)

The longer it's exposed, the worse it gets. Acceptable to break the site to contain.

1. **Stripe key leaked:**
   - Stripe dashboard → Developers → API keys → **Roll** the leaked key. New key gets a new value; old key dies immediately.
   - Update hosting env var with the new value. Trigger redeploy.
   - In Stripe dashboard → Logs, check the past 24h for events from unfamiliar IPs / unexpected refunds. File a Stripe support ticket if anything looks wrong.

2. **DMarket key leaked:**
   - DMarket → Profile → Trading API → **Revoke** the key. Generate a new pair.
   - Update hosting env, redeploy.
   - Check DMarket balance — anything missing? If yes, file support with DMarket and document the loss.

3. **Steam bot credentials leaked:**
   - Sign in to the bot Steam account via browser → Steam Guard → "Deauthorize all other devices".
   - Change password.
   - If `shared_secret` / `identity_secret` were leaked: remove Mobile Authenticator, re-enroll, get fresh secrets. (Steam Guard removes any pending trade offers in the process — note any orders currently in flight.)
   - Update env, redeploy.

4. **`COOKIE_SECRET` leaked:**
   - Generate a new 64-byte hex value (`openssl rand -hex 32`).
   - Update env, redeploy. **All sessions invalidated** — every user is logged out, which is the point.
   - Audit log: scan for `auth.login` events with anomalous IPs in the leak window.

### Suspected unauthorized access (database / hosting)

1. Rotate **every** secret listed above.
2. Force-rotate hosting provider account password + enable 2FA if not already.
3. Rotate GitHub PAT / SSH keys.
4. Pull DB backup taken before the suspected intrusion window. Compare row counts on `Order`, `Payment`, `Trade`, `User`. Diff `AuditLog` for unexpected activity.
5. If anything looks tampered, **restore from the last known-good backup** (see "Restore from backup" below).

### Mass false-charges (Stripe webhook spoofing / replay)

1. Stripe dashboard → Webhooks → **disable** the webhook endpoint.
2. Check `WebhookEvent` rows for the past 24h. Each must have `signatureValid=true`. Any false ones = spoofed.
3. Confirm `STRIPE_WEBHOOK_SECRET` matches the one Stripe shows. If mismatched, rotate.
4. For every spoofed `Order` flipped to PAID without a real Stripe payment: revert to `PENDING_PAYMENT` (or `CANCELLED` if visible to user), cancel any enqueued `buy-and-dispatch` jobs.
5. Re-enable webhook after secret is rotated.

---

## SEV-2 plays

### /market is empty

Symptom: storefront shows the "Catalog is loading" empty state.

1. Check `SourceItem` row count in DB: `select count(*) from "SourceItem" where available;`
2. If zero: the sync worker hasn't run. Check worker `/health` and BullMQ in Redis. Connect to Redis and `LRANGE bull:dmarket-sync:active 0 -1` — anything stuck?
3. Check worker logs for `sync starting` / `sync complete`. If errors, look for DMarket 401/403 (key issue) or 5xx (their outage).
4. Manual retrigger: `redis-cli LPUSH bull:dmarket-sync:wait '{"name":"manual","data":{"gameId":"rust","limit":60}}'` — or just bounce the worker (it adds a `rust-sync-initial` job on startup).

### Checkout returns 500

1. Check API `/metrics` — find `http_requests_total{route="/api/checkout",status="5.."}`.
2. Check API logs for the trace.
3. Most common: DB connection lost. Bounce the API process; Prisma's adapter will reconnect.
4. Less common: `Order.idempotencyKey` collision — see if user is replaying with the same key + different `sourceItemId`. Returns 409 in that case, not 500.

### buy-and-dispatch failures spiking

1. Check `SourceTransaction` rows in `FAILED` state with recent `createdAt`. The `errorCode` column tells you why.
2. `INSUFFICIENT_FUNDS` from DMarket → top up DMarket balance (PLAN.md § 6).
3. `OFFER_GONE` / 404 → the source-side offer disappeared between display and buy. Refund flow handled this; verify the buyers got refunded.
4. Stripe refund failures (no `payment_intent` on file) → manually issue from Stripe dashboard. Update `Payment.status` to `REFUNDED` and `Order.status` to `REFUNDED` once done.

---

## SEV-3 plays

### Individual stuck order (paid, no delivery)

1. Find the `Order` by ID. Inspect: `SourceTransaction.state`, `Trade.status`, `Payment.status`.
2. If `SourceTransaction=SUCCESS` and `Trade=QUEUED` for > 10min: bot may be down. Check worker logs for Steam reconnection issues. Re-enqueue: add a `trade-dispatch` job with the trade ID.
3. If `SourceTransaction=PENDING` for > 5min after Order=PAID: the `buy-and-dispatch` job didn't enqueue. Re-enqueue manually.
4. If buyer's trade URL is set but Steam rejects the trade (escrow / region): contact buyer with status, offer refund.

### Manual refund

```ts
// Run from apps/api or apps/worker context (tsx):
import { refundOrder } from '../refund.js';
await refundOrder('order_id_here', 'manual:reason');
```

This calls Stripe refund (or no-ops in mock mode) and flips the Order to REFUNDED.

---

## Restore from backup

Supabase keeps daily PITR backups. Process:

1. Supabase dashboard → Database → Backups.
2. Pick the snapshot from _before_ the incident window.
3. Restore into a fresh DB (don't overwrite the live one yet).
4. Diff against live for unexpected drift: `Order`, `Payment`, `WebhookEvent`, `User`, `SourceTransaction`.
5. If the live DB is unsalvageable: change `DATABASE_URL` in hosting env to point at the restored DB, redeploy.
6. **Test once in staging** before flipping prod. Don't trust the restore blindly.

---

## After-action

For any SEV-1 or SEV-2:

1. Write up a 1-page postmortem within 48h. Sections: timeline, root cause, customer impact, fix, prevention.
2. Add a regression test to `apps/api/src/**/*.test.ts` or worker tests if there's a unit-testable surface.
3. Update this runbook if a new play emerged.

Treat every incident as a data point — the runbook gets longer over time, not shorter.

---

## Quick reference: where to look

| When in doubt            | Look here                                                     |
| ------------------------ | ------------------------------------------------------------- |
| API behavior             | `apps/api/src/routes/*`                                       |
| Worker job state         | Redis (BullMQ keys: `bull:<queue-name>:*`) + worker logs      |
| DB state                 | Supabase SQL Editor (prod) / local psql                       |
| Stripe state             | Stripe dashboard → Logs / Payments / Disputes                 |
| DMarket state            | https://dmarket.com → Profile → balance + recent transactions |
| Steam bot state          | bot Steam account → Inventory + pending trades                |
| Metrics                  | `/metrics` on api + worker                                    |
| Audit log                | DB `AuditLog` table                                           |
| Memory of past decisions | `S:\Projects\skinpay\memory\*.md`                             |
