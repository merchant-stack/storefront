// Provider registry — single place that knows which providers exist and which
// are configured. The api and worker both call createPaymentRegistry() at boot
// passing their env, then ask the returned registry for providers by id or for
// the list of enabled providers.
//
// Adding a new provider:
//   1. Implement PaymentProvider in a sibling file (e.g. ./nowpayments.ts)
//   2. Add a factory call here behind the relevant env-var check
//   3. Add the provider's env vars to apps/api/src/env.ts and apps/worker/src/env.ts
//   4. If the provider needs a new id in the Prisma PaymentProvider enum, add
//      a migration. See PAYMENT_PROVIDERS.md for the full checklist.

import { createMockProvider, type MockProviderConfig } from './mock.js';
import { createStripeProvider, type StripeProviderConfig } from './stripe.js';
import type { PaymentProvider, PaymentProviderId } from './types.js';

export interface RegistryConfig {
  /** Web origin used by mock provider and Stripe success/cancel URLs. */
  webOrigin: string;
  /** When true, replaces real providers with the mock one. Dev-only. */
  mockPayments: boolean;
  stripe: StripeProviderConfig;
  // Add future providers here, e.g.:
  // nowpayments: NowpaymentsProviderConfig;
  // coinbaseCommerce: CoinbaseCommerceProviderConfig;
}

export interface PaymentRegistry {
  /** Get a provider by id. Returns null if not registered or not enabled. */
  get(id: PaymentProviderId): PaymentProvider | null;
  /** All providers that are configured and ready to serve. */
  enabled(): PaymentProvider[];
  /** Default provider chosen when the client doesn't specify one. */
  default(): PaymentProvider | null;
}

export function createPaymentRegistry(config: RegistryConfig): PaymentRegistry {
  const providers = new Map<PaymentProviderId, PaymentProvider>();

  if (config.mockPayments) {
    // In mock mode the mock provider takes the STRIPE slot so existing Order
    // / Payment rows continue to round-trip cleanly.
    const mockConfig: MockProviderConfig = {
      enabled: true,
      webOrigin: config.webOrigin,
    };
    providers.set('STRIPE', createMockProvider(mockConfig));
  } else {
    providers.set('STRIPE', createStripeProvider(config.stripe));
    // Register additional providers here as they are added, e.g.:
    // providers.set('NOWPAYMENTS', createNowpaymentsProvider(config.nowpayments));
  }

  const enabled = (): PaymentProvider[] =>
    [...providers.values()].filter((p) => p.isEnabled());

  return {
    get(id: PaymentProviderId): PaymentProvider | null {
      const p = providers.get(id);
      return p && p.isEnabled() ? p : null;
    },
    enabled,
    default(): PaymentProvider | null {
      return enabled()[0] ?? null;
    },
  };
}
