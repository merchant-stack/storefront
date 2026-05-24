// Merchant-gateway HMAC primitives.
//
// Two complementary flows live here:
//
//   1. INBOUND request signature — merchant (e.g. cobalt.skin) signs each
//      API request to us with their api secret. We verify before doing
//      anything. Used on POST /api/merchant/sessions.
//
//   2. OUTBOUND webhook signature — we sign the JSON payload we deliver to
//      the merchant's webhook URL with the merchant's webhook secret. The
//      merchant verifies before crediting any user balance.
//
// Both schemes follow the Stripe / Whop "signed-content" pattern with
// HMAC-SHA256, timing-safe comparison, and timestamp drift rejection.
//
// Request signature canonical string:
//   METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + SHA256_HEX(BODY)
// Headers we expect: X-Merchant-Id, X-Timestamp (unix seconds), X-Nonce
// (hex string), X-Signature (hex of HMAC).
//
// Webhook signature canonical string:
//   EVENT_ID + "." + TIMESTAMP + "." + BODY
// (Dot-separated, body is the raw bytes, not a hash, because outbound bodies
// are small JSON and reproducing them client-side is trivial. This matches
// Whop / Svix / Standard Webhooks conventions.)

import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Reject signed requests whose `timestamp` deviates from "now" by more than this. */
export const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

/** Nonces should be retained in the replay-protection store at least 2× the tolerance window. */
export const NONCE_RETENTION_SECONDS = TIMESTAMP_TOLERANCE_SECONDS * 2;

// ---------------------------------------------------------------------------
// Inbound request signing / verification
// ---------------------------------------------------------------------------

export interface SignRequestInput {
  method: string;
  path: string;
  body: string;
  secret: string;
  /** Override for deterministic testing. Defaults to current epoch seconds. */
  timestamp?: number;
  /** Override for deterministic testing. Defaults to random 32 hex chars. */
  nonce?: string;
}

export interface SignedRequest {
  timestamp: string;
  nonce: string;
  signature: string;
}

/**
 * Compute headers a merchant should send on a signed request to our API.
 * Used by our own integration test client + as a reference for the merchant's
 * dev when implementing their integration.
 */
export function signRequest(input: SignRequestInput): SignedRequest {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomBytes(16).toString('hex');
  const bodyHash = createHash('sha256').update(input.body, 'utf8').digest('hex');
  const stringToSign = [input.method.toUpperCase(), input.path, timestamp, nonce, bodyHash].join(
    '\n',
  );
  const signature = createHmac('sha256', input.secret).update(stringToSign).digest('hex');
  return { timestamp, nonce, signature };
}

export interface VerifyRequestInput {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  secret: string;
  /**
   * Optional replay-protection callbacks. If provided, the verifier rejects
   * nonces it's seen before within the retention window.
   *
   * Implementation note for callers: in api this is typically Redis with key
   * `merchant:nonce:<merchantId>:<nonce>` and TTL = NONCE_RETENTION_SECONDS.
   * Returning true from isNonceSeen skips the mark step.
   */
  isNonceSeen?: (nonce: string) => Promise<boolean>;
  markNonceSeen?: (nonce: string, ttlSeconds: number) => Promise<void>;
  /** Override for deterministic testing. */
  now?: () => number;
}

export type VerifyRequestResult = { valid: true } | { valid: false; reason: VerifyFailReason };

export type VerifyFailReason =
  | 'missing_merchant_id'
  | 'missing_timestamp'
  | 'missing_nonce'
  | 'missing_signature'
  | 'invalid_timestamp'
  | 'invalid_nonce_format'
  | 'invalid_signature_encoding'
  | 'timestamp_drift'
  | 'signature_mismatch'
  | 'nonce_replay';

export async function verifyRequestSignature(
  input: VerifyRequestInput,
): Promise<VerifyRequestResult> {
  const merchantId = headerValue(input.headers, 'x-merchant-id');
  const timestamp = headerValue(input.headers, 'x-timestamp');
  const nonce = headerValue(input.headers, 'x-nonce');
  const signature = headerValue(input.headers, 'x-signature');

  if (!merchantId) return fail('missing_merchant_id');
  if (!timestamp) return fail('missing_timestamp');
  if (!nonce) return fail('missing_nonce');
  if (!signature) return fail('missing_signature');

  const tsSec = Number(timestamp);
  if (!Number.isFinite(tsSec) || !Number.isInteger(tsSec)) return fail('invalid_timestamp');

  const now = (input.now ?? (() => Math.floor(Date.now() / 1000)))();
  const drift = Math.abs(now - tsSec);
  if (drift > TIMESTAMP_TOLERANCE_SECONDS) return fail('timestamp_drift');

  // Nonce shape: 16-64 hex chars (8-32 bytes of entropy). Rejects empty
  // strings, base64, JWTs, and other garbage that might pass loose checks.
  if (!/^[a-f0-9]{16,64}$/i.test(nonce)) return fail('invalid_nonce_format');

  // Compute the expected HMAC.
  const bodyHash = createHash('sha256').update(input.body, 'utf8').digest('hex');
  const stringToSign = [input.method.toUpperCase(), input.path, timestamp, nonce, bodyHash].join(
    '\n',
  );
  const expected = createHmac('sha256', input.secret).update(stringToSign).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return fail('invalid_signature_encoding');
  }
  if (provided.length !== expected.length) return fail('signature_mismatch');
  if (!timingSafeEqual(provided, expected)) return fail('signature_mismatch');

  // Replay protection runs LAST: only burn a nonce slot on an otherwise-valid
  // request. Otherwise an attacker could DOS our nonce store by spamming
  // junk requests with carefully-chosen nonces.
  if (input.isNonceSeen) {
    const seen = await input.isNonceSeen(nonce);
    if (seen) return fail('nonce_replay');
  }
  if (input.markNonceSeen) {
    await input.markNonceSeen(nonce, NONCE_RETENTION_SECONDS);
  }

  return { valid: true };
}

// ---------------------------------------------------------------------------
// Outbound webhook signing / verification
// ---------------------------------------------------------------------------

export interface SignWebhookInput {
  secret: string;
  eventId: string;
  body: string;
  timestamp?: number;
}

export interface SignedWebhook {
  eventId: string;
  timestamp: string;
  signature: string;
}

export function signWebhook(input: SignWebhookInput): SignedWebhook {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const stringToSign = [input.eventId, timestamp, input.body].join('.');
  const signature = createHmac('sha256', input.secret).update(stringToSign).digest('hex');
  return { eventId: input.eventId, timestamp, signature };
}

/**
 * Reference implementation of the merchant-side webhook verifier. Their dev
 * is welcome to port this to their stack (PHP / Python / Go). We expose it
 * here mostly for our own integration tests + docs.
 */
export function verifyWebhookSignature(input: {
  secret: string;
  eventId: string;
  timestamp: string;
  signature: string;
  body: string;
  now?: () => number;
}): VerifyRequestResult {
  const tsSec = Number(input.timestamp);
  if (!Number.isFinite(tsSec) || !Number.isInteger(tsSec)) return fail('invalid_timestamp');

  const now = (input.now ?? (() => Math.floor(Date.now() / 1000)))();
  if (Math.abs(now - tsSec) > TIMESTAMP_TOLERANCE_SECONDS) return fail('timestamp_drift');

  const stringToSign = [input.eventId, input.timestamp, input.body].join('.');
  const expected = createHmac('sha256', input.secret).update(stringToSign).digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(input.signature, 'hex');
  } catch {
    return fail('invalid_signature_encoding');
  }
  if (provided.length !== expected.length) return fail('signature_mismatch');
  if (!timingSafeEqual(provided, expected)) return fail('signature_mismatch');
  return { valid: true };
}

// ---------------------------------------------------------------------------
// internals
// ---------------------------------------------------------------------------

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function fail(reason: VerifyFailReason): VerifyRequestResult {
  return { valid: false, reason };
}
