import { describe, it, expect } from 'vitest';
import {
  signRequest,
  verifyRequestSignature,
  signWebhook,
  verifyWebhookSignature,
  TIMESTAMP_TOLERANCE_SECONDS,
} from './merchant-hmac.js';

const SECRET = 'test-secret-do-not-use-in-prod';
const BODY = JSON.stringify({ merchant_order_id: 'dep_1', amount_minor: 5000 });
const NOW = 1700000000;

function buildHeaders(s: { timestamp: string; nonce: string; signature: string }) {
  return {
    'x-merchant-id': 'm_cobalt_skin',
    'x-timestamp': s.timestamp,
    'x-nonce': s.nonce,
    'x-signature': s.signature,
  };
}

describe('signRequest + verifyRequestSignature — round-trip', () => {
  it('verifies a freshly-signed request', async () => {
    const signed = signRequest({
      method: 'POST',
      path: '/api/merchant/sessions',
      body: BODY,
      secret: SECRET,
      timestamp: NOW,
    });
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it('verifies under case-mismatched method (signRequest uppercases)', async () => {
    const signed = signRequest({
      method: 'post',
      path: '/api/merchant/sessions',
      body: BODY,
      secret: SECRET,
      timestamp: NOW,
    });
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: true });
  });
});

describe('verifyRequestSignature — rejections', () => {
  const makeSigned = (overrides: { now?: number } = {}) =>
    signRequest({
      method: 'POST',
      path: '/api/merchant/sessions',
      body: BODY,
      secret: SECRET,
      timestamp: overrides.now ?? NOW,
    });

  it('rejects when the merchant id header is missing', async () => {
    const signed = makeSigned();
    const headers = { ...buildHeaders(signed) };
    delete (headers as Record<string, string>)['x-merchant-id'];
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers,
      body: BODY,
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'missing_merchant_id' });
  });

  it('rejects when the timestamp drifts beyond tolerance', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW + TIMESTAMP_TOLERANCE_SECONDS + 1,
    });
    expect(result).toEqual({ valid: false, reason: 'timestamp_drift' });
  });

  it('rejects when the body is tampered post-signing', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: '{"amount_minor":100000000}', // attacker tried to bump amount
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects when the path differs from what was signed', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/admin/payouts',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects when the wrong secret is used', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: 'wrong-secret',
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects malformed nonces', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: { ...buildHeaders(signed), 'x-nonce': 'not-a-hex-string' },
      body: BODY,
      secret: SECRET,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'invalid_nonce_format' });
  });

  it('detects replay via isNonceSeen callback', async () => {
    const signed = makeSigned();
    const result = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
      isNonceSeen: async () => true,
      markNonceSeen: async () => {},
    });
    expect(result).toEqual({ valid: false, reason: 'nonce_replay' });
  });

  it('marks nonce as seen on first valid request, rejects on second', async () => {
    const signed = makeSigned();
    const seen = new Set<string>();
    const isNonceSeen = async (n: string) => seen.has(n);
    const markNonceSeen = async (n: string) => {
      seen.add(n);
    };

    const first = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
      isNonceSeen,
      markNonceSeen,
    });
    expect(first).toEqual({ valid: true });

    const second = await verifyRequestSignature({
      method: 'POST',
      path: '/api/merchant/sessions',
      headers: buildHeaders(signed),
      body: BODY,
      secret: SECRET,
      now: () => NOW,
      isNonceSeen,
      markNonceSeen,
    });
    expect(second).toEqual({ valid: false, reason: 'nonce_replay' });
  });
});

describe('signWebhook + verifyWebhookSignature — round-trip', () => {
  it('verifies a webhook our worker signed', () => {
    const body = JSON.stringify({ event: 'session.paid', session_id: 'ord_abc', amount_minor: 5000 });
    const signed = signWebhook({
      secret: SECRET,
      eventId: 'evt_xyz',
      body,
      timestamp: NOW,
    });
    const result = verifyWebhookSignature({
      secret: SECRET,
      eventId: signed.eventId,
      timestamp: signed.timestamp,
      signature: signed.signature,
      body,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: true });
  });

  it('rejects when the event id differs from what was signed', () => {
    const body = JSON.stringify({ event: 'session.paid' });
    const signed = signWebhook({
      secret: SECRET,
      eventId: 'evt_xyz',
      body,
      timestamp: NOW,
    });
    const result = verifyWebhookSignature({
      secret: SECRET,
      eventId: 'evt_OTHER',
      timestamp: signed.timestamp,
      signature: signed.signature,
      body,
      now: () => NOW,
    });
    expect(result).toEqual({ valid: false, reason: 'signature_mismatch' });
  });

  it('rejects stale webhooks beyond drift window', () => {
    const body = '{}';
    const signed = signWebhook({ secret: SECRET, eventId: 'evt_1', body, timestamp: NOW });
    const result = verifyWebhookSignature({
      secret: SECRET,
      eventId: signed.eventId,
      timestamp: signed.timestamp,
      signature: signed.signature,
      body,
      now: () => NOW + TIMESTAMP_TOLERANCE_SECONDS + 1,
    });
    expect(result).toEqual({ valid: false, reason: 'timestamp_drift' });
  });
});
