// Steam ID helpers. Pure functions — kept separate from auth/routes.ts so they
// can be unit-tested without booting Fastify.

// SteamID64 = SteamID3 + this base (universe=public, account-type=individual).
export const STEAMID_BASE = 76561197960265728n;

/**
 * Trade URL format: https://steamcommunity.com/tradeoffer/new/?partner=<SteamID3>&token=<token>
 * The "partner" query param is the Steam Account ID (= SteamID3). Adding
 * STEAMID_BASE reconstructs the SteamID64. Returns null if the URL is anything
 * other than a valid Steam trade offer URL.
 */
export function parseTradeUrlSteamId64(tradeUrl: string): string | null {
  try {
    const u = new URL(tradeUrl);
    if (u.hostname !== 'steamcommunity.com') return null;
    if (u.pathname !== '/tradeoffer/new/') return null;
    const partner = u.searchParams.get('partner');
    const token = u.searchParams.get('token');
    if (!partner || !token) return null;
    if (!/^\d+$/.test(partner)) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const steamId3 = BigInt(partner);
    return (steamId3 + STEAMID_BASE).toString();
  } catch {
    return null;
  }
}
