import { describe, expect, it } from 'vitest';
import * as ed from '@noble/ed25519';
import { applyMarkup, createDMarketClient } from './dmarket.js';

describe('applyMarkup', () => {
  it('returns source price when markup is 0', () => {
    expect(applyMarkup(1000, 0)).toBe(1000);
  });

  it('adds 15% with markupBps=1500', () => {
    // 1000 * 1.15 = 1150
    expect(applyMarkup(1000, 1500)).toBe(1150);
  });

  it('rounds up so we never undercharge against fractional cents', () => {
    // 1 * 1.15 = 1.15 → ceil → 2
    expect(applyMarkup(1, 1500)).toBe(2);
  });

  it('handles zero source price', () => {
    expect(applyMarkup(0, 1500)).toBe(0);
  });

  it('doubles price at markupBps=10000', () => {
    expect(applyMarkup(500, 10000)).toBe(1000);
  });
});

describe('createDMarketClient', () => {
  it('reports mock=true when keys absent', () => {
    expect(createDMarketClient({}).isMock()).toBe(true);
    expect(createDMarketClient({ publicKey: 'x' }).isMock()).toBe(true);
    expect(createDMarketClient({ secretKey: 'x' }).isMock()).toBe(true);
  });

  it('reports mock=false when both keys present', () => {
    const c = createDMarketClient({
      publicKey: '50449d084d506a3dc145d2d45d6ae711e6ae68705e3d754de657b7edec61d976',
      secretKey:
        'db7b564165db94f37756062373a32f44a7892dc215d64aa99e84753396ca5f2a50449d084d506a3dc145d2d45d6ae711e6ae68705e3d754de657b7edec61d976',
    });
    expect(c.isMock()).toBe(false);
  });

  it('searchItems returns mock offers when in mock mode', async () => {
    const offers = await createDMarketClient({}).searchItems({ limit: 3 });
    expect(offers).toHaveLength(3);
    expect(offers[0]).toMatchObject({ currency: 'USD', priceMinor: expect.any(Number) });
    expect(offers[0].offerId).toMatch(/^mock-rust-/);
  });

  it('buyOffer returns success mock-stamp in mock mode', async () => {
    const r = await createDMarketClient({}).buyOffer('offer-123', 1000);
    expect(r.success).toBe(true);
    expect(r.sourcePaymentId).toMatch(/^mock-offer-123-/);
  });

  it('getBalance returns zeroes in mock mode', async () => {
    const b = await createDMarketClient({}).getBalance();
    expect(b).toMatchObject({ usdMinor: 0, dmcMinor: 0 });
  });
});

describe('Ed25519 signing seed derivation', () => {
  // DMarket returns secret keys as 64-byte hex (seed||pubkey). @noble/ed25519
  // wants a 32-byte seed. The client must take the first 32 bytes.
  it('signs and verifies with first 32 bytes of a 64-byte hex key', async () => {
    // Random 32-byte seed.
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 13) & 0xff;
    const pub = await ed.getPublicKeyAsync(seed);

    // Construct a fake 64-byte key like DMarket gives us.
    const combined = new Uint8Array(64);
    combined.set(seed, 0);
    combined.set(pub, 32);

    // The first 32 bytes must reproduce the same public key.
    const derivedSeed = combined.slice(0, 32);
    const derivedPub = await ed.getPublicKeyAsync(derivedSeed);
    expect(Buffer.from(derivedPub).toString('hex')).toBe(Buffer.from(pub).toString('hex'));

    // And a signature made with the derived seed must verify against pub.
    const msg = new TextEncoder().encode('GET/account/v1/balance1779270298');
    const sig = await ed.signAsync(msg, derivedSeed);
    expect(await ed.verifyAsync(sig, msg, pub)).toBe(true);
  });
});
