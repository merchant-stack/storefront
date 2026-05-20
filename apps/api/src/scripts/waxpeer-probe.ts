// Probe Waxpeer API: validate the key + sample cheap Rust listings.
import '../env.js';

const KEY = process.env.WAXPEER_API_KEY;
if (!KEY) {
  console.error('WAXPEER_API_KEY missing');
  process.exit(1);
}

async function hit(path: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://api.waxpeer.com${path}${sep}api=${KEY}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(`Non-JSON response: ${text.slice(0, 200)}`);
    return null;
  }
}

console.log('=== /user ===');
const user = await hit('/v1/user');
console.log(JSON.stringify(user, null, 2));

console.log('\n=== /get-items-list?game=rust&min_price=10&max_price=200&order=price&sort=ASC&limit=5 ===');
const cheap = await hit('/v1/get-items-list?game=rust&min_price=10&max_price=200&order=price&sort=ASC&limit=5');
console.log(JSON.stringify(cheap, null, 2)?.slice(0, 2000));

console.log('\n=== /get-items-list?game=rust&order=price&sort=ASC&limit=5 (no price filter) ===');
const allCheap = await hit('/v1/get-items-list?game=rust&order=price&sort=ASC&limit=5');
console.log(JSON.stringify(allCheap, null, 2)?.slice(0, 2000));
