// rust.tm buy-for SMOKE TEST. Makes ONE real $0.14-ish purchase of "Tan Boots"
// and routes it to the trade URL you pass in.
//
// Use this ONLY after the rust.tm balance has at least $0.50 deposited
// (covers the buy + a small safety margin for price drift).
//
// Run:
//   $env:RUSTTM_API_KEY = Read-Host -Prompt "rust.tm API key"
//   $env:RUSTTM_BUYER_TRADE_URL = Read-Host -Prompt "buyer Steam trade URL"
//   pnpm --filter @rustskinpay/api exec tsx src/scripts/rusttm-buy-smoke.ts
//
// The buyer trade URL must be a real Steam tradeoffer URL like
//   https://steamcommunity.com/tradeoffer/new/?partner=12345678&token=abcdEFGH
// For a fully self-contained smoke test, use YOUR OWN Steam trade URL —
// you'll receive the Tan Boots in your own Steam inventory.
import 'dotenv/config';
import { createRustTmClient } from '@rustskinpay/shared/rusttm';

async function main(): Promise<void> {
  // Read env inside main() so the null-narrowing flows through the rest of
  // the body — checks at module scope don't propagate into functions under
  // strict tsconfig.
  const apiKey = process.env.RUSTTM_API_KEY;
  const tradeUrl = process.env.RUSTTM_BUYER_TRADE_URL;
  if (!apiKey) {
    console.error('Missing RUSTTM_API_KEY in environment.');
    process.exit(2);
  }
  if (!tradeUrl) {
    console.error('Missing RUSTTM_BUYER_TRADE_URL in environment.');
    process.exit(2);
  }

  const client = createRustTmClient({ apiKey });
  // 1. Confirm balance is enough.
  const bal = await client.getBalance();
  console.log(`--- balance: $${(bal.usdMinor / 100).toFixed(2)} USD ---`);
  if (bal.usdMinor < 30) {
    console.error('Balance < $0.30 — please deposit before running smoke test. Aborting.');
    process.exit(1);
  }

  // 2. Take the cheapest item currently listed in our range as the test
  //    target. We don't care which specific item — we care that buy-for
  //    succeeds and delivers. rust.tm's buy-for picks the cheapest available
  //    offer ≤ our price; we add 20% headroom for small upward drift.
  const offers = await client.searchItems({
    gameId: 'rust',
    minPriceMinor: 1,
    maxPriceMinor: 50, // up to $0.50
    limit: 20,
  });
  const target = offers[0];
  if (!target) {
    console.error('No items under $0.50 in current rust.tm catalog. Aborting.');
    process.exit(1);
  }
  const maxPriceMinor = Math.ceil(target.priceMinor * 1.2);
  console.log(`--- target: "${target.marketHashName}" @ $${(target.priceMinor / 100).toFixed(2)}, max price $${(maxPriceMinor / 100).toFixed(2)} ---`);

  // 3. Buy with a unique customId so we can poll status without state collisions.
  const customId = `smoke-${Date.now()}`;
  console.log(`--- buying with custom_id=${customId} ---`);
  const buy = await client.buyOffer(target.marketHashName, maxPriceMinor, tradeUrl, customId);
  console.log(JSON.stringify(buy, null, 2));

  if (!buy.success) {
    console.error(`buy-for failed: ${buy.errorMessage}`);
    process.exit(1);
  }

  // 4. Poll status a few times so we can see state progression.
  console.log('\n--- polling status for 90s ---');
  for (let i = 0; i < 6; i++) {
    await new Promise((r) => setTimeout(r, 15_000));
    const results = await client.checkTradeStatuses([customId]);
    const status = results[0];
    if (!status) {
      console.log(`[${i * 15}s] no status row returned, retrying`);
      continue;
    }
    console.log(`[${i * 15}s] state=${status.state} rawStage=${status.rawStage} sendUntil=${status.sendUntil} reason=${status.reason ?? ''}`);
    if (status.state === 'accepted' || status.state === 'declined') break;
  }

  console.log(
    '\nSmoke test done. If state reached "sent" or "accepted", check the buyer Steam account inbox for a trade offer.\nIf state is "preparing" still, give it more time and poll manually:',
  );
  console.log(`   curl -sS "https://rust.tm/api/v2/get-buy-info-by-custom-id?key=YOURKEY&custom_id=${customId}"`);
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
