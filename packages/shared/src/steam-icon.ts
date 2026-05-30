// Resolve a real Steam Community Market icon URL for a Rust market_hash_name.
//
// Unauthenticated, lightly rate-limited public endpoint. Used in two places:
//   - worker SHOWCASE sync (bulk, spaced out, generous timeout)
//   - merchant deposit gateway, to put a real skin image on the /pay page so
//     the buyer sees "the skin they're buying" (single call, tight timeout)
//
// Always best-effort: any failure (timeout, 429, no exact match) returns null
// and the caller falls back to a generated placeholder. Never throws.

const STEAM_MARKET_SEARCH_URL = 'https://steamcommunity.com/market/search/render/';
const STEAM_RUST_APP_ID = 252490;
const DEFAULT_TIMEOUT_MS = 8000;

interface SteamMarketSearchResult {
  hash_name?: string;
  asset_description?: {
    icon_url?: string;
  };
}

interface SteamMarketSearchResponse {
  success?: boolean;
  results?: SteamMarketSearchResult[];
}

export interface ResolveSteamIconOptions {
  /** Abort the lookup after this many ms. Default 8000. */
  timeoutMs?: number;
}

/**
 * Look up the Steam CDN icon URL for an exact market_hash_name.
 * Returns the full https URL (on the CSP/Next-allowlisted akamai CDN) or null.
 */
export async function resolveSteamMarketIcon(
  hashName: string,
  options: ResolveSteamIconOptions = {},
): Promise<string | null> {
  const url = new URL(STEAM_MARKET_SEARCH_URL);
  url.searchParams.set('appid', String(STEAM_RUST_APP_ID));
  url.searchParams.set('query', hashName);
  url.searchParams.set('start', '0');
  // count=5 (not 1): Steam search isn't exact-match, the requested name may
  // appear lower when it's a substring of others. Filter by exact name below.
  url.searchParams.set('count', '5');
  url.searchParams.set('search_descriptions', '0');
  url.searchParams.set('norender', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        // Browser-looking UA lowers the chance of tripping Steam's bot
        // heuristics. Not a guarantee — Steam may still 429.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SteamMarketSearchResponse;
    if (!body.success || !Array.isArray(body.results)) return null;
    const exact = body.results.find((r) => r.hash_name === hashName);
    const iconHash = exact?.asset_description?.icon_url;
    if (!iconHash) return null;
    // steamcommunity-a.akamaihd.net is on the CSP + Next.js remotePatterns
    // allowlist (apps/web/next.config.mjs) — same CDN as own-inventory.
    return `https://steamcommunity-a.akamaihd.net/economy/image/${iconHash}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
