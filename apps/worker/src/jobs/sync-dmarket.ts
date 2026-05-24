// Periodic catalog sync — OWN_INVENTORY mode.
//
// We hold a stock of Rust skins in our own Steam bot account (configured via
// STEAM_BOT_* env vars). The catalog on the storefront mirrors that bot's
// inventory: one SourceItem row per distinct asset the bot owns.
//
// Prices are NOT what we paid — they're our retail prices, computed at sync
// time by looking up each item's current floor on public marketplaces
// (rust.tm today, DMarket / Waxpeer next) and applying a markup. The
// markup-bps env var controls the spread; default is 1000 (10%) per the
// founder's 2026-05-24 decision.
//
// Items in the bot inventory whose hash_name is not in any market-price
// source are SKIPPED — we can't list what we can't price. They'll appear
// in the next sync once a source picks them up, or never (e.g. discontinued
// skins).
//
// Pre-2026-05-24 history: this job sourced from DMarket (May 18-20), then
// Waxpeer (May 20-24), then rust.tm (May 24 evening, ~30min). All three
// p2p marketplace approaches collapsed under various API instability
// (Waxpeer keys dying in 12h, rust.tm keys dying in 2min). The owner-inventory
// model eliminates the dependency on third-party marketplaces for the buy
// path entirely; they're now used only as price oracles.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { applyMarkup } from '@rustskinpay/shared/dmarket';
import { loadMarketPriceIndex } from '@rustskinpay/shared/market-prices';
import { getBot } from '../steam-bot.js';
import { RUST_APP_ID, RUST_CONTEXT_ID } from '../constants.js';
import { env } from '../env.js';

const log = pino({ name: 'sync-source' });

export interface SyncDMarketJob {
  gameId?: string;
  limit?: number;
}

interface BotInventoryTag {
  category?: string;
  name?: string;
  internal_name?: string;
}

interface BotInventoryItem {
  appid: number;
  contextid: string | number;
  assetid: string;
  market_hash_name: string;
  icon_url?: string;
  name_color?: string;
  type?: string;
  tags?: BotInventoryTag[];
}

/**
 * Steam inventory entries put a generic "Workshop Item" or "" in the top-level
 * `type` field for most Rust skins, which is useless as a storefront category.
 * The actually-useful classification lives in `tags[]` under the
 * `itemclass` category — e.g. "TShirt", "AssaultRifle", "Door", "Pickaxe".
 * Prefer that; fall back to the top-level type only if no itemclass tag exists.
 */
function resolveItemType(item: BotInventoryItem): string | undefined {
  const itemclass = item.tags?.find((t) => t.category === 'itemclass')?.name;
  if (itemclass && itemclass.length > 0) return itemclass;
  if (item.type && item.type.length > 0) return item.type;
  return undefined;
}

export async function syncDMarket(job: Job<SyncDMarketJob>): Promise<{
  fetched: number;
  upserted: number;
  retired: number;
}> {
  const gameId = job.data.gameId ?? 'rust';
  const markupBps = env.DMARKET_DEFAULT_MARKUP_BPS;
  const startedAt = new Date();

  log.info({ gameId, source: 'OWN_INVENTORY', markupBps }, 'sync starting');

  // 1. Fetch our bot's Steam inventory. If the bot isn't configured or the
  //    fetch fails, we ABORT WITHOUT RETIRING anything — items are
  //    physically in the inventory and a transient Steam-API outage
  //    shouldn't yank them off the storefront.
  const bot = await getBot();
  if (!bot) {
    log.warn('Steam bot not configured — skipping sync, leaving catalog as-is');
    return { fetched: 0, upserted: 0, retired: 0 };
  }
  let inventory: BotInventoryItem[];
  try {
    inventory = await new Promise<BotInventoryItem[]>((resolve, reject) => {
      bot.manager.getInventoryContents(
        RUST_APP_ID,
        Number(RUST_CONTEXT_ID),
        true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err: Error | null, items: any) => {
          if (err) reject(err);
          else resolve(items as BotInventoryItem[]);
        },
      );
    });
  } catch (err) {
    log.error({ err }, 'bot inventory fetch failed — skipping sync');
    return { fetched: 0, upserted: 0, retired: 0 };
  }
  log.info({ count: inventory.length }, 'bot inventory fetched');

  // 2. Load market price index from public sources. If it fails entirely
  //    (e.g. all sources offline), we ALSO abort without retiring — same
  //    safety reasoning.
  let priceIndex;
  try {
    priceIndex = await loadMarketPriceIndex();
  } catch (err) {
    log.error({ err }, 'market price index load failed — skipping sync');
    return { fetched: 0, upserted: 0, retired: 0 };
  }
  log.info(
    { totalPriced: priceIndex.size, perSource: priceIndex.perSource },
    'market price index loaded',
  );
  if (priceIndex.size === 0) {
    log.warn('market price index is empty — skipping sync to avoid retiring everything');
    return { fetched: 0, upserted: 0, retired: 0 };
  }

  // 3. Upsert each inventory item with its computed retail price.
  const seenAssetIds = new Set<string>();
  let skippedNoPrice = 0;
  let upserted = 0;
  for (const item of inventory) {
    const assetId = String(item.assetid);
    if (seenAssetIds.has(assetId)) continue;
    seenAssetIds.add(assetId);

    const sourcePriceMinor = priceIndex.bestFor(item.market_hash_name);
    if (sourcePriceMinor === null) {
      skippedNoPrice += 1;
      continue;
    }
    const salePriceMinor = applyMarkup(sourcePriceMinor, markupBps);
    // Use steamcommunity-a.akamaihd.net — it's on the web's CSP + Next.js
    // remotePatterns allowlist (apps/web/next.config.mjs). The newer
    // community.akamai.steamstatic.com CDN works too but isn't whitelisted,
    // so the browser blocks those img loads.
    const iconUrl = item.icon_url
      ? `https://steamcommunity-a.akamaihd.net/economy/image/${item.icon_url}`
      : null;

    await prisma.sourceItem.upsert({
      where: {
        provider_sourceOfferId: { provider: 'OWN_INVENTORY', sourceOfferId: assetId },
      },
      create: {
        provider: 'OWN_INVENTORY',
        sourceOfferId: assetId,
        gameId,
        marketHashName: item.market_hash_name,
        displayName: item.market_hash_name,
        iconUrl,
        iconBackgroundColor: null,
        type: resolveItemType(item),
        rarity: null,
        sourcePriceMinor,
        salePriceMinor,
        markupBps,
        currency: 'USD',
        available: true,
        rawPayload: JSON.parse(JSON.stringify(item)) as object,
        lastSyncedAt: new Date(),
      },
      update: {
        marketHashName: item.market_hash_name,
        displayName: item.market_hash_name,
        iconUrl,
        type: resolveItemType(item),
        sourcePriceMinor,
        salePriceMinor,
        markupBps,
        available: true,
        rawPayload: JSON.parse(JSON.stringify(item)) as object,
        lastSyncedAt: new Date(),
      },
    });
    upserted += 1;
  }

  // 4. Retire OWN_INVENTORY rows whose asset is no longer in our bot's
  //    inventory (we sold or transferred them out). Safe to do here because
  //    we successfully fetched the inventory at the top — empty inventory
  //    just means we sold everything.
  const retired = await prisma.sourceItem.updateMany({
    where: {
      provider: 'OWN_INVENTORY',
      gameId,
      available: true,
      sourceOfferId: { notIn: Array.from(seenAssetIds) },
    },
    data: { available: false },
  });

  // 5. Retire legacy third-party-provider rows. After the 2026-05-24 pivot
  //    to OWN_INVENTORY these shouldn't be reachable for purchase even if
  //    visible, but the storefront shouldn't display them at all.
  const retiredLegacy = await prisma.sourceItem.updateMany({
    where: {
      provider: { in: ['RUSTTM', 'WAXPEER', 'DMARKET'] },
      available: true,
    },
    data: { available: false },
  });

  // 6. Refresh the SHOWCASE catalog — placeholder "coming soon" items that
  //    make the storefront feel fuller than our 14-item bot inventory.
  //    Capped at SHOWCASE_MAX_RATIO_PCT of the real-inventory count so the
  //    catalog stays mostly real (max 50% by default). Showcase items are
  //    purely visual; the api rejects checkout for SHOWCASE provider and the
  //    web shows a "coming soon" badge instead of a Buy CTA.
  const showcaseResult = await refreshShowcaseCatalog({
    gameId,
    realCount: upserted,
    realHashNames: new Set(usableInventoryHashNames(inventory)),
    priceIndex,
    markupBps,
  });

  log.info(
    {
      gameId,
      fetched: inventory.length,
      upserted,
      skippedNoPrice,
      retired: retired.count,
      retiredLegacy: retiredLegacy.count,
      showcaseUpserted: showcaseResult.upserted,
      showcaseRetired: showcaseResult.retired,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'sync complete',
  );

  return { fetched: inventory.length, upserted, retired: retired.count };
}

function usableInventoryHashNames(items: BotInventoryItem[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    if (!i.market_hash_name || seen.has(i.market_hash_name)) continue;
    seen.add(i.market_hash_name);
    out.push(i.market_hash_name);
  }
  return out;
}

interface RefreshShowcaseInput {
  gameId: string;
  realCount: number;
  realHashNames: Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  priceIndex: any;
  markupBps: number;
}

/**
 * Upsert SHOWCASE rows so the visible catalog feels fuller. Idempotent across
 * sync ticks: items keep stable ids (sourceOfferId = market_hash_name) so a
 * bookmarked /market/<id> URL doesn't 404 between syncs. Any showcase row
 * whose hash is no longer in our current pick set OR now exists in our real
 * inventory is retired (set available=false).
 */
async function refreshShowcaseCatalog(input: RefreshShowcaseInput): Promise<{
  upserted: number;
  retired: number;
}> {
  const maxRatio = env.SHOWCASE_MAX_RATIO_PCT;
  if (maxRatio <= 0 || input.realCount === 0) {
    // Disabled or no real items to anchor against → retire any leftover
    // showcase rows so the storefront isn't 100% placeholder.
    const retired = await prisma.sourceItem.updateMany({
      where: { provider: 'SHOWCASE', available: true },
      data: { available: false },
    });
    return { upserted: 0, retired: retired.count };
  }

  // showcase_count + real_count == total. showcase_count <= ratio% of total.
  // Solving: showcase_count = floor(real_count * ratio / (100 - ratio)).
  const targetCount = Math.floor((input.realCount * maxRatio) / (100 - maxRatio));
  if (targetCount === 0) {
    const retired = await prisma.sourceItem.updateMany({
      where: { provider: 'SHOWCASE', available: true },
      data: { available: false },
    });
    return { upserted: 0, retired: retired.count };
  }

  // Pull a price-diversified slate: a couple from each band so the catalog
  // doesn't fill with 30 graffiti at $0.03. Bands in cents.
  const PRICE_BANDS = [
    { min: 50, max: 200 }, // $0.50 – $2
    { min: 200, max: 1000 }, // $2 – $10
    { min: 1000, max: 5000 }, // $10 – $50
    { min: 5000, max: 20000 }, // $50 – $200
    { min: 20000, max: 100000 }, // $200 – $1000
  ];
  const perBand = Math.max(1, Math.ceil(targetCount / PRICE_BANDS.length));

  const allEntries: Array<{ marketHashName: string; priceMinor: number }> = (
    input.priceIndex as { entries: () => Array<{ marketHashName: string; priceMinor: number }> }
  ).entries();

  const picked: Array<{ marketHashName: string; priceMinor: number }> = [];
  for (const band of PRICE_BANDS) {
    const candidates = allEntries.filter(
      (e) =>
        e.priceMinor >= band.min &&
        e.priceMinor <= band.max &&
        !input.realHashNames.has(e.marketHashName),
    );
    // Shuffle (Fisher-Yates) then take `perBand` — gives variety across syncs
    // without re-randomising everything every tick (good enough for UX).
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = candidates[i]!;
      candidates[i] = candidates[j]!;
      candidates[j] = tmp;
    }
    picked.push(...candidates.slice(0, perBand));
    if (picked.length >= targetCount) break;
  }
  const finalPicks = picked.slice(0, targetCount);
  const pickedHashes = new Set(finalPicks.map((p) => p.marketHashName));

  let upserted = 0;
  for (const pick of finalPicks) {
    const salePriceMinor = applyMarkup(pick.priceMinor, input.markupBps);
    await prisma.sourceItem.upsert({
      where: {
        provider_sourceOfferId: {
          provider: 'SHOWCASE',
          sourceOfferId: pick.marketHashName,
        },
      },
      create: {
        provider: 'SHOWCASE',
        sourceOfferId: pick.marketHashName,
        gameId: input.gameId,
        marketHashName: pick.marketHashName,
        displayName: pick.marketHashName,
        // Showcase items have no real Steam asset to pull an icon from. The
        // ItemCard component already renders a "no image" placeholder for
        // null iconUrl, so the visual is consistent. Future enhancement:
        // resolve icons via Steam Community Market lookups.
        iconUrl: null,
        iconBackgroundColor: null,
        type: null,
        rarity: null,
        sourcePriceMinor: pick.priceMinor,
        salePriceMinor,
        markupBps: input.markupBps,
        currency: 'USD',
        available: true,
        rawPayload: { showcase: true, source: 'rust.tm' },
        lastSyncedAt: new Date(),
      },
      update: {
        sourcePriceMinor: pick.priceMinor,
        salePriceMinor,
        markupBps: input.markupBps,
        available: true,
        lastSyncedAt: new Date(),
      },
    });
    upserted += 1;
  }

  // Retire showcase rows that didn't make this tick's cut OR have since
  // appeared in real inventory (we don't want to double-up a placeholder
  // for an item we now actually stock).
  const retired = await prisma.sourceItem.updateMany({
    where: {
      provider: 'SHOWCASE',
      available: true,
      OR: [
        { sourceOfferId: { notIn: Array.from(pickedHashes) } },
        { sourceOfferId: { in: Array.from(input.realHashNames) } },
      ],
    },
    data: { available: false },
  });

  return { upserted, retired: retired.count };
}
