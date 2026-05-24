// Public market-price discovery. Used by the OWN_INVENTORY sync job to set
// our retail prices: we hold inventory in our Steam bot account and price
// each item at MAX(public marketplace floor) * (1 + markup).
//
// All sources here are PUBLIC endpoints — no auth, no API key, no merchant
// account needed. We're only READING prices for discovery, never buying
// from these endpoints. Buys are filled from our own Steam inventory.
//
// Sources currently wired:
//   - rust.tm: /api/v2/prices/USD.json — decimal-dollar strings, ~350KB,
//     covers most Rust skins with their current floor price.
//
// Future sources (not yet wired — add when needed):
//   - DMarket /exchange/v1/market/items?gameId=rust — paginated, has
//     instant-buy + offers; would need per-item lookups or a bulk dump if
//     they expose one.
//   - Waxpeer /v1/prices?game=rust — needs check; their main listing
//     endpoint requires API key.
//   - Steam Community Market — anti-bot, would need careful scraping.

const RUSTTM_PRICES_URL = 'https://rust.tm/api/v2/prices/USD.json';

const FETCH_TIMEOUT_MS = 15_000;

interface RustTmBulkPriceRow {
  market_hash_name?: string;
  price?: string;
  volume?: string | number;
}

interface RustTmBulkPricesResponse {
  success?: boolean;
  items?: RustTmBulkPriceRow[];
}

/**
 * Indexed price snapshot. Keys are market_hash_name. Values are price in
 * USD cents (integer). Items with zero or unparseable prices are excluded.
 */
export type MarketPriceIndex = Map<string, number>;

async function fetchRustTm(): Promise<MarketPriceIndex> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(RUSTTM_PRICES_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`rust.tm prices ${res.status}`);
    const body = (await res.json()) as RustTmBulkPricesResponse;
    if (!body.success) throw new Error('rust.tm prices returned success=false');
    const index: MarketPriceIndex = new Map();
    for (const row of body.items ?? []) {
      const name = row.market_hash_name;
      const priceStr = row.price;
      if (!name || typeof priceStr !== 'string') continue;
      const priceUsd = Number(priceStr);
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) continue;
      // rust.tm returns decimal-dollar strings (e.g. "0.140" = $0.14).
      // Convert to integer cents.
      const cents = Math.round(priceUsd * 100);
      if (cents <= 0) continue;
      index.set(name, cents);
    }
    return index;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Combined market price for a given Rust item, in USD cents. Takes the MAX
 * across all currently-wired sources — buyers paying our markup expect a
 * price that beats the highest marketplace floor, not the lowest.
 *
 * Returns null when the item is in no source's index (e.g. it's a rare item
 * with no current listings, or we got rate-limited fetching prices).
 */
export interface MultiSourcePriceIndex {
  /** Return the max-priced cents value across all sources for this hash name, or null if no source has it. */
  bestFor(marketHashName: string): number | null;
  /** Number of items with at least one source price. */
  size: number;
  /** Per-source counts, for logging. */
  perSource: Record<string, number>;
}

export async function loadMarketPriceIndex(): Promise<MultiSourcePriceIndex> {
  // Today: rust.tm only. Wire DMarket + Waxpeer here as additional sources;
  // bestFor() should take Math.max() across whichever sources had the item.
  const sources: Array<{ name: string; index: MarketPriceIndex }> = [];
  try {
    sources.push({ name: 'rust.tm', index: await fetchRustTm() });
  } catch (err) {
    // Don't fail the whole sync if one source errors — log and continue.
    // The caller decides what to do when bestFor() returns null for items
    // it expected to price.
    console.warn(`market-prices: rust.tm fetch failed: ${(err as Error).message}`);
  }

  const combinedNames = new Set<string>();
  for (const s of sources) for (const k of s.index.keys()) combinedNames.add(k);

  return {
    bestFor(marketHashName: string): number | null {
      let best: number | null = null;
      for (const s of sources) {
        const p = s.index.get(marketHashName);
        if (p !== undefined && (best === null || p > best)) best = p;
      }
      return best;
    },
    size: combinedNames.size,
    perSource: Object.fromEntries(sources.map((s) => [s.name, s.index.size])),
  };
}
