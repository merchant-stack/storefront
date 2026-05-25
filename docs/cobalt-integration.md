# RustSupply payment gateway — cobalt.skin integration

This is the integration spec for **cobalt.skin**'s server-side developer.
You'll be calling the RustSupply payment gateway to accept card / Apple Pay /
Google Pay deposits from your users, then receiving an HMAC-signed webhook
from us when a deposit completes.

The buyer never sees raw RustSupply or Whop branding inside your "deposit"
button flow — they just see a payment form on `rustsupply.com/pay/<id>` and
get sent back to you when done.

---

## Architecture in 30 seconds

```
                ┌──────────────────┐
                │   cobalt.skin    │
                │  (your server)   │
                └────────┬─────────┘
                         │
        (1) POST /api/merchant/sessions    HMAC-signed
                         │
                         ▼
                 ┌─────────────────┐
                 │   RustSupply    │
                 │     API         │
                 └────────┬────────┘
                          │
        (2) returns checkout_url
                          │
                          ▼
        cobalt.skin redirects user's browser to RustSupply
                          │
                          ▼
              ┌─────────────────────────┐
              │  rustsupply.com/pay/... │  embedded Whop form
              │  user pays card / Apple │
              └────────────┬────────────┘
                           │
        (3) Whop notifies RustSupply (their normal webhook)
                           │
                           ▼
                  RustSupply marks PAID
                           │
        (4) RustSupply POSTs HMAC-signed webhook to YOUR endpoint
                           │
                           ▼
              ┌──────────────────────┐
              │  cobalt.skin webhook │  verify signature
              │   handler            │  credit user balance
              └──────────────────────┘
        (5) buyer's browser is redirected back to your return_url
            (UX only — DON'T credit the user from the redirect alone;
            wait for our webhook in step 4)
```

---

## Credentials we'll give you

- **`MERCHANT_ID`**: `m_cobalt_skin`
- **`API_SECRET`**: 32-byte hex string. Used to HMAC-sign your requests to us.
- **`WEBHOOK_SECRET`**: 32-byte hex string. Used to HMAC-sign our outbound
  webhooks to you (so you can verify they're from us).
- **Webhook URL**: `https://cobalt.skin/webhooks/rustsupply` (or whatever
  path you set up — give us the URL).

Both secrets must be kept server-side only. Never ship them to the browser.

## What we'll need from you

- The webhook URL on your side (where we POST signed payment events).
- **Your server's egress IP(s)** — the public IPs your backend calls our
  `/api/merchant/sessions` endpoint from. We add these to a server-side
  allowlist so even a leaked `API_SECRET` can't be used from arbitrary
  attacker IPs. A single IP, a small list, or a CIDR range all work. If
  your egress IPs change (autoscaling, infra migration) just tell us and
  we'll update the list — until then your requests will start returning 401. During the initial integration window we can leave the allowlist
  open if you don't have stable IPs yet; switch on after you go to prod.

---

## Step 1: create a deposit session

When a user clicks "Deposit" on cobalt.skin, your server makes one signed
POST to RustSupply, then redirects the user's browser to the returned URL.

### Request

```
POST https://api.rustsupply.com/api/merchant/sessions
Headers:
  Content-Type: application/json
  X-Merchant-Id: m_cobalt_skin
  X-Timestamp:   <unix-seconds>
  X-Nonce:       <16-32 hex chars, randomly generated per request>
  X-Signature:   <hex of HMAC-SHA256(API_SECRET, signing_string)>
Body:
  {
    "merchant_order_id": "dep_<your-internal-deposit-id>",
    "amount_minor": 5000,
    "currency": "USD",
    "return_url": "https://cobalt.skin/deposit/<your-id>/done",
    "cancel_url": "https://cobalt.skin/deposit/<your-id>/cancelled",
    "user_identifier": "<your-internal-user-id>",
    "metadata": { "any": "json you want echoed back in the webhook" }
  }
```

Required: `merchant_order_id`, `amount_minor`, `currency`, `return_url`.
Optional: `cancel_url`, `user_identifier`, `metadata`.

### Signing string

```
METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + sha256_hex(BODY)
```

Concrete example with sample values:

```
POST
/api/merchant/sessions
1779700000
2f4a8c3d9b7e5f1a
8d2c8be5b1d6f9e2... (sha256 of the body)
```

That whole 5-line block (newline-separated, no trailing newline) is what
you feed into HMAC-SHA256 with the `API_SECRET`. The hex of the result goes
into `X-Signature`.

### Response (`201 Created`)

```json
{
  "session_id": "ord_xyz...",
  "checkout_url": "https://rustsupply.com/pay/ord_xyz...",
  "expires_at": "2026-05-25T14:30:00Z",
  "merchant_order_id": "dep_12345",
  "amount_minor": 5000,
  "currency": "USD"
}
```

Redirect the user's browser to `checkout_url`. They'll see the payment form.

### Idempotency

If your server retries the same `merchant_order_id` (network blip, queue
retry, etc.) you get the **same** session back — never a duplicate. Use a
new `merchant_order_id` only for a genuinely new deposit.

### Error responses

| Status | `error`                        | Meaning                                                                                 |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------- |
| 400    | `invalid_request`              | Body validation failed; `details` tells you which field.                                |
| 400    | `return_url_not_allowed`       | `return_url` host isn't on our allowlist.                                               |
| 400    | `cancel_url_not_allowed`       | `cancel_url` host isn't on our allowlist.                                               |
| 401    | `unauthorized`                 | Bad / missing signature, expired timestamp, replayed nonce.                             |
| 409    | `idempotency_collision`        | Internal — shouldn't happen, contact us.                                                |
| 409    | `idempotency_incomplete`       | Previous attempt with this id partially failed; retry with a fresh `merchant_order_id`. |
| 503    | `price_oracle_unavailable`     | Transient — retry in ~30s.                                                              |
| 503    | `payment_provider_unavailable` | Transient — retry in ~30s.                                                              |

---

## Step 2: receive the success webhook

When the user pays, we POST a signed JSON payload to your webhook URL. You
**must** verify the signature before crediting the user.

### Headers we send

```
Content-Type: application/json
X-Event-Id: evt_xxxxxxxxxxxxxxxx
X-Timestamp: 1779700300
X-Signature: <hex HMAC-SHA256 over signing_string with WEBHOOK_SECRET>
User-Agent: RustSupply-Webhook/1.0
```

### Signing string (different from the API request signing!)

```
EVENT_ID + "." + TIMESTAMP + "." + RAW_BODY
```

Three dot-separated parts. Body is the exact bytes you read from the
request (don't re-parse/re-serialise before verifying).

### Body

```json
{
  "event": "session.paid",
  "event_id": "evt_xxxxxxxxxxxxxxxx",
  "session_id": "ord_xyz...",
  "merchant_order_id": "dep_12345",
  "amount_minor": 5000,
  "currency": "USD",
  "paid_at": "2026-05-25T14:25:00Z",
  "user_identifier": "<your-internal-user-id>",
  "metadata": { ...your original metadata echoed back... }
}
```

### Idempotency

We retry failed deliveries on this schedule: **5 min, 15 min, 1h, 6h, 24h**
(5 retries after the initial attempt, 6 total). If you successfully process
an event then 5xx on a retry, we'll deliver again — so store every
`event_id` you've seen and skip duplicates.

### Expected response

Return any 2xx status with an empty body to confirm receipt. Anything else
(or a timeout > 10s) triggers a retry.

---

## Sample Node.js code

### Client side — create a session

```js
import crypto from 'node:crypto';

const API_URL = 'https://api.rustsupply.com/api/merchant/sessions';
const MERCHANT_ID = 'm_cobalt_skin';
const API_SECRET = process.env.RUSTSUPPLY_API_SECRET;

async function createDepositSession({ depositId, amountUsd, userId }) {
  const body = JSON.stringify({
    merchant_order_id: depositId,
    amount_minor: Math.round(amountUsd * 100),
    currency: 'USD',
    return_url: `https://cobalt.skin/deposit/${depositId}/done`,
    cancel_url: `https://cobalt.skin/deposit/${depositId}/cancelled`,
    user_identifier: userId,
  });

  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const bodyHash = crypto.createHash('sha256').update(body, 'utf8').digest('hex');
  const stringToSign = ['POST', '/api/merchant/sessions', timestamp, nonce, bodyHash].join('\n');
  const signature = crypto.createHmac('sha256', API_SECRET).update(stringToSign).digest('hex');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Merchant-Id': MERCHANT_ID,
      'X-Timestamp': timestamp,
      'X-Nonce': nonce,
      'X-Signature': signature,
    },
    body,
  });
  if (!res.ok) throw new Error(`session create failed: ${res.status} ${await res.text()}`);
  return res.json(); // { session_id, checkout_url, expires_at, ... }
}
```

### Webhook handler

```js
import crypto from 'node:crypto';
import express from 'express';

const WEBHOOK_SECRET = process.env.RUSTSUPPLY_WEBHOOK_SECRET;
const seenEventIds = new Set(); // back this with Redis / DB in production

const app = express();

// Read raw body for HMAC verification; don't pre-parse JSON.
app.post(
  '/webhooks/rustsupply',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const eventId = req.header('X-Event-Id');
    const timestamp = req.header('X-Timestamp');
    const signature = req.header('X-Signature');
    if (!eventId || !timestamp || !signature) return res.sendStatus(400);

    const drift = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(drift) || drift > 5 * 60) return res.sendStatus(400);

    const body = req.body.toString('utf8');
    const stringToSign = [eventId, timestamp, body].join('.');
    const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(stringToSign).digest();
    const provided = Buffer.from(signature, 'hex');
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return res.sendStatus(400);
    }

    // Idempotency.
    if (seenEventIds.has(eventId)) return res.sendStatus(200);
    seenEventIds.add(eventId);

    const event = JSON.parse(body);
    if (event.event === 'session.paid') {
      // Credit the user's balance using event.user_identifier +
      // event.amount_minor. Do this in YOUR DB transaction; don't rely on
      // any RustSupply-side state.
      await creditUserBalance(event.user_identifier, event.amount_minor, event.session_id);
    }

    res.sendStatus(200);
  },
);
```

---

## Security checklist (your side)

- **Store secrets server-side only.** Never expose them to the browser.
- **Verify the webhook signature** before doing anything with the payload.
  An unsigned / invalid-signed request should be rejected.
- **Check timestamp drift** (±5 min) and **reject duplicate `event_id`s**.
  Without these, a recorded valid webhook could be replayed against you.
- **Credit the user from the webhook**, not the browser redirect. Anyone
  can hit your return URL with a fabricated query string.
- **Idempotency at credit time.** Even with `event_id` dedup, double-credit
  the same `merchant_order_id` is the worst-case failure mode — wrap the
  credit in a unique-key DB constraint.
- **Don't trust `amount_minor` from the user's browser.** The amount lives
  server-side; you've already told us when you created the session. The
  webhook just echoes it back.
- **Set up alerting** on webhook 4xx/5xx responses. If we retry 6 times and
  give up, we log to AuditLog on our side but you'll never see the credit
  unless you watch the request count.

---

## Limits + ops

- **Timestamp tolerance**: ±5 minutes (sync your servers via NTP).
- **Nonce retention**: 10 minutes. Don't reuse nonces.
- **Rate limit on our session-create endpoint**: 100 req/min per merchant
  (talk to us if you need more).
- **Session expiry**: 30 minutes from creation (informational — the buyer
  can technically still pay an old session if Whop's Plan is still live, but
  your `merchant_order_id` should be considered abandoned by then; create
  a new session).
- **Webhook retries**: 5 min, 15 min, 1h, 6h, 24h, then permanent FAILED.
- **Webhook timeout**: 10 seconds per attempt.

---

## Contact

Issues, secret rotation, raising rate limits, or anything else: drop a
message to the founder. We don't have a self-serve dashboard yet (Phase 2
work).
