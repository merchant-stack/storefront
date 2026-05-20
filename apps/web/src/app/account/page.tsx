'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  API_URL,
  fetchMe,
  fetchMyOrders,
  type SessionUser,
  type OrderSummary,
  type OrderStatus,
} from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { OrderRowSkeleton } from '@/components/Skeleton';

const STATUS_STYLE: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  PAID: { label: 'Paid', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  FULFILLING: { label: 'Fulfilling', cls: 'bg-brand/15 text-brand-300 border-brand/30' },
  FULFILLED: { label: 'Delivered', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  FAILED: { label: 'Failed', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  CANCELLED: { label: 'Cancelled', cls: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/30' },
  REFUNDED: { label: 'Refunded', cls: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
};

export default function AccountPage() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tradeUrl, setTradeUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      setTradeUrl(u?.tradeUrl ?? '');
      setLoaded(true);
      if (u) {
        void fetchMyOrders().then((res) => {
          setOrders(res.orders);
          setOrdersLoaded(true);
        });
      } else {
        setOrdersLoaded(true);
      }
    });
  }, []);

  if (!loaded) {
    return <main className="mx-auto max-w-3xl px-6 py-10 text-zinc-500">Loading…</main>;
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Sign in required</h1>
        <p className="mt-2 text-zinc-400">
          Please sign in with Steam to manage your account and view orders.
        </p>
        <a href={`${API_URL}/auth/steam/login`} className="btn-primary mt-6 inline-flex">
          Sign in with Steam
        </a>
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
        const text =
          body?.error === 'trade_url_not_owned'
            ? "That trade URL doesn't match your Steam account."
            : body?.error === 'invalid_trade_url'
              ? 'Not a valid Steam trade URL.'
              : body?.error ?? `Save failed (${res.status})`;
        setMessage({ kind: 'err', text });
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
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-bold">Account</h1>

      {/* Profile card */}
      <section className="card mt-6 p-5">
        <div className="flex items-center gap-4">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt=""
              className="h-14 w-14 rounded-lg ring-1 ring-white/10"
            />
          ) : (
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-zinc-800 text-lg font-semibold">
              {user.displayName.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="text-lg font-semibold">{user.displayName}</div>
            <div className="mt-0.5 font-mono text-xs text-zinc-500">SteamID {user.steamId64}</div>
          </div>
          {user.tradeUrl ? (
            <span className="chip text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Trade URL set
            </span>
          ) : (
            <span className="chip text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Trade URL missing
            </span>
          )}
        </div>
      </section>

      {/* Trade URL */}
      <section className="card mt-6 p-6">
        <h2 className="font-display text-xl font-bold">Steam trade URL</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Required to receive purchased skins. Find it at{' '}
          <a
            href="https://steamcommunity.com/my/tradeoffers/privacy"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Steam → Inventory → Trade Offers → Who can send me Trade Offers
          </a>
          .
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <input
            type="url"
            value={tradeUrl}
            onChange={(e) => setTradeUrl(e.target.value)}
            placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
            className="input font-mono text-xs"
          />
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className="btn-primary text-sm">
              {saving ? 'Saving…' : 'Save trade URL'}
            </button>
            {message ? (
              <span
                className={`text-sm ${message.kind === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {message.text}
              </span>
            ) : null}
          </div>
        </form>
      </section>

      {/* Orders */}
      <section id="orders" className="mt-8 scroll-mt-20">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-xl font-bold">Order history</h2>
          {orders.length > 0 ? (
            <span className="text-xs text-zinc-500">
              {orders.length} order{orders.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>

        {!ordersLoaded ? (
          <ol className="mt-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <OrderRowSkeleton key={i} />
            ))}
          </ol>
        ) : orders.length === 0 ? (
          <div className="card mt-4 p-8 text-center">
            <p className="text-zinc-400">You haven&apos;t made any purchases yet.</p>
            <Link href="/market" className="btn-primary mt-4 inline-flex text-sm">
              Browse skins
            </Link>
          </div>
        ) : (
          <ol className="mt-4 space-y-3">
            {orders.map((o) => {
              const item = o.items[0];
              const style = STATUS_STYLE[o.status];
              return (
                <li key={o.id} className="card card-hover overflow-hidden">
                  <Link href={`/checkout/success?orderId=${o.id}`} className="flex items-center gap-4 p-4">
                    {item?.iconUrl ? (
                      <img
                        src={item.iconUrl}
                        alt=""
                        className="h-14 w-14 rounded-lg bg-zinc-950/60 object-contain p-1.5"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-lg bg-zinc-900" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{item?.itemName ?? 'Order'}</div>
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                        #{o.id.slice(-12)} · {new Date(o.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatPrice(o.totalAmountMinor, o.currency)}
                      </div>
                      <span className={`chip mt-1 border ${style.cls}`}>{style.label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </main>
  );
}
