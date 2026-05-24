// Standalone rust.tm probe — only needs RUSTTM_API_KEY.
// READ-ONLY: validates auth + catalog. Does NOT call buy or buy-for.
//
// Run:  pnpm --filter @rustskinpay/api exec tsx src/scripts/rusttm-quick-probe.ts
//
// Reports:
//   1. Account balance + currency (proves auth + key alive)
//   2. Search for known reference items in the cheap end (Tan Boots,
//      Desert Jacket, Sealed Graffiti) — proves catalog reachable + lets
//      us read price unit (docs say 1 USD = 1000, but verify)
import 'dotenv/config';

const API_KEY = process.env.RUSTTM_API_KEY;
if (!API_KEY) {
  console.error('Missing RUSTTM_API_KEY in environment.');
  process.exit(2);
}

const BASE = 'https://rust.tm/api/v2';

interface Json {
  [k: string]: unknown;
}

async function call(endpoint: string, params: Record<string, string> = {}): Promise<Json> {
  const url = new URL(`${BASE}/${endpoint}`);
  url.searchParams.set('key', API_KEY!);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Hide the key when logging.
  const safe = url.toString().replace(API_KEY!, 'KEY_REDACTED');
  const res = await fetch(url.toString());
  const text = await res.text();
  let json: Json;
  try {
    json = JSON.parse(text) as Json;
  } catch {
    json = { _raw: text };
  }
  console.log(`\n→ ${safe}\n← HTTP ${res.status}`);
  return json;
}

async function main(): Promise<void> {
  console.log('--- balance (get-money) ---');
  const bal = await call('get-money');
  console.log(JSON.stringify(bal, null, 2));

  // Reference items at the cheap end of catalog — use to verify price unit.
  // Steam-market real prices: Tan Boots ~$0.10, Desert Jacket ~$0.10,
  // Sealed Graffiti ~$0.03–0.10. If rust.tm returns numbers near these
  // (×1000 if milidollars per docs), unit is confirmed.
  const refs = ['Tan Boots', 'Desert Jacket', 'Blue Jacket'];
  for (const name of refs) {
    console.log(`\n--- search "${name}" ---`);
    const res = await call('search-item-by-hash-name', { hash_name: name });
    // Trim huge arrays in print
    if (Array.isArray((res as Json).data)) {
      const data = (res as { data: unknown[] }).data;
      console.log(`success=${(res as Json).success}  data.length=${data.length}`);
      for (const item of data.slice(0, 3)) {
        console.log(JSON.stringify(item));
      }
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
  }
}

main().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
