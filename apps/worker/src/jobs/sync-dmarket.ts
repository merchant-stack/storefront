// Periodic catalog sync. Currently sources from rust.tm — moved here from
// Waxpeer on 2026-05-24 after four Waxpeer keys died in 36h. rust.tm is the
// TM-family Rust marketplace (sister of market.csgo.com), same P2P
// architecture, deeper catalog, no key-rotation drama. Waxpeer + DMarket
// clients are kept wired in the repo as dormant fallbacks; switching back is
// a code change here only (provider tag + import).
//
// Items previously seen but absent from this batch are marked available=false
// so the storefront stops showing them.

import type { Job } from 'bullmq';
import pino from 'pino';
import { prisma } from '@rustskinpay/db';
import { applyMarkup } from '@rustskinpay/shared/dmarket';
import type { RustTmOffer } from '@rustskinpay/shared/rusttm';
import { rusttm } from '../rusttm-client.js';
import { env } from '../env.js';

const log = pino({ name: 'sync-source' });

export interface SyncDMarketJob {
  gameId?: string;
  limit?: number;
}

// Price bands in USD cents. rust.tm's `minPriceMinor`/`maxPriceMinor` are in
// cents (we convert to milles at the boundary inside the rust.tm client).
const PRICE_BANDS: Array<{ min: number; max?: number; limit: number; label: string }> = [
  { min: 1, max: 200, limit: 100, label: '$0.01–$2' },
  { min: 200, max: 1000, limit: 80, label: '$2–$10' },
  { min: 1000, max: 5000, limit: 60, label: '$10–$50' },
  { min: 5000, max: 20000, limit: 40, label: '$50–$200' },
  { min: 20000, limit: 20, label: '$200+' },
];

export async function syncDMarket(job: Job<SyncDMarketJob>): Promise<{
  fetched: number;
  upserted: number;
  retired: number;
}> {
  const gameId = job.data.gameId ?? 'rust';
  const markupBps = env.DMARKET_DEFAULT_MARKUP_BPS;
  const startedAt = new Date();

  log.info(
    { gameId, mock: rusttm.isMock(), bands: PRICE_BANDS.length, source: 'RUSTTM' },
    'sync starting',
  );

  const allOffers: RustTmOffer[] = [];
  let bandFailures = 0;
  for (const band of PRICE_BANDS) {
    try {
      const offers = await rusttm.searchItems({
        gameId,
        limit: band.limit,
        minPriceMinor: band.min,
        maxPriceMinor: band.max,
      });
      log.info({ band: band.label, count: offers.length }, 'band fetched');
      allOffers.push(...offers);
    } catch (err) {
      bandFailures += 1;
      log.error({ band: band.label, err }, 'band fetch failed');
    }
  }

  // rust.tm's itemId == market_hash_name (the dump is unique by name). Dedup
  // across bands by hash_name in case price-range boundaries overlap.
  const seen = new Set<string>();
  const usable = allOffers.filter((o) => {
    if (!o.itemId || o.priceMinor <= 0) return false;
    if (seen.has(o.itemId)) return false;
    seen.add(o.itemId);
    return true;
  });

  for (const offer of usable) {
    await upsertOffer(offer, gameId, markupBps);
  }

  // Safety: if every band failed (and so we have no fresh data at all), do NOT
  // retire the previous snapshot. Otherwise a single rust.tm outage / revoked
  // key wipes the storefront in a single tick — same trap that bit us with
  // Waxpeer on 2026-05-23. Stale listings beat an empty grid.
  const allBandsFailed = bandFailures === PRICE_BANDS.length;
  const fetchedIds = usable.map((o) => o.itemId);
  const retired = allBandsFailed
    ? { count: 0 }
    : await prisma.sourceItem.updateMany({
        where: {
          provider: 'RUSTTM',
          gameId,
          available: true,
          sourceOfferId: { notIn: fetchedIds },
        },
        data: { available: false },
      });

  // Also retire all legacy WAXPEER and DMARKET items so they don't show in the
  // storefront. The previous-provider rows are stale from the moment we cut
  // over; leaving them visible would let buyers click items we can't fulfil.
  const retiredLegacyWax = await prisma.sourceItem.updateMany({
    where: { provider: 'WAXPEER', available: true },
    data: { available: false },
  });
  const retiredLegacyDm = await prisma.sourceItem.updateMany({
    where: { provider: 'DMARKET', available: true },
    data: { available: false },
  });

  log.info(
    {
      gameId,
      fetched: allOffers.length,
      usable: usable.length,
      retired: retired.count,
      retiredLegacyWaxpeer: retiredLegacyWax.count,
      retiredLegacyDmarket: retiredLegacyDm.count,
      bandFailures,
      retireSkipped: allBandsFailed,
      durationMs: Date.now() - startedAt.getTime(),
    },
    'sync complete',
  );

  return { fetched: allOffers.length, upserted: usable.length, retired: retired.count };
}

async function upsertOffer(
  offer: RustTmOffer,
  gameId: string,
  markupBps: number,
): Promise<void> {
  const salePriceMinor = applyMarkup(offer.priceMinor, markupBps);
  const title = offer.marketHashName;
  await prisma.sourceItem.upsert({
    where: {
      provider_sourceOfferId: { provider: 'RUSTTM', sourceOfferId: offer.itemId },
    },
    create: {
      provider: 'RUSTTM',
      sourceOfferId: offer.itemId,
      gameId,
      marketHashName: offer.marketHashName,
      displayName: title,
      iconUrl: offer.imageUrl,
      iconBackgroundColor: null,
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
      displayName: title,
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
