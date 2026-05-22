import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWaxpeerClient } from './waxpeer.js';

describe('createWaxpeerClient.isMock', () => {
  it('is mock when apiKey is missing', () => {
    expect(createWaxpeerClient({}).isMock()).toBe(true);
  });

  it('is not mock when apiKey is present', () => {
    expect(createWaxpeerClient({ apiKey: 'x' }).isMock()).toBe(false);
  });
});

describe('checkTradeStatuses (mock)', () => {
  it('returns accepted for every queried id in mock mode', async () => {
    const client = createWaxpeerClient({});
    const result = await client.checkTradeStatuses(['1', '2', '3']);
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row.state).toBe('accepted');
      expect(row.rawStatus).toBe(5);
    }
  });

  it('returns empty array for empty input even in mock', async () => {
    const client = createWaxpeerClient({});
    expect(await client.checkTradeStatuses([])).toEqual([]);
  });
});

describe('checkTradeStatuses (live shape)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockResponse(body: unknown): void {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
  }

  it('normalises Waxpeer status codes', async () => {
    mockResponse({
      success: true,
      trades: [
        { id: '100', status: 1 },
        { id: '101', status: 4 },
        { id: '102', status: 5 },
        { id: '103', status: 6, reason: 'buyer declined' },
      ],
    });
    const client = createWaxpeerClient({ apiKey: 'k' });
    const result = await client.checkTradeStatuses(['100', '101', '102', '103']);
    expect(result.map((r) => r.state)).toEqual(['preparing', 'sent', 'accepted', 'declined']);
    expect(result[3].reason).toBe('buyer declined');
    expect(result.map((r) => r.rawStatus)).toEqual([1, 4, 5, 6]);
  });

  it('reports unknown for ids missing from the response', async () => {
    mockResponse({ success: true, trades: [{ id: '100', status: 4 }] });
    const client = createWaxpeerClient({ apiKey: 'k' });
    const result = await client.checkTradeStatuses(['100', '999']);
    expect(result.map((r) => r.id)).toEqual(['100', '999']);
    expect(result[0].state).toBe('sent');
    expect(result[1].state).toBe('unknown');
    expect(result[1].rawStatus).toBeNull();
  });

  it('coerces numeric ids in the response to strings to match input keys', async () => {
    mockResponse({ success: true, trades: [{ id: 26430554, status: 5 }] });
    const client = createWaxpeerClient({ apiKey: 'k' });
    const result = await client.checkTradeStatuses(['26430554']);
    expect(result[0].state).toBe('accepted');
  });

  it('throws on success:false to let callers retry', async () => {
    mockResponse({ success: false, msg: 'rate-limited' });
    const client = createWaxpeerClient({ apiKey: 'k' });
    await expect(client.checkTradeStatuses(['100'])).rejects.toThrow(/rate-limited/);
  });

  it('uses repeated ?id= query parameters', async () => {
    mockResponse({ success: true, trades: [] });
    const client = createWaxpeerClient({ apiKey: 'k' });
    await client.checkTradeStatuses(['100', '101']);
    const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain('/v1/check-many-steam');
    expect(calledUrl).toContain('api=k');
    expect(calledUrl).toContain('id=100');
    expect(calledUrl).toContain('id=101');
  });
});

describe('searchItems cross-game filter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockItemsResponse(items: unknown[]): void {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ success: true, items }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  }

  it('drops CS2 items leaking into a rust query', async () => {
    mockItemsResponse([
      { item_id: '1', name: 'Whiteout Kilt', price: 200 },
      { item_id: '2', name: 'StatTrak™ P2000 | Lifted Spirits (Minimal Wear)', price: 227 },
      { item_id: '3', name: 'AK-47 | Redline (Field-Tested)', price: 5000 },
      { item_id: '4', name: '★ Karambit | Doppler (Factory New)', price: 100000 },
      { item_id: '5', name: 'Panda Rug', price: 88 },
    ]);
    const client = createWaxpeerClient({ apiKey: 'k' });
    const offers = await client.searchItems({ gameId: 'rust' });
    expect(offers.map((o) => o.itemId)).toEqual(['1', '5']);
  });

  it('keeps CS2 items when explicitly requesting csgo', async () => {
    mockItemsResponse([
      { item_id: '2', name: 'StatTrak™ P2000 | Lifted Spirits (Minimal Wear)', price: 227 },
    ]);
    const client = createWaxpeerClient({ apiKey: 'k' });
    const offers = await client.searchItems({ gameId: 'csgo' });
    expect(offers.map((o) => o.itemId)).toEqual(['2']);
  });
});
