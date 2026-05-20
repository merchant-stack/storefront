// Mock provider used in local development when no real provider is configured.
// Activated by setting MOCK_PAYMENTS=true. The web app redirects to its
// /checkout/mock page where dev clicks "Confirm payment" to drive the flow.
//
// NEVER enable in production — would let anyone "pay" and trigger real Skin
// dispatch. The orchestrator guards on env.NODE_ENV at boot.

import type {
  CreateSessionInput,
  CreateSessionResult,
  InterpretedEvent,
  PaymentProvider,
  RefundInput,
  RefundResult,
  WebhookEnvelope,
  WebhookVerifyInput,
} from './types.js';

export interface MockProviderConfig {
  enabled: boolean;
  webOrigin: string;
}

export function createMockProvider(config: MockProviderConfig): PaymentProvider {
  return {
    id: 'STRIPE', // Reuse STRIPE enum so existing Payment rows continue to work.
    displayName: 'Mock (dev only)',

    isEnabled: () => config.enabled,
    supportsRefunds: () => true,

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult | null> {
      const providerSessionId = `mock_${input.orderId}_${Date.now().toString(36)}`;
      const redirectUrl = `${config.webOrigin}/checkout/mock?orderId=${encodeURIComponent(input.orderId)}`;
      return { providerSessionId, redirectUrl };
    },

    verifyWebhook(_input: WebhookVerifyInput): WebhookEnvelope | null {
      // Mock provider doesn't dispatch real webhooks — the /checkout/mock page
      // calls a dev-only endpoint directly. Webhook verify always fails.
      return null;
    },

    interpretEvent(_envelope: WebhookEnvelope): InterpretedEvent | null {
      return null;
    },

    async refund(_input: RefundInput): Promise<RefundResult> {
      // Mock refunds are recorded by the orchestrator without calling out.
      return { status: 'refunded', refundId: `mock_refund_${Date.now().toString(36)}` };
    },
  };
}
