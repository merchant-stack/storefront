// One-off: peek at SourceItem rows synced from DMarket.
import '../env.js';
import { prisma } from '@rustskinpay/db';

async function main(): Promise<void> {
  const total = await prisma.sourceItem.count({ where: { provider: 'DMARKET' } });
  const available = await prisma.sourceItem.count({
    where: { provider: 'DMARKET', available: true },
  });
  const sample = await prisma.sourceItem.findMany({
    where: { provider: 'DMARKET', available: true },
    orderBy: { salePriceMinor: 'asc' },
    take: 6,
    select: {
      displayName: true,
      sourcePriceMinor: true,
      salePriceMinor: true,
      markupBps: true,
      sourceOfferId: true,
    },
  });
  console.log(`total: ${total}   available: ${available}`);
  for (const r of sample) {
    const src = (r.sourcePriceMinor / 100).toFixed(2);
    const sale = (r.salePriceMinor / 100).toFixed(2);
    console.log(`  ${r.displayName.padEnd(35)} $${src} → $${sale}  (+${r.markupBps / 100}%)`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
