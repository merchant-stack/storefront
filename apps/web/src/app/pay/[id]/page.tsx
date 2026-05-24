// Public payment page for the merchant deposit gateway.
//
// URL: /pay/<orderId>. The orderId arrives in the URL as a long cuid; we
// treat it as the bearer token (same pattern as Stripe checkout sessions).
//
// What this page renders:
//   - Minimal header: merchant name + amount (no marketplace branding,
//     since the customer didn't come here to shop — they came here to pay
//     a specific amount toward cobalt.skin)
//   - The Whop checkout iframe, mounted via @whop/checkout (already in use
//     by /checkout/[id]). On complete → redirect to the merchant's return
//     URL with a success token they can verify against their own webhook.
//   - Friendly terminal states if the order is already PAID or FAILED.

import { notFound } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { PayEmbed } from '@/components/PayEmbed';

interface PaySession {
  session_id: string;
  status: 'PENDING_PAYMENT' | 'PAID' | 'FULFILLING' | 'FULFILLED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  amount_minor: number;
  currency: string;
  merchant_name: string;
  plan_id: string | null;
  return_url: string | null;
  cancel_url: string | null;
  paid_at: string | null;
}

async function fetchSession(id: string): Promise<PaySession | null> {
  const res = await fetch(`${API_URL}/api/pay/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as PaySession;
}

export default async function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await fetchSession(id);
  if (!session) notFound();

  const amountLabel = formatPrice(session.amount_minor, session.currency);
  const isTerminal = session.status !== 'PENDING_PAYMENT';
  const isPaid =
    session.status === 'PAID' ||
    session.status === 'FULFILLING' ||
    session.status === 'FULFILLED';

  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <div className="card overflow-hidden">
        <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-5">
          <div className="label">Deposit to</div>
          <div className="mt-0.5 font-display text-xl font-bold tracking-tight">
            {session.merchant_name}
          </div>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-zinc-400">Amount</span>
            <span className="font-display text-3xl font-bold tabular-nums text-brand">
              {amountLabel}
            </span>
          </div>

          {/* Terminal-state UIs */}
          {isPaid ? (
            <PaidNotice returnUrl={session.return_url} />
          ) : isTerminal ? (
            <FailedNotice status={session.status} cancelUrl={session.cancel_url} />
          ) : !session.plan_id ? (
            // Edge case: PENDING but no Whop plan was created. Shouldn't
            // normally happen — the merchant should re-create the session
            // with a fresh merchant_order_id.
            <div className="mt-6 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-3 text-sm text-red-300">
              This payment session is in an unexpected state. Please return to{' '}
              {session.merchant_name} and start a new deposit.
            </div>
          ) : (
            <div className="mt-6">
              <PayEmbed
                planId={session.plan_id}
                returnUrl={session.return_url ?? '/'}
              />
            </div>
          )}
        </div>

        <div className="border-t border-white/[0.06] bg-white/[0.02] px-6 py-3">
          <p className="text-center text-[11px] text-zinc-500">
            Secure payment · Card details never touch our servers
          </p>
        </div>
      </div>
    </main>
  );
}

function PaidNotice({ returnUrl }: { returnUrl: string | null }) {
  return (
    <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-emerald-100">Payment received</h2>
        <p className="mt-1 text-sm text-emerald-200/80">
          Your deposit is on its way to your balance.
        </p>
      </div>
      {returnUrl ? (
        <a
          href={returnUrl}
          className="btn-primary mt-2 w-full py-3 text-sm"
        >
          Return to merchant →
        </a>
      ) : null}
    </div>
  );
}

function FailedNotice({ status, cancelUrl }: { status: string; cancelUrl: string | null }) {
  const message =
    status === 'CANCELLED'
      ? 'This payment session was cancelled.'
      : status === 'REFUNDED'
        ? 'This payment was refunded.'
        : 'This payment did not complete.';
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-lg border border-red-500/20 bg-red-500/[0.04] p-5 text-center">
      <h2 className="font-display text-lg font-bold text-red-100">{message}</h2>
      {cancelUrl ? (
        <a href={cancelUrl} className="btn-secondary mx-auto w-full max-w-xs py-2.5 text-sm">
          Back to merchant
        </a>
      ) : null}
    </div>
  );
}
