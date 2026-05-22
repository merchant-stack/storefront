import { request } from 'undici';
import { URLSearchParams } from 'node:url';
import { getRedis } from './redis.js';

const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const STEAM_API_BASE = 'https://api.steampowered.com';
const NONCE_TTL_SECONDS = 60 * 10; // Steam OpenID assertions are time-bound (~5min); 10min is a safe window.

const OPENID_IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';

export interface SteamPlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  avatar: string;
  avatarmedium: string;
  avatarfull: string;
}

/**
 * Build the Steam OpenID 2.0 login URL that the browser is redirected to.
 *
 * `returnTo` is where Steam will send the user back after auth (must be
 * registered as a URL we can serve — usually our /auth/steam/callback).
 * `realm` is the OpenID realm — typically the API origin (scheme + host).
 */
export const buildSteamLoginUrl = ({
  returnTo,
  realm,
}: {
  returnTo: string;
  realm: string;
}): string => {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': OPENID_IDENTIFIER_SELECT,
    'openid.claimed_id': OPENID_IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID_URL}?${params.toString()}`;
};

const STEAM_ID_REGEX = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

/**
 * Verify an OpenID assertion returned by Steam on the callback URL.
 *
 * Steam's check_authentication mode requires us to echo back every openid.*
 * param exactly, with `openid.mode` swapped from `id_res` to `check_authentication`.
 * Steam responds with a text body containing `is_valid:true` or `is_valid:false`.
 *
 * Returns the verified SteamID64 string on success, null on failure.
 */
export const verifySteamOpenId = async (
  query: Record<string, string | string[] | undefined>,
  expectedReturnTo: string,
): Promise<string | null> => {
  const mode = query['openid.mode'];
  if (mode !== 'id_res') return null;

  const claimedId = query['openid.claimed_id'];
  if (typeof claimedId !== 'string') return null;

  // Defense-in-depth: refuse assertions issued for a different realm/return_to.
  // Steam's check_authentication step authoritatively validates the signature,
  // but binding return_to + identity to our expected values prevents a hostile
  // site from harvesting a valid Steam assertion for their realm and replaying
  // it at ours within the nonce TTL.
  if (query['openid.return_to'] !== expectedReturnTo) return null;
  if (query['openid.identity'] !== claimedId) return null;

  const match = STEAM_ID_REGEX.exec(claimedId);
  if (!match || !match[1]) return null;
  const steamId64 = match[1];

  // Replay protection: each Steam OpenID assertion carries a unique
  // openid.response_nonce. We reject any nonce we've seen before in the past
  // TTL window. SETNX with EX gives an atomic claim-or-reject.
  const responseNonce = query['openid.response_nonce'];
  if (typeof responseNonce !== 'string' || responseNonce.length === 0) {
    return null;
  }
  const redis = getRedis();
  const claimed = await redis.set(
    `openid:nonce:${responseNonce}`,
    '1',
    'EX',
    NONCE_TTL_SECONDS,
    'NX',
  );
  if (claimed !== 'OK') {
    return null; // replay
  }

  const verifyParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith('openid.')) continue;
    if (typeof value !== 'string') continue;
    verifyParams.append(key, value);
  }
  verifyParams.set('openid.mode', 'check_authentication');

  const response = await request(STEAM_OPENID_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
  });

  if (response.statusCode !== 200) return null;
  const body = await response.body.text();

  const isValid = /is_valid\s*:\s*true/i.test(body);
  return isValid ? steamId64 : null;
};

/**
 * Fetch a Steam player's public profile summary. Returns null if the API key
 * is missing (e.g. during local dev before the operator provisions one) or the
 * profile cannot be fetched.
 */
export const fetchSteamPlayerSummary = async (
  steamId64: string,
  apiKey: string | undefined,
): Promise<SteamPlayerSummary | null> => {
  if (!apiKey) return null;

  const url = new URL(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v2/`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('steamids', steamId64);

  const response = await request(url.toString(), { method: 'GET' });
  if (response.statusCode !== 200) return null;

  const payload = (await response.body.json()) as {
    response?: { players?: SteamPlayerSummary[] };
  };
  return payload.response?.players?.[0] ?? null;
};
