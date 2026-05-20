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
        className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {pending ? 'Redirecting…' : label}
      </button>
      {error ? <div className="text-sm text-red-400">{error}</div> : null}
    </div>
  );
};
