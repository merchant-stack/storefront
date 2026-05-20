// One-off: peek at DMarket Rust offers. Confirms searchItems works against live API.
import 'dotenv/config';
import { searchItems, isMockMode } from '../services/dmarket.js';

async function main(): Promise<void> {
  if (isMockMode()) {
    console.error('Mock mode — DMARKET_*_KEY missing. Aborting.');
    process.exit(2);
  }
  const offers = await searchItems({ limit: 5 });
  console.log(`Fetched ${offers.length} offers`);
  for (const o of offers) {
    console.log(`- ${o.marketHashName.padEnd(40)} $${(o.priceMinor / 100).toFixed(2)}  [${o.offerId}]`);
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
