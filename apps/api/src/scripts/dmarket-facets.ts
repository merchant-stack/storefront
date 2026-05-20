// Peek what type + rarity values actually exist in SourceItem so we know what
// the filter sidebar should show.
import '../env.js';
import { prisma } from '@rustskinpay/db';

async function main(): Promise<void> {
  const types = await prisma.sourceItem.groupBy({
    by: ['type'],
    where: { available: true, provider: 'DMARKET' },
    _count: { _all: true },
    orderBy: { _count: { type: 'desc' } },
  });
  const rarities = await prisma.sourceItem.groupBy({
    by: ['rarity'],
    where: { available: true, provider: 'DMARKET' },
    _count: { _all: true },
    orderBy: { _count: { rarity: 'desc' } },
  });
  console.log('Types:');
  for (const t of types) console.log(`  ${JSON.stringify(t.type)} × ${t._count._all}`);
  console.log('Rarities:');
  for (const r of rarities) console.log(`  ${JSON.stringify(r.rarity)} × ${r._count._all}`);

  // Peek at one raw payload to see what DMarket actually gives us.
  const sample = await prisma.sourceItem.findFirst({
    where: { provider: 'DMARKET' },
    select: { displayName: true, rawPayload: true },
  });
  console.log('\nExtra field (relevant subset):');
  const raw = sample?.rawPayload as Record<string, unknown> | null;
  if (raw && typeof raw === 'object' && 'extra' in raw) {
    console.log(JSON.stringify(raw.extra, null, 2));
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
