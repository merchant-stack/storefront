// One-shot recovery script.
//
// When `enqueueBuyAndDispatch` fails AFTER `finalizeOrderPayment` already
// committed the Order → PAID flip (Redis blip / network issue / etc.), the
// order is stuck in PAID with no fulfilment job. UI polls forever showing
// "Locating your skin". This script finds those orphans and enqueues the
// missing job so the worker can pick them up.
//
// Run inside the worker container:
//   docker compose exec worker pnpm tsx src/scripts/recover-stuck-orders.ts

import { prisma } from '@rustskinpay/db';
import { buyAndDispatchQueue } from '../queue.js';

const main = async (): Promise<void> => {
  const stuck = await prisma.order.findMany({
    where: { status: 'PAID', fulfilledAt: null },
    orderBy: { paidAt: 'desc' },
    take: 20,
    select: { id: true, paidAt: true, totalAmountMinor: true, currency: true },
  });

  if (stuck.length === 0) {
    console.log('no stuck PAID orders found');
    return;
  }

  console.log(`found ${stuck.length} stuck PAID order(s):`);
  for (const o of stuck) {
    console.log(`  ${o.id}  ${o.totalAmountMinor / 100} ${o.currency}  paid at ${o.paidAt?.toISOString() ?? '?'}`);
  }

  for (const o of stuck) {
    await buyAndDispatchQueue.add(
      'buy',
      { orderId: o.id },
      {
        jobId: `buy:${o.id}:recover:${Date.now()}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { age: 60 * 60 * 24, count: 1000 },
        removeOnFail: { age: 60 * 60 * 24 * 7 },
      },
    );
    console.log(`enqueued ${o.id}`);
  }

  console.log('done');
};

main()
  .catch((err) => {
    console.error('recovery failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
    void buyAndDispatchQueue.close();
  });
