// Public payment page for the merchant deposit gateway.
//
// URL: /pay/<orderId>. The orderId arrives in the URL as a long cuid; we
// treat it as the bearer token (same pattern as Stripe checkout sessions).
//
// White-label by design: the buyer should not see WHO is processing the
// payment behind the scenes. No rustsupply logo, no merchant name on
// screen — just "Checkout", the amount, and the Whop iframe. The merchant
// name lives only in server-side context (webhook delivery, refund routing).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { API_URL } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { CheckoutShell } from '@/components/CheckoutShell';
import { PayEmbed } from '@/components/PayEmbed';

// Override the global title template so the browser tab doesn't read
// "Something — RustSupply" on a page that's supposed to feel brandless.
export const metadata: Metadata = { title: { absolute: 'Checkout' } };

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

  const summary = (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-4">
      <div className="text-sm text-zinc-400">Amount due</div>
      <div className="font-display text-2xl font-bold tabular-nums text-white">
        {amountLabel}
      </div>
    </div>
  );

  return (
    <CheckoutShell
      showBrand={false}
      subtitle="Complete the payment below to credit your account balance."
    >
      {isPaid ? (
        <div className="space-y-5">
          {summary}
          <PaidNotice returnUrl={session.return_url} />
        </div>
      ) : isTerminal ? (
        <div className="space-y-5">
          {summary}
          <FailedNotice status={session.status} cancelUrl={session.cancel_url} />
        </div>
      ) : !session.plan_id ? (
        <div className="space-y-5">
          {summary}
          <div className="rounded-xl border border-red-500/20 bg-red-500/[0.04] px-4 py-3.5 text-sm text-red-300">
            <p className="font-medium">Unexpected state</p>
            <p className="mt-1 text-[13px] opacity-90">
              This payment session is in an unexpected state. Please go back and start a new
              deposit.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {summary}
          <PayEmbed planId={session.plan_id} returnUrl={session.return_url ?? '/'} />
          <p className="text-center text-[11px] text-zinc-500">
            Secure payment · Card details never touch our servers.
          </p>
        </div>
      )}
    </CheckoutShell>
  );
}

function PaidNotice({ returnUrl }: { returnUrl: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-300">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-emerald-100">Payment received</h2>
        <p className="mt-1 text-sm text-emerald-200/80">
          Your deposit is being credited to your balance.
        </p>
      </div>
      {returnUrl ? (
        <a href={returnUrl} className="btn-primary mt-2 w-full py-3 text-sm">
          Continue →
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
    <div className="flex flex-col gap-4 rounded-xl border border-red-500/20 bg-red-500/[0.04] p-5 text-center">
      <h2 className="font-display text-lg font-bold text-red-100">{message}</h2>
      {cancelUrl ? (
        <a href={cancelUrl} className="btn-secondary mx-auto w-full max-w-xs py-2.5 text-sm">
          Go back
        </a>
      ) : null}
    </div>
  );
}
