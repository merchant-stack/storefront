import { describe, it, expect } from 'vitest';
import { pickCoverSku } from './cover-sku.js';
import type { MultiSourcePriceIndex } from './market-prices.js';

const makeIndex = (items: Array<{ name: string; priceMinor: number }>): MultiSourcePriceIndex => {
  const map = new Map(items.map((i) => [i.name, i.priceMinor]));
  return {
    bestFor: (n) => map.get(n) ?? null,
    size: map.size,
    perSource: { test: map.size },
    entries: () => items.map((i) => ({ marketHashName: i.name, priceMinor: i.priceMinor })),
  };
};

describe('pickCoverSku', () => {
  it('returns null on empty index', () => {
    const index = makeIndex([]);
    expect(pickCoverSku({ index, amountMinor: 100 })).toBeNull();
  });

  it('returns a single in-tolerance candidate', () => {
    const index = makeIndex([{ name: 'Tan Boots', priceMinor: 100 }]);
    const result = pickCoverSku({ index, amountMinor: 100, random: () => 0 });
    expect(result).toEqual({ marketHashName: 'Tan Boots', referencePriceMinor: 100 });
  });

  it('picks within tolerance band, ignoring out-of-band items', () => {
    const index = makeIndex([
      { name: 'Cheap Thing', priceMinor: 10 },
      { name: 'Reasonable A', priceMinor: 90 },
      { name: 'Reasonable B', priceMinor: 110 },
      { name: 'Expensive Thing', priceMinor: 5000 },
    ]);
    // amount=100, ±30% → [70..130]. Only the two "Reasonable" items match.
    const result = pickCoverSku({ index, amountMinor: 100, random: () => 0 });
    expect(['Reasonable A', 'Reasonable B']).toContain(result?.marketHashName);
    expect([90, 110]).toContain(result?.referencePriceMinor);
  });

  it('falls back to closest-price item when nothing is in band', () => {
    const index = makeIndex([
      { name: 'Way too cheap', priceMinor: 5 },
      { name: 'Closest below', priceMinor: 50 },
      { name: 'Way too expensive', priceMinor: 99999 },
    ]);
    // amount=100, ±30% → [70..130]. None match, fall back.
    const result = pickCoverSku({ index, amountMinor: 100 });
    expect(result?.marketHashName).toBe('Closest below'); // |50-100|=50 < |99999-100| & < |5-100|=95
  });

  it('honours an explicit RNG for determinism', () => {
    const index = makeIndex([
      { name: 'A', priceMinor: 90 },
      { name: 'B', priceMinor: 100 },
      { name: 'C', priceMinor: 110 },
    ]);
    // 3 candidates; with random() returning 0.5, idx = floor(0.5 * 3) = 1 → "B".
    const result = pickCoverSku({ index, amountMinor: 100, random: () => 0.5 });
    expect(result?.marketHashName).toBe('B');
  });

  it('respects a custom tolerance', () => {
    const index = makeIndex([
      { name: 'A', priceMinor: 50 },
      { name: 'B', priceMinor: 100 },
      { name: 'C', priceMinor: 150 },
    ]);
    // Wide tolerance: 60% means [40..160] → all three match.
    const result = pickCoverSku({
      index,
      amountMinor: 100,
      tolerancePct: 60,
      random: () => 0.99,
    });
    expect(result?.marketHashName).toBe('C');
  });
});
