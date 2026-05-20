'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_URL } from '@/lib/api';

interface Props {
  sourceItemId: string;
  label?: string;
}

type CheckoutError =
  | { kind: 'text'; message: string }
  | { kind: 'trade_url_required' }
  | { kind: 'not_authenticated' };

// Global kill-switch. Read at build time from NEXT_PUBLIC_CHECKOUT_DISABLED.
// Must match the server's CHECKOUT_DISABLED env. When true, the buy button
// is replaced with a "launching soon" notice and POST /api/checkout is not
// attempted.
const CHECKOUT_DISABLED = process.env.NEXT_PUBLIC_CHECKOUT_DISABLED === 'true';

export const CheckoutButton = ({ sourceItemId, label = 'Pay now' }: Props) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<CheckoutError | null>(null);

  if (CHECKOUT_DISABLED) {
    return (
      <div className="flex flex-col gap-2">
        <div className="card flex items-center gap-3 border-amber-500/30 bg-amber-500/[0.04] px-4 py-3.5 text-sm text-amber-200">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" />
          </svg>
          <div>
            <p className="font-medium text-amber-100">Sales launching soon</p>
            <p className="mt-0.5 text-amber-300/80">
              We&apos;re finalising payment setup. Sign in and save your trade URL — you&apos;ll
              be ready the moment we open the store.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const onClick = async () => {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceItemId }),
      });
      if (res.status === 401) {
        setError({ kind: 'not_authenticated' });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        if (body?.error === 'trade_url_required') {
          setError({ kind: 'trade_url_required' });
          return;
        }
        const friendly =
          body?.error === 'item_temporarily_unavailable'
            ? "Sorry — this item is temporarily out of stock. We're restocking soon."
            : body?.error === 'item_unavailable'
              ? 'This item is no longer available.'
              : body?.error === 'listing_stale'
                ? 'This listing is out of date — please refresh the page to see the current price.'
                : (body?.error ?? `Checkout failed (${res.status})`);
        setError({ kind: 'text', message: friendly });
        return;
      }
      const data = (await res.json()) as { redirectUrl: string };
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError({ kind: 'text', message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn-primary w-full py-3.5 text-base"
      >
        {pending ? (
          <>
            <Spinner /> Redirecting…
          </>
        ) : (
          <>
            {label}
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </>
        )}
      </button>
      {error?.kind === 'trade_url_required' ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-sm text-amber-200">
          <p className="font-medium">Add your Steam trade URL first</p>
          <p className="mt-0.5 text-amber-300/80">
            We need it to deliver the skin to your account.
          </p>
          <Link href="/account" className="mt-2 inline-flex text-sm font-medium text-amber-100 underline underline-offset-2 hover:text-white">
            Go to account →
          </Link>
        </div>
      ) : error?.kind === 'not_authenticated' ? (
        <div className="rounded-lg border border-sky-500/20 bg-sky-500/[0.04] px-3 py-2.5 text-sm text-sky-200">
          <p>Please sign in with Steam to continue.</p>
          <Link href="/account" className="mt-2 inline-flex text-sm font-medium text-sky-100 underline underline-offset-2 hover:text-white">
            Go to sign in →
          </Link>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-sm text-red-300">
          {error.message}
        </div>
      ) : null}
    </div>
  );
};

const Spinner = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
  </svg>
);
