// One-off: validate DMarket Ed25519 signing by hitting /account/v1/balance.
// Run from repo root: pnpm --filter @rustskinpay/api exec tsx src/scripts/dmarket-balance.ts
import 'dotenv/config';
import { getBalance, isMockMode } from '../services/dmarket.js';

async function main(): Promise<void> {
  if (isMockMode()) {
    console.error('Mock mode — DMARKET_*_KEY missing in env. Aborting.');
    process.exit(2);
  }
  const bal = await getBalance();
  console.log(JSON.stringify(bal, null, 2));
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
