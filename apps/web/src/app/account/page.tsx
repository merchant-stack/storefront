'use client';

import { useEffect, useState } from 'react';
import { API_URL, fetchMe, type SessionUser } from '@/lib/api';

export default function AccountPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tradeUrl, setTradeUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      setTradeUrl(u?.tradeUrl ?? '');
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return <main className="mx-auto max-w-2xl px-6 py-10 text-neutral-500">Loading…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-neutral-400">Please sign in with Steam to manage your account.</p>
      </main>
    );
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/me/trade-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tradeUrl }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setMessage({ kind: 'err', text: body?.error ?? `Save failed (${res.status})` });
        return;
      }
      setMessage({ kind: 'ok', text: 'Trade URL saved.' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="text-2xl font-bold">Account</h1>

      <div className="mt-6 flex items-center gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={user.displayName} className="h-12 w-12 rounded-full" />
        ) : null}
        <div>
          <div className="font-medium">{user.displayName}</div>
          <div className="text-sm text-neutral-500">SteamID {user.steamId64}</div>
        </div>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="block text-sm font-medium text-neutral-300">Steam Trade URL</label>
        <p className="text-xs text-neutral-500">
          Find it at{' '}
          <a
            href="https://steamcommunity.com/my/tradeoffers/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Steam &gt; Inventory &gt; Trade Offers &gt; Who can send me Trade Offers
          </a>
          . Required to receive purchased skins.
        </p>
        <input
          type="url"
          value={tradeUrl}
          onChange={(e) => setTradeUrl(e.target.value)}
          placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
          className="w-full rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:bg-neutral-700"
        >
          {saving ? 'Saving…' : 'Save trade URL'}
        </button>
        {message ? (
          <div
            className={
              message.kind === 'ok'
                ? 'text-sm text-emerald-400'
                : 'text-sm text-red-400'
            }
          >
            {message.text}
          </div>
        ) : null}
      </form>
    </main>
  );
}
