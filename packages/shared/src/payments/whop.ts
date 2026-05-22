// Whop implementation of the PaymentProvider interface.
//
// Whop is card + wallet (Apple Pay, Google Pay, ACH, Klarna) friendlier toward
// gray-area verticals than Stripe — see PAYMENT_PROVIDERS.md for the reasoning.
//
// Flow:
//   1. createSession() creates a hidden one-time-payment Plan via
//      POST /api/v1/plans, attaching orderId in metadata. The response contains
//      a `purchase_url` we redirect the buyer to (Whop-hosted checkout page).
//   2. verifyWebhook() validates the Standard-Webhooks-style signature on the
//      incoming POST to /api/webhooks/whop.
//   3. interpretEvent() translates Whop's event names into the orchestrator's
//      InterpretedEvent union — payment.succeeded → payment_succeeded etc.
//   4. refund() calls POST /api/v1/payments/{paymentId}/refund.
//
// Why no SDK: Whop ships @whop/sdk but its webhook-unwrap signature is
// under-documented and the API surface we need is just three endpoints. Raw
// fetch + a small HMAC verifier is more transparent and avoids tight coupling
// to a moving SDK version.

import { createHmac, timingSafeEqual } from 'node:crypto';
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

const DEFAULT_BASE_URL = 'https://api.whop.com';
/** Reject webhooks older than this to neutralise replay attempts. */
const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface WhopProviderConfig {
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  companyId: string | undefined;
  productId: string | undefined;
  baseUrl?: string;
}

interface WhopPlanResponse {
  id: string;
  purchase_url?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface WhopRefundResponse {
  id?: string;
  refunded_amount?: number;
  refunded_at?: string;
}

interface WhopWebhookEnvelope {
  /** Whop event type, e.g. "payment.succeeded". */
  action?: string;
  type?: string;
  /** Stable event id used for idempotency. */
  id?: string;
  /** Event payload. Shape varies per event type. */
  data?: Record<string, unknown>;
}

export function createWhopProvider(config: WhopProviderConfig): PaymentProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;

  return {
    id: 'WHOP',
    displayName: 'Card / Apple Pay / Google Pay (Whop)',

    isEnabled(): boolean {
      return Boolean(
        config.apiKey && config.webhookSecret && config.companyId && config.productId,
      );
    },

    supportsRefunds(): boolean {
      return true;
    },

    async createSession(input: CreateSessionInput): Promise<CreateSessionResult | null> {
      if (!config.apiKey || !config.companyId || !config.productId) return null;

      // Whop accepts the price in major units (e.g. 4.99). We store cents; the
      // orchestrator hands us amountMinor. Use 2 decimals to keep float drift
      // out of the request body.
      const priceMajor = Number((input.amountMinor / 100).toFixed(2));

      const body = {
        company_id: config.companyId,
        product_id: config.productId,
        plan_type: 'one_time' as const,
        initial_price: priceMajor,
        currency: input.currency.toLowerCase(),
        // Plan title is shown on the checkout page; cap at 30 per Whop's limit.
        title: truncate(input.description, 30),
        // Description (max 1000) shows additional product context.
        description: truncate(input.description, 1000),
        // Stash our orderId so the webhook can route back to the right order.
        metadata: { orderId: input.orderId },
        // Don't surface this plan on the public Whop product page — it exists
        // only as a one-shot purchase token for the current buyer.
        visibility: 'hidden' as const,
      };

      const res = await fetch(`${baseUrl}/api/v1/plans`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return null;
      }
      const plan = (await res.json()) as WhopPlanResponse;
      if (!plan.id || !plan.purchase_url) return null;

      return {
        providerSessionId: plan.id,
        redirectUrl: plan.purchase_url,
      };
    },

    verifyWebhook(input: WebhookVerifyInput): WebhookEnvelope | null {
      if (!config.webhookSecret) return null;

      const id = headerValue(input.headers, 'webhook-id');
      const timestamp = headerValue(input.headers, 'webhook-timestamp');
      const signature = headerValue(input.headers, 'webhook-signature');
      if (!id || !timestamp || !signature) return null;

      // Replay defence: reject events whose timestamp deviates from "now"
      // beyond the tolerance window. Whop, like Stripe / Svix, includes a
      // signed timestamp specifically so we can do this.
      const tsSeconds = Number(timestamp);
      if (!Number.isFinite(tsSeconds)) return null;
      const drift = Math.abs(Math.floor(Date.now() / 1000) - tsSeconds);
      if (drift > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) return null;

      // Standard Webhooks: signed content is "{id}.{timestamp}.{body}", HMAC
      // is over the raw request body — never a re-serialised version.
      const rawBody = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
      const signedContent = `${id}.${timestamp}.${rawBody}`;

      const secretBytes = decodeSecret(config.webhookSecret);
      const expected = createHmac('sha256', secretBytes).update(signedContent).digest('base64');

      // The header may contain multiple space-separated "vN,<sig>" pairs to
      // support secret rotation. Accept any matching v1 signature.
      const candidates = signature
        .split(' ')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('v1,'))
        .map((s) => s.slice(3));
      if (candidates.length === 0) return null;

      const expectedBuf = Buffer.from(expected, 'base64');
      const valid = candidates.some((c) => {
        const got = Buffer.from(c, 'base64');
        return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
      });
      if (!valid) return null;

      let parsed: WhopWebhookEnvelope;
      try {
        parsed = JSON.parse(rawBody) as WhopWebhookEnvelope;
      } catch {
        return null;
      }

      const eventType = parsed.action ?? parsed.type ?? '';
      if (!eventType) return null;

      return {
        // Use the webhook-id header as the dedup key — it's the canonical
        // event identifier per Standard Webhooks, more reliable than digging
        // into the parsed body which may not have a stable id field.
        eventId: id,
        eventType,
        parsed,
      };
    },

    interpretEvent(envelope: WebhookEnvelope): InterpretedEvent | null {
      const event = envelope.parsed as WhopWebhookEnvelope;
      const data = (event.data ?? {}) as Record<string, unknown>;
      const eventType = envelope.eventType;

      switch (eventType) {
        case 'payment.succeeded':
        case 'payment_succeeded': {
          const orderId = extractOrderId(data);
          if (!orderId) return null;
          return {
            kind: 'payment_succeeded',
            orderId,
            providerSessionId: extractPlanId(data),
            providerPaymentIntentId: typeof data.id === 'string' ? data.id : undefined,
            buyerEmail: extractBuyerEmail(data),
          };
        }
        case 'payment.failed':
        case 'payment_failed': {
          const orderId = extractOrderId(data);
          if (!orderId) return null;
          return {
            kind: 'payment_failed',
            orderId,
            providerSessionId: extractPlanId(data),
          };
        }
        case 'refund.created':
        case 'refund_created': {
          // Whop's refund payload references the underlying payment_id; that's
          // what we stashed as providerPaymentIntentId at session creation.
          const paymentId =
            (typeof data.payment_id === 'string' ? data.payment_id : null) ??
            (typeof data.id === 'string' ? data.id : null);
          if (!paymentId) return null;
          return { kind: 'refunded', providerPaymentIntentId: paymentId };
        }
        // dispute.created and other events: log via the webhook envelope but
        // don't transition any state automatically — disputes are an
        // operational concern that needs human review.
        default:
          return null;
      }
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      if (!config.apiKey) {
        return { status: 'manual_required', reason: 'whop_not_configured' };
      }
      const body =
        input.amountMinor !== undefined
          ? { partial_amount: Number((input.amountMinor / 100).toFixed(2)) }
          : {};
      try {
        const res = await fetch(
          `${baseUrl}/api/v1/payments/${encodeURIComponent(input.providerPaymentIntentId)}/refund`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify(body),
          },
        );
        if (!res.ok) {
          return {
            status: 'manual_required',
            reason: `whop_refund_http_${res.status}`,
          };
        }
        const payload = (await res.json()) as WhopRefundResponse;
        return {
          status: 'refunded',
          // Whop's refund endpoint mutates the Payment in place rather than
          // returning a separate refund object, so the payment id is the most
          // useful handle to log against the refund row.
          refundId: payload.id ?? input.providerPaymentIntentId,
        };
      } catch (err) {
        return {
          status: 'manual_required',
          reason: err instanceof Error ? err.message : 'whop_refund_error',
        };
      }
    },
  };
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/**
 * Standard Webhooks secrets are prefixed (e.g. `whsec_` or `ws_`) followed by
 * a base64 representation of the raw HMAC key. Strip the prefix at the first
 * underscore, then base64-decode. Fall back to treating the raw string as the
 * key if the suffix isn't valid base64 (covers any future prefix variants).
 */
function decodeSecret(secret: string): Buffer {
  const idx = secret.indexOf('_');
  const suffix = idx === -1 ? secret : secret.slice(idx + 1);
  // Be permissive about the encoding — Whop's exact prefix shape has shifted
  // historically (`whsec_` vs `ws_…`), so try base64 first and fall back to
  // utf8 if the decoded bytes seem corrupted (zero length).
  const decoded = Buffer.from(suffix, 'base64');
  if (decoded.length > 0) return decoded;
  return Buffer.from(secret, 'utf8');
}

function extractOrderId(data: Record<string, unknown>): string | null {
  // The orderId rides on the Plan's metadata (set at createSession). The
  // webhook payload exposes it via either data.plan.metadata.orderId or
  // data.metadata.orderId depending on the event source.
  const plan = (data.plan as Record<string, unknown> | undefined) ?? {};
  const planMeta = (plan.metadata as Record<string, unknown> | undefined) ?? {};
  const directMeta = (data.metadata as Record<string, unknown> | undefined) ?? {};
  for (const source of [directMeta, planMeta]) {
    const v = source.orderId ?? source.order_id;
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

function extractPlanId(data: Record<string, unknown>): string | undefined {
  const plan = data.plan as Record<string, unknown> | undefined;
  if (plan && typeof plan.id === 'string') return plan.id;
  if (typeof data.plan_id === 'string') return data.plan_id;
  return undefined;
}

function extractBuyerEmail(data: Record<string, unknown>): string | undefined {
  const member = data.member as Record<string, unknown> | undefined;
  if (member && typeof member.email === 'string') return member.email;
  if (typeof data.email === 'string') return data.email;
  return undefined;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max);
}
