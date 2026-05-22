import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWhopProvider } from './whop.js';

const CFG = {
  apiKey: 'apik_test',
  // ws_ prefix + raw 32-byte base64 secret.
  webhookSecret: 'ws_' + Buffer.from('secret-bytes-for-test-1234567890').toString('base64'),
  companyId: 'biz_test',
  productId: 'prod_test',
};

function sign(secret: string, id: string, ts: string, body: string): string {
  const idx = secret.indexOf('_');
  const suffix = idx === -1 ? secret : secret.slice(idx + 1);
  const decoded = Buffer.from(suffix, 'base64');
  const key = decoded.length > 0 ? decoded : Buffer.from(secret, 'utf8');
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return `v1,${sig}`;
}

describe('createWhopProvider.isEnabled', () => {
  it('false when any of the 4 settings is missing', () => {
    for (const missing of ['apiKey', 'webhookSecret', 'companyId', 'productId'] as const) {
      const cfg = { ...CFG, [missing]: undefined };
      expect(createWhopProvider(cfg).isEnabled()).toBe(false);
    }
  });

  it('true when all 4 settings are present', () => {
    expect(createWhopProvider(CFG).isEnabled()).toBe(true);
  });
});

describe('verifyWebhook', () => {
  it('accepts a correctly signed payload', () => {
    const provider = createWhopProvider(CFG);
    const body = JSON.stringify({ action: 'payment.succeeded', data: { id: 'pay_1' } });
    const id = 'msg_abc123';
    const ts = String(Math.floor(Date.now() / 1000));
    const signature = sign(CFG.webhookSecret, id, ts, body);

    const env = provider.verifyWebhook({
      rawBody: body,
      headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': signature },
    });
    expect(env).not.toBeNull();
    expect(env?.eventId).toBe(id);
    expect(env?.eventType).toBe('payment.succeeded');
  });

  it('rejects when signature is wrong', () => {
    const provider = createWhopProvider(CFG);
    const body = JSON.stringify({ action: 'payment.succeeded' });
    const id = 'msg_x';
    const ts = String(Math.floor(Date.now() / 1000));
    const env = provider.verifyWebhook({
      rawBody: body,
      headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': 'v1,deadbeef' },
    });
    expect(env).toBeNull();
  });

  it('rejects when timestamp is stale (> 5 min)', () => {
    const provider = createWhopProvider(CFG);
    const body = JSON.stringify({ action: 'payment.succeeded' });
    const id = 'msg_x';
    const ts = String(Math.floor(Date.now() / 1000) - 10 * 60); // 10 minutes ago
    const signature = sign(CFG.webhookSecret, id, ts, body);
    const env = provider.verifyWebhook({
      rawBody: body,
      headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': signature },
    });
    expect(env).toBeNull();
  });

  it('accepts when multiple signatures are present and at least one is valid', () => {
    const provider = createWhopProvider(CFG);
    const body = JSON.stringify({ action: 'payment.succeeded' });
    const id = 'msg_x';
    const ts = String(Math.floor(Date.now() / 1000));
    const good = sign(CFG.webhookSecret, id, ts, body);
    const multi = `v1,deadbeef ${good}`;
    const env = provider.verifyWebhook({
      rawBody: body,
      headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': multi },
    });
    expect(env).not.toBeNull();
  });

  it('returns null when required headers are missing', () => {
    const provider = createWhopProvider(CFG);
    expect(
      provider.verifyWebhook({ rawBody: '{}', headers: {} }),
    ).toBeNull();
  });
});

describe('interpretEvent', () => {
  const provider = createWhopProvider(CFG);

  it('maps payment.succeeded with orderId in plan.metadata', () => {
    const result = provider.interpretEvent({
      eventId: 'msg_1',
      eventType: 'payment.succeeded',
      parsed: {
        action: 'payment.succeeded',
        data: {
          id: 'pay_xyz',
          plan: { id: 'plan_abc', metadata: { orderId: 'order_42' } },
          member: { email: 'buyer@example.com' },
        },
      },
    });
    expect(result).toEqual({
      kind: 'payment_succeeded',
      orderId: 'order_42',
      providerSessionId: 'plan_abc',
      providerPaymentIntentId: 'pay_xyz',
      buyerEmail: 'buyer@example.com',
    });
  });

  it('maps payment.succeeded with orderId in top-level metadata', () => {
    const result = provider.interpretEvent({
      eventId: 'msg_1',
      eventType: 'payment.succeeded',
      parsed: {
        action: 'payment.succeeded',
        data: { id: 'pay_xyz', metadata: { orderId: 'order_99' } },
      },
    });
    expect(result?.kind).toBe('payment_succeeded');
    expect(result && 'orderId' in result ? result.orderId : null).toBe('order_99');
  });

  it('maps refund.created using payment_id', () => {
    const result = provider.interpretEvent({
      eventId: 'msg_r',
      eventType: 'refund.created',
      parsed: { action: 'refund.created', data: { payment_id: 'pay_abc' } },
    });
    expect(result).toEqual({ kind: 'refunded', providerPaymentIntentId: 'pay_abc' });
  });

  it('returns null when payment.succeeded has no orderId', () => {
    const result = provider.interpretEvent({
      eventId: 'msg_x',
      eventType: 'payment.succeeded',
      parsed: { action: 'payment.succeeded', data: { id: 'pay_xyz' } },
    });
    expect(result).toBeNull();
  });

  it('returns null for unknown event types', () => {
    const result = provider.interpretEvent({
      eventId: 'msg_x',
      eventType: 'dispute.created',
      parsed: { action: 'dispute.created', data: { id: 'dis_1' } },
    });
    expect(result).toBeNull();
  });
});

describe('createSession', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to /api/v1/plans with priceMajor + metadata.orderId, returns purchase_url', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(
        JSON.stringify({ id: 'plan_xyz', purchase_url: 'https://whop.com/rustsupply/checkout/plan_xyz' }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    const provider = createWhopProvider(CFG);
    const result = await provider.createSession({
      orderId: 'ord_1',
      amountMinor: 499,
      currency: 'USD',
      description: 'Whiteout Kilt',
      successUrl: 'https://rustsupply.com/checkout/success?orderId=ord_1',
      cancelUrl: 'https://rustsupply.com/checkout/cancelled?orderId=ord_1',
    });

    expect(result).toEqual({
      providerSessionId: 'plan_xyz',
      redirectUrl: 'https://whop.com/rustsupply/checkout/plan_xyz',
    });

    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.whop.com/api/v1/plans');
    expect((opts as { headers: Record<string, string> }).headers.Authorization).toBe(`Bearer ${CFG.apiKey}`);
    const sentBody = JSON.parse((opts as { body: string }).body);
    expect(sentBody.initial_price).toBe(4.99);
    expect(sentBody.company_id).toBe('biz_test');
    expect(sentBody.product_id).toBe('prod_test');
    expect(sentBody.plan_type).toBe('one_time');
    expect(sentBody.metadata).toEqual({ orderId: 'ord_1' });
    expect(sentBody.visibility).toBe('hidden');
  });

  it('returns null when Whop returns non-OK', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response('bad request', { status: 400 }),
    );
    const provider = createWhopProvider(CFG);
    const result = await provider.createSession({
      orderId: 'ord_1',
      amountMinor: 100,
      currency: 'USD',
      description: 'x',
      successUrl: '',
      cancelUrl: '',
    });
    expect(result).toBeNull();
  });
});
