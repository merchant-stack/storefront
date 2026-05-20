// DMarket Trading API client — shared between api and worker.
//
// Auth: Ed25519 detached signature.
//   string-to-sign = HTTP_METHOD + PATH_WITH_QUERY + REQUEST_BODY + UNIX_TIMESTAMP_SECONDS
//   Headers:
//     X-Api-Key:        <public key>
//     X-Request-Sign:   "dmar ed25519 " + hex(signature)
//     X-Sign-Date:      <unix seconds>
//     Content-Type:     application/json    (non-GET only)
//
// Construct via createDMarketClient({ publicKey, secretKey, baseUrl }). If keys
// are absent, the client returns mock data so the rest of the dev loop works
// without real DMarket credentials.

import * as ed from '@noble/ed25519';

const DEFAULT_BASE_URL = 'https://api.dmarket.com';
const RUST_GAME_ID = 'rust';

export interface DMarketOffer {
  offerId: string;
  itemId: string;
  classId?: string;
  marketHashName: string;
  title: string;
  imageUrl: string | undefined;
  type: string | undefined;
  rarity: string | undefined;
  priceMinor: number; // USD cents
  currency: 'USD';
  raw: unknown;
}

export interface DMarketBuyResult {
  success: boolean;
  sourcePaymentId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw: unknown;
}

export interface DMarketBalance {
  usdMinor: number;
  dmcMinor: number;
  raw: unknown;
}

export interface DMarketClientConfig {
  publicKey?: string;
  secretKey?: string;
  baseUrl?: string;
  /** Per-request timeout in ms. Defaults to 10s. */
  timeoutMs?: number;
}

export interface DMarketClient {
  isMock(): boolean;
  searchItems(options?: {
    gameId?: string;
    limit?: number;
    offset?: number;
    priceFrom?: number;
    priceTo?: number;
  }): Promise<DMarketOffer[]>;
  buyOffer(offerId: string, expectedPriceMinor: number): Promise<DMarketBuyResult>;
  getBalance(): Promise<DMarketBalance>;
}

interface DMarketRawOffer {
  itemId?: string;
  classId?: string;
  title?: string;
  image?: string;
  extra?: { categoryPath?: string; rarity?: string; nameColor?: string };
  price?: { USD?: string };
  marketHashName?: string;
  game?: string;
  type?: string;
}

export function createDMarketClient(config: DMarketClientConfig): DMarketClient {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = config.timeoutMs ?? 10_000;
  const mock = !config.publicKey || !config.secretKey;

  // tweetnacl-compatible Ed25519 secret keys are 64 bytes (seed||pub). @noble/ed25519
  // wants a 32-byte seed. If the key is 64 bytes of hex, take the first 32 as seed.
  const seed = mock ? null : deriveSeed(config.secretKey!);

  async function signedFetch(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    pathWithQuery: string,
    body?: unknown,
  ): Promise<Response> {
    if (mock) throw new Error('signedFetch called in mock mode');
    const bodyString = body === undefined ? '' : JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const stringToSign = method + pathWithQuery + bodyString + timestamp;
    const signatureBytes = await ed.signAsync(new TextEncoder().encode(stringToSign), seed!);
    const signature = `dmar ed25519 ${bytesToHex(signatureBytes)}`;

    const headers: Record<string, string> = {
      'X-Api-Key': config.publicKey!,
      'X-Request-Sign': signature,
      'X-Sign-Date': timestamp,
    };
    if (method !== 'GET' && bodyString) {
      headers['Content-Type'] = 'application/json';
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${baseUrl}${pathWithQuery}`, {
        method,
        headers,
        body: method === 'GET' ? undefined : bodyString,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    isMock: () => mock,

    async searchItems(options = {}) {
      const limit = options.limit ?? 50;
      const gameId = options.gameId ?? RUST_GAME_ID;
      if (mock) return generateMockOffers(gameId, limit);

      const params = new URLSearchParams({
        gameId,
        limit: String(limit),
        offset: String(options.offset ?? 0),
        currency: 'USD',
        orderBy: 'price',
        orderDir: 'asc',
      });
      if (options.priceFrom !== undefined) params.set('priceFrom', String(options.priceFrom));
      if (options.priceTo !== undefined) params.set('priceTo', String(options.priceTo));

      const res = await signedFetch('GET', `/exchange/v1/market/items?${params}`);
      if (!res.ok) {
        throw new Error(`DMarket searchItems ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as { objects?: DMarketRawOffer[] };
      return (json.objects ?? []).map(normaliseOffer);
    },

    async buyOffer(offerId, expectedPriceMinor) {
      if (mock) {
        return {
          success: true,
          sourcePaymentId: `mock-${offerId}-${Date.now()}`,
          raw: { mock: true },
        };
      }
      const body = {
        offers: [
          {
            offerId,
            price: { amount: (expectedPriceMinor / 100).toFixed(2), currency: 'USD' },
            type: 'dmarket',
          },
        ],
      };
      const res = await signedFetch('PATCH', '/exchange/v1/offers-buy', body);
      const raw = await res.json();
      if (!res.ok) {
        return {
          success: false,
          errorCode: String(res.status),
          errorMessage:
            typeof raw === 'object' && raw !== null && 'message' in raw
              ? String((raw as { message: unknown }).message)
              : 'unknown',
          raw,
        };
      }
      const paymentId = (raw as { txId?: string }).txId ?? undefined;
      return { success: true, sourcePaymentId: paymentId, raw };
    },

    async getBalance() {
      if (mock) return { usdMinor: 0, dmcMinor: 0, raw: { mock: true } };
      const res = await signedFetch('GET', '/account/v1/balance');
      if (!res.ok) throw new Error(`DMarket getBalance ${res.status}: ${await res.text()}`);
      const raw = (await res.json()) as { usd?: string | { amount?: string }; dmc?: string | { amount?: string } };
      const toMinor = (v: unknown): number => {
        if (typeof v === 'string') return Math.round(Number(v) * 100);
        if (v && typeof v === 'object' && 'amount' in v) {
          const amt = (v as { amount?: string }).amount;
          return amt ? Math.round(Number(amt) * 100) : 0;
        }
        return 0;
      };
      return { usdMinor: toMinor(raw.usd), dmcMinor: toMinor(raw.dmc), raw };
    },
  };
}

/** Apply our markup to a source price (cents). markupBps of 1500 = +15%. */
export function applyMarkup(sourcePriceMinor: number, markupBps: number): number {
  return Math.ceil((sourcePriceMinor * (10000 + markupBps)) / 10000);
}

// ---------- internals ----------

function deriveSeed(secretKeyHex: string): Uint8Array {
  const clean = secretKeyHex.startsWith('0x') ? secretKeyHex.slice(2) : secretKeyHex;
  if (clean.length % 2 !== 0) throw new Error('DMarket secret key must be hex');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes.length === 64 ? bytes.slice(0, 32) : bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function normaliseOffer(o: DMarketRawOffer): DMarketOffer {
  const priceUsd = o.price?.USD ? Number(o.price.USD) : 0;
  return {
    offerId: o.itemId ?? '',
    itemId: o.itemId ?? '',
    classId: o.classId,
    marketHashName: o.marketHashName ?? o.title ?? '',
    title: o.title ?? o.marketHashName ?? '',
    imageUrl: o.image,
    type: o.extra?.categoryPath ?? o.type,
    rarity: o.extra?.rarity,
    priceMinor: Math.round(priceUsd * 100),
    currency: 'USD',
    raw: o,
  };
}

function generateMockOffers(gameId: string, limit: number): DMarketOffer[] {
  const samples: Array<{ name: string; type: string; rarity: string; priceMinor: number }> = [
    { name: 'Tempered AK47', type: 'Weapon', rarity: 'Rare', priceMinor: 2499 },
    { name: 'Whiteout Hoodie', type: 'Clothing', rarity: 'Common', priceMinor: 599 },
    { name: 'Glowing Eyes', type: 'Face Mask', rarity: 'Epic', priceMinor: 12999 },
    { name: 'Forest Camo Bandana', type: 'Bandana', rarity: 'Uncommon', priceMinor: 349 },
    { name: 'Blackout Door', type: 'Door', rarity: 'Rare', priceMinor: 1849 },
    { name: 'Wasteland Metal Chestplate', type: 'Armor', rarity: 'Epic', priceMinor: 8499 },
    { name: 'Bone Garage Door', type: 'Door', rarity: 'Uncommon', priceMinor: 1199 },
    { name: 'Tundra LR300', type: 'Weapon', rarity: 'Rare', priceMinor: 3299 },
    { name: 'Hazmat Suit Reborn', type: 'Clothing', rarity: 'Epic', priceMinor: 6499 },
    { name: 'Pumpkin Bucket Helmet', type: 'Armor', rarity: 'Rare', priceMinor: 2199 },
  ];
  return samples.slice(0, limit).map((s, i) => ({
    offerId: `mock-${gameId}-${1000 + i}`,
    itemId: `mock-${gameId}-${1000 + i}`,
    classId: String(900000 + i),
    marketHashName: s.name,
    title: s.name,
    imageUrl: `https://placehold.co/300x300/2a2a2a/f97316?text=${encodeURIComponent(s.name)}`,
    type: s.type,
    rarity: s.rarity,
    priceMinor: s.priceMinor,
    currency: 'USD',
    raw: { mock: true },
  }));
}
