// Cached MultiSourcePriceIndex for the merchant deposit gateway.
//
// The cover-SKU picker (shared/cover-sku) consults a price index of ~5000
// Rust skins to pick a plausible name for the Whop Plan title. Loading that
// index from rust.tm is a ~350KB HTTP fetch — fine in the worker's 2-min
// sync loop, but unacceptable on the hot path of POST /api/merchant/sessions.
//
// This wrapper:
//   - Loads lazily on first request
//   - Refreshes in the background every TTL_MS
//   - Surfaces a stale-but-usable index if the latest refresh failed
//   - Never blocks a caller on a network fetch beyond the very first load

import { loadMarketPriceIndex, type MultiSourcePriceIndex } from '@rustskinpay/shared/market-prices';

const TTL_MS = 5 * 60 * 1000;

let cached: { index: MultiSourcePriceIndex; loadedAt: number } | null = null;
let inflight: Promise<MultiSourcePriceIndex> | null = null;
let backgroundRefreshTimer: NodeJS.Timeout | null = null;

async function fetchAndCache(): Promise<MultiSourcePriceIndex> {
  if (inflight) return inflight;
  inflight = loadMarketPriceIndex()
    .then((index) => {
      cached = { index, loadedAt: Date.now() };
      return index;
    })
    .catch((err) => {
      // Swallow into a logged failure; if we have a stale cache, keep it.
      // Throw only when there's no prior cache — the caller will 500.
      console.warn('[market-prices-cache] refresh failed:', err instanceof Error ? err.message : err);
      if (cached) return cached.index;
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function scheduleBackgroundRefresh(): void {
  if (backgroundRefreshTimer) return;
  backgroundRefreshTimer = setInterval(() => {
    void fetchAndCache();
  }, TTL_MS);
  // Don't block process shutdown waiting for this timer.
  backgroundRefreshTimer.unref?.();
}

export async function getMarketPriceIndex(): Promise<MultiSourcePriceIndex> {
  if (cached && Date.now() - cached.loadedAt < TTL_MS) return cached.index;
  const index = await fetchAndCache();
  scheduleBackgroundRefresh();
  return index;
}
