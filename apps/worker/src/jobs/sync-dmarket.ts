// Periodic sync: fetch top Rust offers from DMarket and upsert into SourceItem.
//
// One job per tick. Items in the fetched batch are upserted (price + availability
// refreshed); items previously seen but absent from this batch are marked
// available=false so the storefront stops showing them.
//
// In mock mode (no DMarket keys), the shared client returns deterministic fake
// offers so the UI still has data.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { applyMarkup, type DMarketOffer } from '@rustskinpay/shared/dmarket';
import { dmarket } from '../dmarket-client.js';
import { env } from '../env.js';

const log = pino({ name: 'sync-dmarket' });

export interface SyncDMarketJob {
  gameId?: string;
  limit?: number;
}

export async function syncDMarket(job: Job<SyncDMarketJob>): Promise<{
  fetched: number;
  upserted: number;
  retired: number;
}> {
  const gameId = job.data.gameId ?? 'rust';
  const limit = job.data.limit ?? env.DMARKET_SYNC_LIMIT;
  const markupBps = env.DMARKET_DEFAULT_MARKUP_BPS;
  const startedAt = new Date();

  log.info({ gameId, limit, mock: dmarket.isMock() }, 'sync starting');

  const offers = await dmarket.searchItems({ gameId, limit });

  // Skip offers with no usable price; DMarket occasionally returns 0-priced rows.
  const usable = offers.filter((o) => o.priceMinor > 0 && o.offerId);

  for (const offer of usable) {
    await upsertOffer(offer, gameId, markupBps);
  }

  // Retire stale: rows in this provider+gameId that weren't in this batch
  // and weren't already retired.
  const fetchedIds = usable.map((o) => o.offerId);
  const retired = await prisma.sourceItem.updateMany({
    where: {
      provider: 'DMARKET',
      gameId,
      available: true,
      sourceOfferId: { notIn: fetchedIds },
    },
    data: { available: false },
  });

  log.info(
    {
      gameId,
      fetched: offers.length,
      usable: usable.length,
      retired: retired.count,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'sync complete',
  );

  return { fetched: offers.length, upserted: usable.length, retired: retired.count };
}

async function upsertOffer(
  offer: DMarketOffer,
  gameId: string,
  markupBps: number,
): Promise<void> {
  const salePriceMinor = applyMarkup(offer.priceMinor, markupBps);
  await prisma.sourceItem.upsert({
    where: {
      provider_sourceOfferId: { provider: 'DMARKET', sourceOfferId: offer.offerId },
    },
    create: {
      provider: 'DMARKET',
      sourceOfferId: offer.offerId,
      gameId,
      marketHashName: offer.marketHashName,
      displayName: offer.title || offer.marketHashName,
      iconUrl: offer.imageUrl,
      type: offer.type,
      rarity: offer.rarity,
      sourcePriceMinor: offer.priceMinor,
      salePriceMinor,
      markupBps,
      currency: 'USD',
      available: true,
      rawPayload: offer.raw as object,
      lastSyncedAt: new Date(),
    },
    update: {
      marketHashName: offer.marketHashName,
      displayName: offer.title || offer.marketHashName,
      iconUrl: offer.imageUrl,
      type: offer.type,
      rarity: offer.rarity,
      sourcePriceMinor: offer.priceMinor,
      salePriceMinor,
      markupBps,
      available: true,
      rawPayload: offer.raw as object,
      lastSyncedAt: new Date(),
    },
  });
}
