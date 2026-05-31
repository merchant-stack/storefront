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
import { SkinPreview } from '@/components/SkinPreview';

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
  cover_skin: { name: string; icon_url: string | null } | null;
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
    <div className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-sm text-zinc-500">Amount due</div>
      <div className="font-display text-2xl font-bold tabular-nums text-zinc-950">
        {amountLabel}
      </div>
    </div>
  );

  return (
    <CheckoutShell
      showBrand={false}
      subtitle={null}
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
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm text-red-800">
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
          {session.cover_skin ? (
            <SkinPreview
              name={session.cover_skin.name}
              iconUrl={session.cover_skin.icon_url}
              priceLabel={amountLabel}
            />
          ) : null}
          <PayEmbed planId={session.plan_id} returnUrl={session.return_url ?? '/'} />
        </div>
      )}
    </CheckoutShell>
  );
}

function PaidNotice({ returnUrl }: { returnUrl: string | null }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center shadow-sm">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
        </svg>
      </div>
      <div>
        <h2 className="font-display text-xl font-bold text-emerald-900">Payment received</h2>
        <p className="mt-1 text-sm text-emerald-800/80">
          Your deposit is being credited to your balance.
        </p>
      </div>
      {returnUrl ? (
        <a
          href={returnUrl}
          className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
        >
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
    <div className="flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5 text-center shadow-sm">
      <h2 className="font-display text-lg font-bold text-red-900">{message}</h2>
      {cancelUrl ? (
        <a
          href={cancelUrl}
          className="mx-auto inline-flex w-full max-w-xs items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          Go back
        </a>
      ) : null}
    </div>
  );
}
