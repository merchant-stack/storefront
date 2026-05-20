import { describe, expect, it } from 'vitest';
import { createStripeProvider } from '@rustskinpay/shared/payments';

// We test the Stripe provider's webhook verification and session creation
// behaviour at the unit level — booting Fastify is overkill for the gate
// logic, and the provider is the source of truth for the actual signature
// check + Stripe SDK calls.

describe('Stripe provider — verifyWebhook', () => {
  it('returns null when signature header missing', () => {
    const provider = createStripeProvider({ secretKey: 'sk_test_x', webhookSecret: 'whsec_x' });
    expect(provider.verifyWebhook({ rawBody: '{}', headers: {} })).toBeNull();
  });

  it('returns null when webhook secret is not configured', () => {
    const provider = createStripeProvider({ secretKey: 'sk_test_x', webhookSecret: undefined });
    expect(
      provider.verifyWebhook({ rawBody: '{}', headers: { 'stripe-signature': 'some-sig' } }),
    ).toBeNull();
  });

  it('returns null when Stripe SDK rejects the signature', () => {
    const provider = createStripeProvider({ secretKey: 'sk_test_x', webhookSecret: 'whsec_x' });
    expect(
      provider.verifyWebhook({
        rawBody: '{"not": "real"}',
        headers: { 'stripe-signature': 't=1,v1=invalid' },
      }),
    ).toBeNull();
  });
});

describe('Stripe provider — createSession', () => {
  it('returns null when secret key is not configured', async () => {
    const provider = createStripeProvider({ secretKey: undefined, webhookSecret: undefined });
    expect(provider.isEnabled()).toBe(false);
    const result = await provider.createSession({
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
