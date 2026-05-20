// Provider-agnostic payment abstraction.
//
// Concrete providers (Stripe, NOWPayments, Coinbase Commerce, CryptoCloud, …)
// implement PaymentProvider. The orchestrator (apps/api/src/services/payments.ts)
// and the refunder (apps/worker/src/refund.ts) call the abstract methods and
// never touch a provider SDK directly. Adding a new provider is a 4-step
// process documented in PAYMENT_PROVIDERS.md.

/** Internal identifier — matches the PaymentProvider enum in Prisma schema. */
export type PaymentProviderId = 'STRIPE' | 'NOWPAYMENTS' | 'COINBASE_COMMERCE' | (string & {});

export interface CreateSessionInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
  imageUrl?: string;
  buyerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateSessionResult {
  providerSessionId: string;
  /** Populated only by providers that pre-create a payment intent (e.g. Stripe). */
  providerPaymentIntentId?: string;
  redirectUrl: string;
}

/** Headers + body the webhook handler hands to the provider for signature verification. */
export interface WebhookVerifyInput {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookEnvelope {
  /** Provider-side event identifier, used for idempotency. */
  eventId: string;
  /** Provider-side event type, e.g. 'checkout.session.completed'. */
  eventType: string;
  /** Raw parsed event payload, passed back to interpretEvent. */
  parsed: unknown;
}

/**
 * Internal event kinds the orchestrator reacts to. Providers translate their
 * native events into one of these. Returning null means "ignore" (e.g. for
 * intermediate states like 'confirming').
 */
export type InterpretedEvent =
  | {
      kind: 'payment_succeeded';
      orderId: string;
      providerSessionId?: string;
      providerPaymentIntentId?: string;
      buyerEmail?: string;
    }
  | {
      kind: 'payment_cancelled' | 'payment_failed';
      orderId: string;
      providerSessionId?: string;
    }
  | {
      kind: 'refunded';
      providerPaymentIntentId: string;
    };

export interface RefundInput {
  /** What we persisted on Payment.providerPaymentIntentId at session creation. */
  providerPaymentIntentId: string;
  /** Omit for a full refund of the original charge. */
  amountMinor?: number;
  currency?: string;
  reason: string;
  orderId: string;
}

export type RefundResult =
  | { status: 'refunded'; refundId: string }
  | { status: 'manual_required'; reason: string };

/**
 * The provider contract. An instance is registered in the provider registry
 * (see packages/shared/src/payments/registry.ts). Implementations must be
 * stateless once constructed — the registry caches one instance per process.
 */
export interface PaymentProvider {
  readonly id: PaymentProviderId;
  /** Human-readable label shown to buyers on the checkout chooser. */
  readonly displayName: string;

  /** True when this provider's env vars are configured and it can serve traffic. */
  isEnabled(): boolean;

  /** Some providers (mocks, on-chain) don't need a real refund path. Override to false. */
  supportsRefunds(): boolean;

  createSession(input: CreateSessionInput): Promise<CreateSessionResult | null>;

  verifyWebhook(input: WebhookVerifyInput): WebhookEnvelope | null;

  interpretEvent(envelope: WebhookEnvelope): InterpretedEvent | null;

  refund(input: RefundInput): Promise<RefundResult>;
}
