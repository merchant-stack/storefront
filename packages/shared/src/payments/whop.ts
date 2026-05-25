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
        // Capture Whop's error body so the upstream `payment_provider_unavailable`
        // 503 is debuggable from server logs — without this we just see "null"
        // and the buyer-facing message, with no idea WHY Whop refused (disabled
        // payment method, plan limit, currency unsupported, etc.). console.error
        // (rather than a passed-in logger) keeps the provider package signature
        // unchanged; the api's pino + docker logs capture stderr lines fine.
        const errBody = await res.text().catch(() => '<unreadable>');
        console.error(
          JSON.stringify({
            level: 'error',
            provider: 'whop',
            endpoint: '/api/v1/plans',
            status: res.status,
            // Cap body at 500 chars — Whop errors are usually short JSON, this
            // prevents accidentally flooding logs if they ever return HTML.
            body: errBody.slice(0, 500),
            orderId: input.orderId,
            msg: 'whop plan creation failed',
          }),
        );
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

      // Whop's signing format, confirmed live 2026-05-23: HMAC-SHA256 over
      //   "{webhook-id}.{webhook-timestamp}.{rawBody}"
      // with the raw secret string (prefix + suffix, e.g. "ws_c18ac…") used
      // verbatim as the UTF-8 key. Notably, this DIVERGES from the reference
      // Standard Webhooks spec, which strips the prefix and base64-decodes
      // the suffix — Whop doesn't decode at all. Discovered by brute-forcing
      // all combinations against a real Test event from the dashboard.
      const rawBody = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
      const signedContent = `${id}.${timestamp}.${rawBody}`;
      const expected = createHmac('sha256', Buffer.from(config.webhookSecret, 'utf8'))
        .update(signedContent)
        .digest();

      // The header may contain multiple space-separated "vN,<sig>" pairs to
      // support secret rotation. Accept any matching v1 signature.
      const candidates = signature
        .split(' ')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('v1,'))
        .map((s) => s.slice(3));
      if (candidates.length === 0) return null;

      const valid = candidates.some((c) => {
        const got = Buffer.from(c, 'base64');
        return got.length === expected.length && timingSafeEqual(got, expected);
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
 * Decode a Standard-Webhooks-style signing secret like `<prefix>_<encoded-key>`.
 *
 * The reference spec (svix / standardwebhooks.com) defines the suffix as
 * base64, but Whop diverges: in 2026 their dashboard issues secrets shaped
 * `ws_<64 lowercase hex chars>` — a 32-byte HMAC key encoded as hex, not
 * base64. Detect by character set:
 *   - if suffix has even length and every char is in `[0-9a-fA-F]`, treat as hex
 *   - otherwise treat as base64
 *   - if both decodings fail (zero length), use the raw secret as utf-8 bytes
 *     so the verifier degrades gracefully against any future format change
 *
 * This is the verifier's single-point-of-truth for secret encoding — keep all
 * format-sniffing here so HMAC computation stays a clean one-liner.
 */

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
