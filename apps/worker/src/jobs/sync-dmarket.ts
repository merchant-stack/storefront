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

interface BotInventoryItem {
  appid: number;
  contextid: string | number;
  assetid: string;
  market_hash_name: string;
  icon_url?: string;
  name_color?: string;
  type?: string;
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
    const iconUrl = item.icon_url
      ? `https://community.akamai.steamstatic.com/economy/image/${item.icon_url}`
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
        type: item.type,
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
        type: item.type,
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

  log.info(
    {
      gameId,
      fetched: inventory.length,
      upserted,
      skippedNoPrice,
      retired: retired.count,
      retiredLegacy: retiredLegacy.count,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'sync complete',
  );

  return { fetched: inventory.length, upserted, retired: retired.count };
}
