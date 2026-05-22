# RustSkinPay

Rust skins marketplace + embeddable payment aggregator. English-language site, Stripe-style hosted checkout.

See [`PLAN.md`](./PLAN.md) for the phased roadmap, architecture decisions, and the operator action items (Steam API key, bot account, Stripe test account).

## Repository layout

```
apps/
  web/      Next.js 15 — marketplace UI + hosted checkout pages
  api/      Fastify  — REST API, webhooks, internal services
  worker/   Node     — Steam trade bots, BullMQ workers, cron jobs
packages/
  db/       Prisma schema + generated client
  shared/   Shared TS types, Zod schemas, utility code
```

## Prerequisites

- Node.js >= 22 (24 recommended — see `.nvmrc`)
- pnpm >= 10 (`npm i -g pnpm`)
- A Neon Postgres URL and Upstash Redis URL (free tiers — see `PLAN.md` § 4)
- A `.env.local` populated with the secrets listed in `.env.example`

> Docker is **not** required. `docker-compose.yml` is kept as an offline-dev fallback only.

## First-time setup

```sh
pnpm install
cp .env.example .env.local         # then fill in real values from Neon/Upstash/Stripe/Steam
pnpm --filter @rustskinpay/db db:migrate
pnpm dev                           # starts all apps
```

## Common commands

| Command                      | What it does                             |
| ---------------------------- | ---------------------------------------- |
| `pnpm dev`                   | Runs every app in dev mode (Turborepo)   |
| `pnpm build`                 | Builds every app + package               |
| `pnpm typecheck`             | TS strict-mode check across the monorepo |
| `pnpm lint`                  | ESLint across the monorepo               |
| `pnpm format`                | Prettier write                           |
| `pnpm --filter <name> <cmd>` | Run a command in a single workspace      |

## Status

Phase 1 (Marketplace MVP) in progress. See `PLAN.md` § 5 for current task status.
