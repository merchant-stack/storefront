// Cover-SKU picker for the merchant deposit gateway.
//
// When a merchant (e.g. cobalt.skin) creates a deposit session for $X, we
// create a Whop Plan under that amount. Whop sees the Plan's title — if we
// gave it something like "Deposit Top-up $50" that screams "payment
// aggregator" and would risk our merchant account.
//
// Instead, pick a REAL Rust skin name from the rust.tm price index whose
// floor sits within tolerance of the deposit amount. Whop sees plausible
// skin-marketplace activity. The customer on our /pay page sees our own
// branded "Deposit to cobalt.skin" UI surrounding the iframe, so the skin
// name in the iframe doesn't confuse them.
//
// The picker is pure: takes an index + amount, returns a name. The caller is
// responsible for loading + caching the price index.

import type { MultiSourcePriceIndex } from './market-prices.js';

export interface PickCoverSkuInput {
  index: MultiSourcePriceIndex;
  /** Target deposit amount in USD cents. */
  amountMinor: number;
  /**
   * Acceptable ±% of the amount when filtering candidates. 30 = ±30%.
   * Wider tolerance = more candidates but less plausible price/skin pairing
   * if Whop ever cross-checks against public market data.
   */
  tolerancePct?: number;
  /** Override RNG for deterministic tests. */
  random?: () => number;
}

export interface CoverSku {
  /** Real Rust market_hash_name. We'll pass this verbatim as the Whop Plan title. */
  marketHashName: string;
  /** Reference price in cents — informational; we still charge the deposit amount, not this. */
  referencePriceMinor: number;
}

const DEFAULT_TOLERANCE_PCT = 30;

/**
 * Pick a random Rust skin whose market floor is near the target amount.
 *
 * Returns null only when the index is empty. With ~5000 skins covering a few
 * cents to multiple thousands of dollars, every realistic deposit amount has
 * a reasonable match; the fallback (closest single skin) handles the edge
 * cases (very low amounts where the floor is above the target, or very high
 * amounts where the ceiling is below).
 */
export function pickCoverSku(input: PickCoverSkuInput): CoverSku | null {
  const entries = input.index.entries();
  if (entries.length === 0) return null;

  const tolerancePct = input.tolerancePct ?? DEFAULT_TOLERANCE_PCT;
  const target = input.amountMinor;
  const minAccept = Math.floor(target * (1 - tolerancePct / 100));
  const maxAccept = Math.ceil(target * (1 + tolerancePct / 100));

  const candidates = entries.filter(
    (e) => e.priceMinor >= minAccept && e.priceMinor <= maxAccept,
  );

  // Fallback: no skin in tolerance band. Pick the skin whose price is
  // numerically closest to the target (could be all way above or all way
  // below for extreme deposit amounts).
  if (candidates.length === 0) {
    let best = entries[0];
    if (!best) return null;
    let bestDistance = Math.abs(best.priceMinor - target);
    for (let i = 1; i < entries.length; i++) {
      const e = entries[i];
      if (!e) continue;
      const distance = Math.abs(e.priceMinor - target);
      if (distance < bestDistance) {
        best = e;
        bestDistance = distance;
      }
    }
    return { marketHashName: best.marketHashName, referencePriceMinor: best.priceMinor };
  }

  const rng = input.random ?? Math.random;
  const idx = Math.min(Math.floor(rng() * candidates.length), candidates.length - 1);
  const pick = candidates[idx]!;
  return { marketHashName: pick.marketHashName, referencePriceMinor: pick.priceMinor };
}
