// Periodic sync: fetch Rust offers across multiple price bands and upsert into
// SourceItem. Sampling by price tier gives the storefront a more representative
// mix (cheap clothing → mid-range armour → expensive weapons), instead of the
// 60 cheapest items returned by a single ascending sort.
//
// Items previously seen but absent from this batch are marked available=false
// so the storefront stops showing them.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { applyMarkup, type DMarketOffer } from '@rustskinpay/shared/dmarket';
import { dmarket } from '../dmarket-client.js';
import { env } from '../env.js';

const log = pino({ name: 'sync-dmarket' });

export interface SyncDMarketJob {
  gameId?: string;
  /** Optional override; ignored when bands are used. */
  limit?: number;
}

// Price bands in USD cents. Each band requests its own batch from DMarket; total
// catalog size = sum of band limits (subject to dedup if DMarket returns overlap).
const PRICE_BANDS: Array<{ priceFrom: number; priceTo?: number; limit: number; label: string }> = [
  { priceFrom: 50, priceTo: 1000, limit: 50, label: '$0.50–$10' },
  { priceFrom: 1000, priceTo: 5000, limit: 60, label: '$10–$50' },
  { priceFrom: 5000, priceTo: 20000, limit: 50, label: '$50–$200' },
  { priceFrom: 20000, limit: 30, label: '$200+' },
];

export async function syncDMarket(job: Job<SyncDMarketJob>): Promise<{
  fetched: number;
  upserted: number;
  retired: number;
}> {
  const gameId = job.data.gameId ?? 'rust';
  const markupBps = env.DMARKET_DEFAULT_MARKUP_BPS;
  const startedAt = new Date();

  log.info({ gameId, mock: dmarket.isMock(), bands: PRICE_BANDS.length }, 'sync starting');

  // Fetch each band in series so we don't slam DMarket. Concurrency=1 keeps the
  // rate-limit footprint predictable; total sync still completes in <10s.
  const allOffers: DMarketOffer[] = [];
  for (const band of PRICE_BANDS) {
    try {
      const offers = await dmarket.searchItems({
        gameId,
        limit: band.limit,
        priceFrom: band.priceFrom,
        priceTo: band.priceTo,
      });
      log.info({ band: band.label, count: offers.length }, 'band fetched');
      allOffers.push(...offers);
    } catch (err) {
      log.error({ band: band.label, err }, 'band fetch failed');
    }
  }

  // Skip offers with no usable price + dedup by offerId (price bands can overlap
  // on DMarket's side if priceFrom rounding catches the same offer twice).
  const seen = new Set<string>();
  const usable = allOffers.filter((o) => {
    if (!o.offerId || o.priceMinor <= 0) return false;
    if (seen.has(o.offerId)) return false;
    seen.add(o.offerId);
    return true;
  });

  for (const offer of usable) {
    await upsertOffer(offer, gameId, markupBps);
  }

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
      fetched: allOffers.length,
      usable: usable.length,
      retired: retired.count,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'sync complete',
  );

  return { fetched: allOffers.length, upserted: usable.length, retired: retired.count };
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
