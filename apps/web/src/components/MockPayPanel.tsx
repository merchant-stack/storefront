'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/api';

interface Props {
  orderId: string;
}

type Action = 'pay' | 'cancel';

export const MockPayPanel = ({ orderId }: Props) => {
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (action: Action) => {
    setPending(action);
    setError(null);
    try {
      const path = action === 'pay' ? '/api/_dev/mock-pay' : '/api/_dev/mock-cancel';
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Request failed (${res.status})`);
        return;
      }
      window.location.href =
        action === 'pay'
          ? `/checkout/success?orderId=${encodeURIComponent(orderId)}`
          : `/checkout/cancelled?orderId=${encodeURIComponent(orderId)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="mt-6 flex w-full flex-col gap-3">
      <button
        type="button"
        onClick={() => void submit('pay')}
        disabled={pending !== null}
        className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {pending === 'pay' ? 'Processing…' : 'Pay (mock)'}
      </button>
      <button
        type="button"
        onClick={() => void submit('cancel')}
        disabled={pending !== null}
        className="w-full rounded-md border border-neutral-700 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending === 'cancel' ? 'Cancelling…' : 'Cancel'}
      </button>
      {error ? <div className="text-sm text-red-400">{error}</div> : null}
    </div>
  );
};
