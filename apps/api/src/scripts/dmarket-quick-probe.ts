// Standalone DMarket probe — only needs DMARKET_PUBLIC_KEY + DMARKET_SECRET_KEY.
// Bypasses api env validation so it runs without a working DB / Redis / secrets.
//
// Run:  pnpm --filter @rustskinpay/api exec tsx src/scripts/dmarket-quick-probe.ts
//
// Reports:
//   1. Account balance (proves auth works)
//   2. Offer count + cheapest 3 in each price band we actually use
import 'dotenv/config';
import { createDMarketClient } from '@rustskinpay/shared/dmarket';

const PUBLIC_KEY = process.env.DMARKET_PUBLIC_KEY;
const SECRET_KEY = process.env.DMARKET_SECRET_KEY;

if (!PUBLIC_KEY || !SECRET_KEY) {
  console.error('Missing DMARKET_PUBLIC_KEY or DMARKET_SECRET_KEY in environment.');
  process.exit(2);
}

const client = createDMarketClient({ publicKey: PUBLIC_KEY, secretKey: SECRET_KEY });

const BANDS = [
  { priceFrom: 1, priceTo: 100, label: '$0.01 – $1.00' },
  { priceFrom: 100, priceTo: 200, label: '$1.00 – $2.00' },
  { priceFrom: 200, priceTo: 1000, label: '$2.00 – $10.00' },
  { priceFrom: 1000, priceTo: 5000, label: '$10.00 – $50.00' },
  { priceFrom: 5000, priceTo: 20000, label: '$50.00 – $200.00' },
];

const GAMES: Array<{ id: string; label: string }> = [
  { id: 'rust', label: 'RUST' },
  { id: 'csgo', label: 'CS2 (csgo)' },
];

async function main(): Promise<void> {
  console.log('--- balance ---');
  try {
    const bal = await client.getBalance();
    console.log(`USD: $${(bal.usdMinor / 100).toFixed(2)}`);
  } catch (e) {
    console.error('balance FAILED:', e instanceof Error ? e.message : e);
    process.exit(1);
  }

  for (const game of GAMES) {
    console.log(`\n--- ${game.label} catalog by band ---`);
    for (const band of BANDS) {
      try {
        const offers = await client.searchItems({
          gameId: game.id,
          limit: 100,
          priceFrom: band.priceFrom,
          priceTo: band.priceTo,
        });
        console.log(`\n${band.label}: ${offers.length} offers fetched (capped at 100)`);
        for (const o of offers.slice(0, 3)) {
          console.log(`  $${(o.priceMinor / 100).toFixed(2).padStart(7)}  ${o.marketHashName}`);
        }
      } catch (e) {
        console.log(`${band.label}: FAILED — ${e instanceof Error ? e.message : e}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
