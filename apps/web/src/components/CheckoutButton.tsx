'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';

interface Props {
  sourceItemId: string;
  label?: string;
}

export const CheckoutButton = ({ sourceItemId, label = 'Pay now' }: Props) => {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        setError('Please sign in with Steam to continue.');
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Checkout failed (${res.status})`);
        return;
      }
      const data = (await res.json()) as { redirectUrl: string };
      window.location.href = data.redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
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
      {error ? (
        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.04] px-3 py-2 text-sm text-red-300">
          {error}
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
