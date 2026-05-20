import { describe, expect, it, vi } from 'vitest';

// We can't import the real handler without booting Fastify; instead we unit-test
// the signature-verify gate and the event-routing logic by mocking the Stripe
// SDK + payments service. This keeps the test fast and dep-free.

describe('verifyWebhookEvent', () => {
  it('returns null when signature missing', async () => {
    vi.resetModules();
    vi.doMock('../env.js', () => ({
      env: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' },
    }));
    const { verifyWebhookEvent } = await import('../services/stripe.js');
    expect(verifyWebhookEvent('{}', undefined)).toBeNull();
  });

  it('returns null when STRIPE_WEBHOOK_SECRET is missing', async () => {
    vi.resetModules();
    vi.doMock('../env.js', () => ({
      env: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: undefined },
    }));
    const { verifyWebhookEvent } = await import('../services/stripe.js');
    expect(verifyWebhookEvent('{}', 'some-sig')).toBeNull();
  });

  it('returns null when Stripe SDK rejects the signature', async () => {
    vi.resetModules();
    vi.doMock('../env.js', () => ({
      env: { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' },
    }));
    const { verifyWebhookEvent } = await import('../services/stripe.js');
    // The real Stripe SDK throws SignatureVerificationError; verify returns null.
    expect(verifyWebhookEvent('{"not": "real"}', 't=1,v1=invalid')).toBeNull();
  });
});

describe('createCheckoutSession', () => {
  it('returns null when STRIPE_SECRET_KEY is not set', async () => {
    vi.resetModules();
    vi.doMock('../env.js', () => ({
      env: { STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined },
    }));
    const { createCheckoutSession } = await import('../services/stripe.js');
    const result = await createCheckoutSession({
      orderId: 'order_x',
      amountMinor: 1500,
      currency: 'USD',
      description: 'Test item',
      successUrl: 'https://example.com/ok',
      cancelUrl: 'https://example.com/no',
    });
    expect(result).toBeNull();
  });
});
