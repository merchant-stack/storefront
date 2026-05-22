// Probe the new Waxpeer trade-status integration end-to-end.
//
// Pulls the most recent WAXPEER_P2P Trade rows from the DB, queries
// /v1/check-many-steam through our wrapper, and prints both the raw Waxpeer
// status code and our normalised state side-by-side with the local Trade
// row state. Useful for:
//   1. Confirming the API key + endpoint work after a deploy.
//   2. Validating Waxpeer's status codes against our normalisation
//      (preparing / sent / accepted / declined / unknown) on real trades.
//   3. Spot-checking whether the poller would do the right thing for any
//      historical trade — drift between Waxpeer's state and ours surfaces
//      here immediately.
//
// Run inside the worker container:
//   docker compose exec worker pnpm tsx src/scripts/probe-trade-status.ts

import { prisma } from '@rustskinpay/db';
import { waxpeer } from '../waxpeer-client.js';

const main = async (): Promise<void> => {
  if (waxpeer.isMock()) {
    console.error('Waxpeer client is in MOCK mode — set WAXPEER_API_KEY to probe live.');
    process.exit(1);
  }

  const trades = await prisma.trade.findMany({
    where: { botSteamId64: 'WAXPEER_P2P', tradeOfferId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      tradeOfferId: true,
      status: true,
      errorCode: true,
      createdAt: true,
      order: { select: { id: true, status: true } },
    },
  });

  if (trades.length === 0) {
    console.log('no WAXPEER_P2P trades in DB — nothing to probe.');
    return;
  }

  console.log(`probing ${trades.length} most recent waxpeer trades…\n`);

  const ids = trades.map((t) => t.tradeOfferId).filter((x): x is string => x !== null);
  const liveStatuses = await waxpeer.checkTradeStatuses(ids);
  const byId = new Map(liveStatuses.map((s) => [s.id, s]));

  console.log(
    [
      'order'.padEnd(28),
      'trade'.padEnd(28),
      'waxpeerId'.padEnd(12),
      'localTrade'.padEnd(12),
      'localOrder'.padEnd(12),
      'rawStatus',
      'liveState',
      'reason',
    ].join('  '),
  );
  console.log('-'.repeat(140));

  for (const t of trades) {
    const live = t.tradeOfferId ? byId.get(t.tradeOfferId) : undefined;
    console.log(
      [
        t.order.id.padEnd(28),
        t.id.padEnd(28),
        (t.tradeOfferId ?? '-').padEnd(12),
        t.status.padEnd(12),
        t.order.status.padEnd(12),
        String(live?.rawStatus ?? '-').padEnd(9),
        (live?.state ?? '?').padEnd(11),
        live?.reason ?? '',
      ].join('  '),
    );
  }

  await prisma.$disconnect();
};

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
