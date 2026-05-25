// Simulate a cobalt.skin server-to-server call to POST /api/merchant/sessions.
//
// Use this to spawn a real /pay/<id> session without writing any merchant
// integration code on cobalt.skin's side — the script signs the request with
// MERCHANT_COBALT_API_SECRET (already loaded into the api container's env
// from /opt/rustskinpay/api.env) and prints the buyer-facing checkout URL.
//
// Run on the server (env is already populated):
//   docker compose exec api pnpm exec tsx \
//     src/scripts/merchant-session-smoke.ts <amount-cents> [user-id] [return-url]
//
// Examples:
//   merchant-session-smoke.ts 500                  → $5 deposit, anonymous
//   merchant-session-smoke.ts 1000 user_42         → $10 deposit, user_42
//   merchant-session-smoke.ts 250 u1 https://cobalt.skin/done
//
// What it does:
//   1. Signs the exact same canonical string our verifier checks
//      (METHOD\nPATH\nTS\nNONCE\nSHA256(body))
//   2. POSTs to the local api over loopback (default http://127.0.0.1:4000)
//      so DNS / Caddy don't matter
//   3. Prints the response. The `checkout_url` is what you open in a browser
//      to land on /pay/<id> exactly like a real cobalt.skin user would.

import { randomBytes } from 'node:crypto';
import 'dotenv/config';
import { signRequest } from '@rustskinpay/shared/merchant-hmac';

const SECRET = process.env.MERCHANT_COBALT_API_SECRET;
if (!SECRET) {
  console.error('Missing MERCHANT_COBALT_API_SECRET in environment.');
  process.exit(2);
}

// Default to the API_ORIGIN env so this also works on the server when the
// caller's network proxy chokes on direct rustsupply.com. Falls back to local
// loopback inside the api container.
const TARGET = process.env.MERCHANT_SMOKE_TARGET ?? process.env.API_ORIGIN ?? 'http://127.0.0.1:4000';
const PATH = '/api/merchant/sessions';
const MERCHANT_ID = 'm_cobalt_skin';

interface Args {
  amountMinor: number;
  userId: string | undefined;
  returnUrl: string;
  cancelUrl: string;
}

function parseArgs(argv: string[]): Args {
  const amountStr = argv[0];
  if (!amountStr) {
    console.error('Usage: merchant-session-smoke.ts <amount-cents> [user-id] [return-url]');
    process.exit(2);
  }
  const amountMinor = Number(amountStr);
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    console.error(`Invalid amount: "${amountStr}" — must be a positive integer in cents.`);
    process.exit(2);
  }
  const userId = argv[1];
  const returnUrl = argv[2] ?? 'https://cobalt.skin/deposit/smoke/done';
  const cancelUrl = 'https://cobalt.skin/deposit/smoke/cancelled';
  return { amountMinor, userId, returnUrl, cancelUrl };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  // merchant_order_id must be unique per session — repeating it would return
  // the same prior session by idempotency. We embed a random tail so smoke
  // runs don't collide with each other.
  const merchantOrderId = `smoke_${Date.now()}_${randomBytes(3).toString('hex')}`;

  const bodyObj = {
    merchant_order_id: merchantOrderId,
    amount_minor: args.amountMinor,
    currency: 'USD' as const,
    return_url: args.returnUrl,
    cancel_url: args.cancelUrl,
    ...(args.userId ? { user_identifier: args.userId } : {}),
    metadata: { source: 'merchant-session-smoke', spawned_at: new Date().toISOString() },
  };
  // JSON.stringify with no whitespace — must match the bytes the server reads
  // back via rawBody. Pretty-printing would break the signature.
  const body = JSON.stringify(bodyObj);

  const signed = signRequest({
    method: 'POST',
    path: PATH,
    body,
    secret: SECRET!,
  });

  const url = `${TARGET}${PATH}`;
  console.log(`→ POST ${url}`);
  console.log(`  amount: $${(args.amountMinor / 100).toFixed(2)}`);
  console.log(`  merchant_order_id: ${merchantOrderId}`);
  console.log(`  user_identifier: ${args.userId ?? '(none)'}`);
  console.log(`  return_url: ${args.returnUrl}`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Id': MERCHANT_ID,
      'X-Timestamp': signed.timestamp,
      'X-Nonce': signed.nonce,
      'X-Signature': signed.signature,
    },
    body,
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { _raw: text };
  }

  console.log(`\n← HTTP ${res.status}`);
  console.log(JSON.stringify(parsed, null, 2));

  if (
    res.status === 201 &&
    parsed &&
    typeof parsed === 'object' &&
    'checkout_url' in (parsed as Record<string, unknown>)
  ) {
    const cu = (parsed as { checkout_url: unknown }).checkout_url;
    if (typeof cu === 'string') {
      console.log(`\n✓ Open in a browser: ${cu}`);
    }
  } else {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
