// Waxpeer Trading API client — alternative source with cheaper inventory than
// DMarket. Same factory shape as the DMarket client so the worker can swap
// between them.
//
// Auth: simple API-key query param (`?api=<key>` on every request).
// Currency: prices come in USD minor units (cents).

const DEFAULT_BASE_URL = 'https://api.waxpeer.com';

export interface WaxpeerOffer {
  /** Marketplace-side listing identifier (use for /buy-one-p2p). */
  itemId: string;
  marketHashName: string;
  imageUrl: string | undefined;
  type: string | undefined;
  rarity: string | undefined;
  /** Source price in USD cents. */
  priceMinor: number;
  currency: 'USD';
  raw: unknown;
}

export interface WaxpeerBuyResult {
  success: boolean;
  sourcePaymentId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export interface WaxpeerBalance {
  usdMinor: number;
  raw: unknown;
}

export interface WaxpeerClientConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface WaxpeerClient {
  isMock(): boolean;
  searchItems(options?: {
    gameId?: string;
    limit?: number;
    minPriceMinor?: number;
    maxPriceMinor?: number;
  }): Promise<WaxpeerOffer[]>;
  buyOffer(itemId: string, expectedPriceMinor: number, tradeUrl: string): Promise<WaxpeerBuyResult>;
  getBalance(): Promise<WaxpeerBalance>;
}

interface WaxpeerRawOffer {
  item_id?: string;
  name?: string;
  image?: string;
  type?: string;
  brand?: string;
  price?: number;
  steam_price?: number;
}

interface WaxpeerUserResponse {
  success?: boolean;
  user?: { wallet?: number };
}

interface WaxpeerItemListResponse {
  success?: boolean;
  items?: WaxpeerRawOffer[];
  msg?: string;
}

interface WaxpeerBuyResponse {
  success?: boolean;
  id?: string;
  msg?: string;
}

const WAXPEER_GAME_MAP: Record<string, string> = {
  rust: 'rust',
  csgo: 'csgo',
  cs2: 'csgo',
  dota2: 'dota2',
  tf2: 'tf2',
};

export function createWaxpeerClient(config: WaxpeerClientConfig): WaxpeerClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const mock = !config.apiKey;

  async function hit<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    if (mock) throw new Error('Waxpeer client in mock mode');
    const q = new URLSearchParams({ api: config.apiKey!, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const url = `${baseUrl}${path}?${q.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        throw new Error(`Waxpeer ${path} ${res.status}: ${await res.text()}`);
      }
      return (await res.json()) as T;
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
      const game = WAXPEER_GAME_MAP[options.gameId ?? 'rust'] ?? 'rust';
      const params: Record<string, string | number> = {
        game,
        limit: options.limit ?? 50,
        order: 'price',
        sort: 'ASC',
      };
      if (options.minPriceMinor !== undefined) params.min_price = options.minPriceMinor;
      if (options.maxPriceMinor !== undefined) params.max_price = options.maxPriceMinor;
      const body = await hit<WaxpeerItemListResponse>('/v1/get-items-list', params);
      if (!body.success) {
        throw new Error(`Waxpeer search failed: ${body.msg ?? 'unknown'}`);
      }
      return (body.items ?? []).map(normaliseOffer).filter((o): o is WaxpeerOffer => o !== null);
    },

    async buyOffer(itemId, expectedPriceMinor, tradeUrl) {
      if (mock) {
        return {
          success: true,
          sourcePaymentId: `mock-wax-${itemId}-${Date.now()}`,
          raw: { mock: true },
        };
      }
      const body = await hit<WaxpeerBuyResponse>('/v1/buy-one-p2p', {
        item_id: itemId,
        price: expectedPriceMinor,
        token: extractTradeToken(tradeUrl) ?? '',
        partner: extractTradePartner(tradeUrl) ?? '',
      });
      if (!body.success) {
        return {
          success: false,
          errorCode: 'BUY_FAILED',
          errorMessage: body.msg ?? 'unknown',
          raw: body,
        };
      }
      return {
        success: true,
        sourcePaymentId: body.id ?? undefined,
        raw: body,
      };
    },

    async getBalance() {
      if (mock) return { usdMinor: 0, raw: { mock: true } };
      const body = await hit<WaxpeerUserResponse>('/v1/user');
      // Waxpeer returns wallet in cents already.
      const wallet = body.user?.wallet ?? 0;
      return { usdMinor: wallet, raw: body };
    },
  };
}

// ---------- internals ----------

function normaliseOffer(o: WaxpeerRawOffer): WaxpeerOffer | null {
  if (!o.item_id || typeof o.price !== 'number') return null;
  return {
    itemId: o.item_id,
    marketHashName: o.name ?? '',
    imageUrl: o.image ? (o.image.startsWith('http') ? o.image : `https://steamcommunity-a.akamaihd.net${o.image}`) : undefined,
    type: o.type ?? o.brand ?? undefined,
    rarity: undefined,
    priceMinor: o.price,
    currency: 'USD',
    raw: o,
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

function generateMockOffers(gameId: string, limit: number): WaxpeerOffer[] {
  const samples = [
    { name: 'Blue Cap', type: 'Cap', priceMinor: 120 },
    { name: 'Red Cap', type: 'Cap', priceMinor: 120 },
    { name: 'Green Hoodie', type: 'Hoodie', priceMinor: 130 },
    { name: 'Orange Longsleeve T-Shirt', type: 'Long Tshirt', priceMinor: 88 },
    { name: 'Desert Jacket', type: 'Jacket', priceMinor: 89 },
  ];
  return samples.slice(0, limit).map((s, i) => ({
    itemId: `mock-${gameId}-${i}`,
    marketHashName: s.name,
    imageUrl: `https://placehold.co/300x300/2a2a2a/f97316?text=${encodeURIComponent(s.name)}`,
    type: s.type,
    rarity: undefined,
    priceMinor: s.priceMinor,
    currency: 'USD' as const,
    raw: { mock: true },
  }));
}
