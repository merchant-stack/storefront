// rust.tm Trading API client — third source provider after Waxpeer and (legacy)
// DMarket. rust.tm is the Rust sibling of market.csgo.com; same TM-family
// auth + URL shape, different domain.
//
// Auth: query param `?key=<API_KEY>` on every request (or X-API-KEY header).
// Currency: rust.tm prices are integer-as-string in MILLES ($1 = 1000).
//   We convert to USD CENTS at the boundary to match the rest of our codebase
//   (sourcePriceMinor stays in cents). Conversion: cents = round(milles / 10).
//   For buy-for we convert back: milles = cents * 10. Sub-cent precision is
//   lost in the round-trip, but our retail floor is well above 1¢ so this is
//   immaterial.
//
// Delivery model: P2P with seller-bot dispatch directly to BUYER's Steam trade
// URL — same architectural shape as Waxpeer, NOT DMarket. We pass the buyer's
// `partner`+`token` (parsed from their trade URL) to `buy-for`. Verified
// 2026-05-24 that buy-for has no "receiver must be registered on market.csgo"
// restriction (that error only applies to the check-if-reversed-by-custom-id
// admin re-check method).

const DEFAULT_BASE_URL = 'https://rust.tm/api/v2';

/** rust.tm bulk-prices dump endpoint — unauthenticated, returns all items. */
const PRICES_USD_PATH = '/prices/USD.json';

export interface RustTmOffer {
  /** Used as the source-side handle. For rust.tm we key by market_hash_name
   *  because buy-for accepts hash_name+price and picks the cheapest current
   *  listing — we don't need to track per-listing IDs. */
  itemId: string;
  marketHashName: string;
  imageUrl: string | undefined;
  type: string | undefined;
  rarity: string | undefined;
  /** Source price in USD cents (converted from rust.tm milles). */
  priceMinor: number;
  currency: 'USD';
  raw: unknown;
}

export interface RustTmBuyResult {
  success: boolean;
  /** rust.tm's returned `id` from buy-for — the item id we'll see in status. */
  sourcePaymentId?: string;
  /** Echoed-back custom_id we passed in — same as our order id, used to query status. */
  customId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export interface RustTmBalance {
  usdMinor: number;
  raw: unknown;
}

/**
 * Trade delivery state, normalised from rust.tm's `stage` integer in
 * get-buy-info-by-custom-id. Mapping (best-effort from their docs):
 *   1 → 'preparing' (paid, waiting for seller-bot to pick up)
 *   2 → 'preparing'
 *   3 → 'sent'      (seller dispatched the Steam trade offer)
 *   4 → 'sent'
 *   5 → 'accepted'  (buyer accepted on Steam — terminal success)
 *   6 → 'declined'  (buyer declined / trade expired)
 *   anything else / refund payload present → 'declined' or 'unknown'
 *
 * Conservative: if we see a `refund` payload anywhere in the response we
 * treat the trade as declined regardless of stage, because rust.tm refunds
 * are terminal — they don't undo themselves.
 */
export type RustTmDeliveryState =
  | 'preparing'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'unknown';

export interface RustTmTradeStatus {
  /** Our custom_id (= order id), echoed back from rust.tm. */
  customId: string;
  state: RustTmDeliveryState;
  /** Raw stage integer rust.tm returned, preserved for debugging. */
  rawStage: number | null;
  /** Unix-seconds deadline for seller bot to send the offer. */
  sendUntil: number | null;
  /** Reason string when state is 'declined' (refund cause). */
  reason: string | null;
  raw: unknown;
}

export interface RustTmClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface RustTmClient {
  isMock(): boolean;
  searchItems(options?: {
    gameId?: string;
    limit?: number;
    /** Min price in USD cents (inclusive). */
    minPriceMinor?: number;
    /** Max price in USD cents (inclusive). */
    maxPriceMinor?: number;
  }): Promise<RustTmOffer[]>;
  /**
   * Buy an item via rust.tm's buy-for endpoint, delivering directly to the
   * buyer's Steam trade URL (parsed for partner+token). expectedPriceMinor is
   * the MAX we'll pay in USD cents — rust.tm picks the cheapest current offer
   * at or below this price. customId is our order id, used to track status.
   */
  buyOffer(
    hashName: string,
    expectedPriceMinor: number,
    tradeUrl: string,
    customId: string,
  ): Promise<RustTmBuyResult>;
  getBalance(): Promise<RustTmBalance>;
  /** Look up delivery status for a batch of our customIds (= order ids). */
  checkTradeStatuses(customIds: string[]): Promise<RustTmTradeStatus[]>;
}

interface RustTmBulkPriceRow {
  market_hash_name?: string;
  volume?: string | number;
  /** Decimal-string dollars (e.g. "0.140" = $0.14). */
  price?: string;
}

interface RustTmBulkPricesResponse {
  success?: boolean;
  items?: RustTmBulkPriceRow[];
}

interface RustTmBuyResponse {
  success?: boolean;
  id?: string | number;
  error?: string;
  code?: number | string;
}

interface RustTmBalanceResponse {
  success?: boolean;
  money?: number | string;
  currency?: string;
}

interface RustTmRawTradeStatus {
  item_id?: string | number;
  market_hash_name?: string;
  classid?: string | number;
  instance?: string | number;
  time?: string | number;
  settlement?: string | number;
  send_until?: string | number | null;
  stage?: string | number;
  paid?: number;
  causer?: string;
  refund?: unknown;
}

interface RustTmStatusListResponse {
  success?: boolean;
  data?: Record<string, RustTmRawTradeStatus | null>;
  error?: string;
}

export function createRustTmClient(config: RustTmClientConfig): RustTmClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const mock = !config.apiKey;

  async function hit<T>(
    path: string,
    params: Record<string, string | number | Array<string | number>> = {},
    options: { requireKey?: boolean } = {},
  ): Promise<T> {
    const requireKey = options.requireKey ?? true;
    if (requireKey && mock) throw new Error('rust.tm client in mock mode');
    const q = new URLSearchParams();
    if (requireKey) q.append('key', config.apiKey!);
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) q.append(k, String(item));
      } else {
        q.append(k, String(v));
      }
    }
    const qs = q.toString();
    const url = qs ? `${baseUrl}${path}?${qs}` : `${baseUrl}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`rust.tm ${path} ${res.status}: ${text.slice(0, 200)}`);
      }
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`rust.tm ${path} returned non-JSON: ${text.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isMock: () => mock,

    async searchItems(options = {}) {
      if (mock) {
        return generateMockOffers(options.gameId ?? 'rust', options.limit ?? 50);
      }
      // The bulk prices dump is unauthenticated, so we hit it without a key.
      // It's ~350KB and cacheable upstream; we re-fetch on every sync tick
      // (every 2min) which is fine for an unauth endpoint.
      const body = await hit<RustTmBulkPricesResponse>(PRICES_USD_PATH, {}, { requireKey: false });
      if (!body.success) {
        throw new Error('rust.tm prices dump returned success=false');
      }
      const items = body.items ?? [];
      const minCents = options.minPriceMinor;
      const maxCents = options.maxPriceMinor;
      // Collect all matching offers, then sort by price ASC, then limit.
      // Doing limit-during-iteration would give us the first N in the dump's
      // natural (alphabetical) order, not the cheapest N — wrong for both
      // band-filtered sync and the storefront's "show cheapest first" UX.
      const matching: RustTmOffer[] = [];
      for (const row of items) {
        const offer = normaliseBulkRow(row);
        if (!offer) continue;
        if (minCents !== undefined && offer.priceMinor < minCents) continue;
        if (maxCents !== undefined && offer.priceMinor > maxCents) continue;
        matching.push(offer);
      }
      matching.sort((a, b) => a.priceMinor - b.priceMinor);
      return options.limit !== undefined ? matching.slice(0, options.limit) : matching;
    },

    async buyOffer(hashName, expectedPriceMinor, tradeUrl, customId) {
      if (mock) {
        return {
          success: true,
          sourcePaymentId: `mock-tm-${customId}-${Date.now()}`,
          customId,
          raw: { mock: true },
        };
      }
      const partner = extractTradePartner(tradeUrl);
      const token = extractTradeToken(tradeUrl);
      if (!partner || !token) {
        return {
          success: false,
          customId,
          errorCode: 'BAD_TRADE_URL',
          errorMessage: 'trade URL missing partner or token',
          raw: { tradeUrl },
        };
      }
      // Convert cents → milles (rust.tm's price unit). $1 = 1000.
      const priceMilles = expectedPriceMinor * 10;
      const body = await hit<RustTmBuyResponse>('/buy-for', {
        hash_name: hashName,
        price: priceMilles,
        partner,
        token,
        custom_id: customId,
      });
      if (!body.success) {
        return {
          success: false,
          customId,
          errorCode: body.code !== undefined ? String(body.code) : 'BUY_FAILED',
          errorMessage: body.error ?? 'unknown',
          raw: body,
        };
      }
      return {
        success: true,
        sourcePaymentId: body.id !== undefined ? String(body.id) : undefined,
        customId,
        raw: body,
      };
    },

    async getBalance() {
      if (mock) return { usdMinor: 0, raw: { mock: true } };
      const body = await hit<RustTmBalanceResponse>('/get-money');
      // body.money is in the account's currency (USD if we set it). Numeric.
      // We assume USD here — the worker should fail-fast if account currency
      // is anything else, but that check belongs in the worker, not the client.
      const money = typeof body.money === 'number' ? body.money : Number(body.money ?? 0);
      // rust.tm balance is in the account's chosen unit — USD comes back as a
      // decimal-dollar number (e.g. 1.23 = $1.23), NOT milles. Verified
      // 2026-05-24 against a $0.00 account. Convert to cents.
      const usdMinor = Math.round(money * 100);
      return { usdMinor, raw: body };
    },

    async checkTradeStatuses(customIds) {
      if (mock) {
        return customIds.map((id) => ({
          customId: id,
          state: 'accepted' as const,
          rawStage: 5,
          sendUntil: null,
          reason: null,
          raw: { mock: true },
        }));
      }
      if (customIds.length === 0) return [];
      const body = await hit<RustTmStatusListResponse>('/get-list-buy-info-by-custom-id', {
        'custom_id[]': customIds,
      });
      if (!body.success) {
        throw new Error(`rust.tm get-list-buy-info-by-custom-id failed: ${body.error ?? 'unknown'}`);
      }
      const data = body.data ?? {};
      return customIds.map((id) => {
        const row = data[id];
        if (!row) {
          return {
            customId: id,
            state: 'unknown' as const,
            rawStage: null,
            sendUntil: null,
            reason: null,
            raw: null,
          };
        }
        const stage = typeof row.stage === 'string' ? parseInt(row.stage, 10) : (row.stage ?? null);
        const sendUntil =
          row.send_until == null
            ? null
            : typeof row.send_until === 'number'
              ? row.send_until
              : parseInt(String(row.send_until), 10);
        const refunded = row.refund != null && row.refund !== '';
        return {
          customId: id,
          state: refunded ? 'declined' : normaliseDeliveryStage(stage),
          rawStage: typeof stage === 'number' && !Number.isNaN(stage) ? stage : null,
          sendUntil: typeof sendUntil === 'number' && !Number.isNaN(sendUntil) ? sendUntil : null,
          reason: refunded && typeof row.causer === 'string' ? row.causer : null,
          raw: row,
        };
      });
    },
  };
}

function normaliseDeliveryStage(stage: number | null): RustTmDeliveryState {
  if (stage == null) return 'unknown';
  switch (stage) {
    case 1:
    case 2:
      return 'preparing';
    case 3:
    case 4:
      return 'sent';
    case 5:
      return 'accepted';
    case 6:
      return 'declined';
    default:
      return 'unknown';
  }
}

// ---------- internals ----------

function normaliseBulkRow(row: RustTmBulkPriceRow): RustTmOffer | null {
  if (!row.market_hash_name) return null;
  const priceUsdStr = row.price;
  if (typeof priceUsdStr !== 'string' || priceUsdStr.length === 0) return null;
  // prices/USD.json returns decimal-dollar strings: "0.140" = $0.14.
  // Convert to cents via *100 + round, NOT parseInt (would lose the fractional).
  const priceUsd = Number(priceUsdStr);
  if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
  const priceMinor = Math.round(priceUsd * 100);
  if (priceMinor <= 0) return null;
  return {
    itemId: row.market_hash_name,
    marketHashName: row.market_hash_name,
    imageUrl: undefined, // bulk dump doesn't include icons; enrich later if needed
    type: undefined,
    rarity: undefined,
    priceMinor,
    currency: 'USD',
    raw: row,
  };
}

function extractTradePartner(tradeUrl: string): string | null {
  try {
    return new URL(tradeUrl).searchParams.get('partner');
  } catch {
    return null;
  }
}

function extractTradeToken(tradeUrl: string): string | null {
  try {
    return new URL(tradeUrl).searchParams.get('token');
  } catch {
    return null;
  }
}

function generateMockOffers(gameId: string, limit: number): RustTmOffer[] {
  const samples = [
    { name: 'Tan Boots', type: undefined, priceMinor: 14 },
    { name: 'Desert Jacket', type: undefined, priceMinor: 11 },
    { name: 'Blue Jacket', type: undefined, priceMinor: 11 },
    { name: 'Orange Longsleeve T-Shirt', type: undefined, priceMinor: 88 },
    { name: 'Wrapped Brain', type: undefined, priceMinor: 200 },
  ];
  return samples.slice(0, limit).map((s) => ({
    itemId: s.name,
    marketHashName: s.name,
    imageUrl: `https://placehold.co/300x300/2a2a2a/f97316?text=${encodeURIComponent(s.name)}`,
    type: s.type,
    rarity: undefined,
    priceMinor: s.priceMinor,
    currency: 'USD' as const,
    raw: { mock: true, gameId },
  }));
}
