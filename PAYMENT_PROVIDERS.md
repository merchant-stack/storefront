# Adding a payment provider

The payment layer is provider-agnostic. Every concrete provider — Stripe, NOWPayments, Coinbase Commerce, CryptoCloud, Mollie, Tinkoff, whatever — implements a single interface (`PaymentProvider` in `packages/shared/src/payments/types.ts`) and gets registered in one place. Nothing else in the codebase changes.

The Stripe implementation in `packages/shared/src/payments/stripe.ts` is the reference. Copy its shape when adding a new one.

## Quick mental model

```
┌──── api ────┐                              ┌──── provider ────┐
│             │                              │                  │
│  /api/      │   provider.createSession()   │  e.g. Stripe     │
│  checkout   │ ───────────────────────────► │  Checkout, or    │
│             │ ◄─────────────────────────── │  NOWPayments     │
│             │  { redirectUrl, sessionId }  │  invoice         │
│             │                              │                  │
│  /api/      │   provider.verifyWebhook()   │                  │
│  webhooks/  │ ───────────────────────────► │  signature check │
│  :provider  │   provider.interpretEvent()  │  → kind enum     │
│             │ ◄─────────────────────────── │                  │
│             │                              │                  │
└─────┬───────┘                              └──────────────────┘
      │
      │ finalizeOrderPayment / cancelOrderPayment / markPaymentRefunded
      ▼
   Prisma — Order + Payment + WebhookEvent

┌──── worker ────┐
│                │   provider.refund()
│   refund.ts    │ ────────────────────────► provider
│                │
└────────────────┘
```

The orchestrator never knows which provider it's talking to. The provider never touches the database.

## Step-by-step: add a new provider

Example: hypothetical `CryptoCloud`. Adapt the file names to your provider.

### 1. Implement `PaymentProvider`

Create `packages/shared/src/payments/cryptocloud.ts`:

```ts
import type { PaymentProvider /* ...interface types... */ } from './types.js';

export interface CryptoCloudConfig {
  shopId: string | undefined;
  apiKey: string | undefined;
  webhookSecret: string | undefined;
}

export function createCryptoCloudProvider(config: CryptoCloudConfig): PaymentProvider {
  return {
    id: 'CRYPTOCLOUD',
    displayName: 'Crypto (CryptoCloud)',

    isEnabled: () => Boolean(config.shopId && config.apiKey && config.webhookSecret),
    supportsRefunds: () => false, // most on-chain providers don't refund automatically

    async createSession(input) {
      // POST to CryptoCloud's invoice-create endpoint, return their pay URL.
    },

    verifyWebhook(input) {
      // Read their signature header from input.headers, HMAC over rawBody,
      // compare to config.webhookSecret. Return { eventId, eventType, parsed }
      // or null if signature is bad.
    },

    interpretEvent(envelope) {
      // Translate their event types into the internal kinds:
      //   'invoice.paid' → { kind: 'payment_succeeded', orderId, ... }
      //   'invoice.expired' → { kind: 'payment_cancelled', orderId }
      //   etc.
    },

    async refund(input) {
      // Either call their refund API, or return { status: 'manual_required' }
      // if the provider doesn't support automated refunds.
    },
  };
}
```

Tip: most crypto / SEPA providers send `orderId` back in a custom_data / metadata field on the invoice. Stash it there at session create, recover it on webhook.

### 2. Register the provider

Edit `packages/shared/src/payments/registry.ts`:

```ts
import { createCryptoCloudProvider, type CryptoCloudConfig } from './cryptocloud.js';

export interface RegistryConfig {
  // ...existing...
  cryptocloud: CryptoCloudConfig;
}

export function createPaymentRegistry(config: RegistryConfig): PaymentRegistry {
  // ...existing...
  providers.set('CRYPTOCLOUD', createCryptoCloudProvider(config.cryptocloud));
  // ...
}
```

And re-export the factory from `packages/shared/src/payments/index.ts` if external code (tests, scripts) needs it directly.

### 3. Add env vars

In `apps/api/src/env.ts`:

```ts
CRYPTOCLOUD_SHOP_ID: optionalNonEmpty,
CRYPTOCLOUD_API_KEY: optionalNonEmpty,
CRYPTOCLOUD_WEBHOOK_SECRET: optionalNonEmpty,
```

In `apps/worker/src/env.ts` add the same (the worker uses them only when issuing refunds; if the provider doesn't refund, the worker doesn't need the keys).

Pass them in at registry construction in both `apps/api/src/services/payments.ts` and `apps/worker/src/refund.ts`:

```ts
createPaymentRegistry({
  // ...existing...
  cryptocloud: {
    shopId: env.CRYPTOCLOUD_SHOP_ID,
    apiKey: env.CRYPTOCLOUD_API_KEY,
    webhookSecret: env.CRYPTOCLOUD_WEBHOOK_SECRET,
  },
});
```

### 4. Add the enum value to Prisma

`packages/db/prisma/schema.prisma`:

```prisma
enum PaymentProvider {
  STRIPE
  NOWPAYMENTS
  COINBASE_COMMERCE
  CRYPTOCLOUD  // ← new
}
```

Generate a migration:

```sh
pnpm --filter @rustskinpay/db exec prisma migrate dev --name add_cryptocloud_provider
```

Apply to prod Supabase via SQL Editor (paste the contents of the generated `migration.sql`).

### 5. Webhook URL

The new provider's webhook URL is automatically live at:

```
https://api.rustskinpay.com/api/webhooks/cryptocloud
```

(The route lowercases-then-uppercases the path segment to match the provider's `id`. So `/api/webhooks/CRYPTOCLOUD`, `/api/webhooks/cryptocloud`, and `/api/webhooks/CryptoCloud` all hit the same handler.)

Register that URL in the provider's dashboard, paste the webhook secret into env, redeploy api + worker.

### 6. (Optional) Surface the provider in the checkout UI

For a single enabled provider the server picks it automatically; the web client doesn't need to know. To expose a chooser when multiple providers are enabled:

- Add an endpoint `/api/payment-providers` returning the registry's enabled list (id + displayName).
- Render a radio group in `CheckoutButton.tsx`, pass the chosen id to `/api/checkout` as the `provider` field — already wired in the schema.

## Things to watch for

- **Webhook signature must use the raw body**, not a re-stringified JSON. The Fastify route already passes `rawBody`; respect it inside your verifier.
- **Idempotency keys**: the orchestrator dedupes by `(provider, eventId)`. Pick the most reliable identifier your provider exposes. If the provider only sends event payloads without a stable id, derive one (e.g. SHA-256 of the body).
- **Currency**: providers vary on whether amounts are major or minor units. The interface uses minor units (cents) consistently. Convert in your provider impl, not in the orchestrator.
- **Test mode vs live**: keep test and live credentials in separate env vars or feature-flag them. Don't auto-flip based on `NODE_ENV` — that hides accidents.
- **No DB writes from inside provider impls.** The orchestrator owns persistence. If you need to remember something across webhook deliveries, attach it to the order via metadata at session creation and read it back from `envelope.parsed`.
- **Refunds**: if your provider doesn't auto-refund, return `{ status: 'manual_required', reason: '…' }`. The order flips to FAILED and ops is paged via the standard alerting path.

## Why this design

- One file per provider, no orchestrator changes when adding one
- Webhook URL convention auto-derived from provider id — no per-provider route file
- Mock provider lives in the same registry, swapped in by `MOCK_PAYMENTS=true` for dev parity
- Worker shares the same registry so refunds work without an api call

The contract is intentionally narrow (six methods). Anything broader is provider-specific and stays inside the provider file.
