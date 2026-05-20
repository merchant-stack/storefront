// One-shot: rewrite SourceItem.type from the stored rawPayload using the new
// extra.type → categoryPath → top-level type fallback chain. Run after fixing
// normaliseOffer; cheaper than waiting for the next sync cycle.
import '../env.js';
import { prisma } from '@rustskinpay/db';

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .map((w) => {
      const first = w[0];
      return first ? first.toUpperCase() + w.slice(1).toLowerCase() : w;
    })
    .join(' ');
}

async function main(): Promise<void> {
  const rows = await prisma.sourceItem.findMany({
    where: { provider: 'DMARKET' },
    select: { id: true, type: true, rawPayload: true },
  });
  let updated = 0;
  for (const r of rows) {
    const raw = r.rawPayload as Record<string, unknown> | null;
    const extra = (raw && typeof raw === 'object' && raw.extra) as
      | Record<string, unknown>
      | undefined;
    const newType =
      (typeof extra?.type === 'string' && extra.type) ||
      (typeof extra?.categoryPath === 'string' && extra.categoryPath) ||
      (typeof raw?.type === 'string' && raw.type) ||
      null;
    const finalType = newType ? titleCase(newType) : null;
    if (finalType !== r.type) {
      await prisma.sourceItem.update({ where: { id: r.id }, data: { type: finalType } });
      updated += 1;
    }
  }
  console.log(`Backfill done. Updated ${updated} / ${rows.length} rows.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
