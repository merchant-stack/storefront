// Probe DMarket for Rust items at the very bottom of the price range to find
// the true floor. Helps decide whether $0.10 items are realistic to source.
import '../env.js';
import { searchItems } from '../services/dmarket.js';

async function main(): Promise<void> {
  const tests = [
    { priceFrom: 1, priceTo: 10, label: '$0.01–$0.10' },
    { priceFrom: 10, priceTo: 50, label: '$0.10–$0.50' },
    { priceFrom: 50, priceTo: 100, label: '$0.50–$1.00' },
    { priceFrom: 100, priceTo: 500, label: '$1.00–$5.00' },
  ];
  for (const t of tests) {
    const offers = await searchItems({ ...t, limit: 5 });
    console.log(`\n${t.label}: ${offers.length} offers`);
    for (const o of offers.slice(0, 3)) {
      console.log(`  $${(o.priceMinor / 100).toFixed(2)}  ${o.marketHashName}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
