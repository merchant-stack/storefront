// Steam ID helpers. Pure functions — kept separate from auth/routes.ts so they
// can be unit-tested without booting Fastify.

// SteamID64 = SteamID3 + this base (universe=public, account-type=individual).
export const STEAMID_BASE = 76561197960265728n;

export interface ParsedTradeUrl {
  steamId64: string;
  /** Canonical https URL with only partner+token params, in stable order. */
  canonical: string;
}

/**
 * Trade URL format: https://steamcommunity.com/tradeoffer/new/?partner=<SteamID3>&token=<token>
 * The "partner" query param is the Steam Account ID (= SteamID3). Adding
 * STEAMID_BASE reconstructs the SteamID64. Returns null if the URL is anything
 * other than a valid Steam trade offer URL.
 *
 * Returns BOTH the SteamID64 AND a canonical URL with extra params dropped —
 * callers should persist the canonical form, never the raw user input, so we
 * can never accidentally pass attacker-controlled query keys to downstream
 * consumers (Waxpeer, audit logs, etc).
 */
export function parseTradeUrlSteamId64(tradeUrl: string): ParsedTradeUrl | null {
  try {
    const u = new URL(tradeUrl);
    // https-only — anything else risks MITM if a future consumer ever opens
    // the URL or logs it as clickable text.
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'steamcommunity.com') return null;
    if (u.pathname !== '/tradeoffer/new/') return null;
    const partner = u.searchParams.get('partner');
    const token = u.searchParams.get('token');
    if (!partner || !token) return null;
    if (!/^\d+$/.test(partner)) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const steamId3 = BigInt(partner);
    const steamId64 = (steamId3 + STEAMID_BASE).toString();
    const canonical = `https://steamcommunity.com/tradeoffer/new/?partner=${partner}&token=${token}`;
    return { steamId64, canonical };
  } catch {
    return null;
  }
}
