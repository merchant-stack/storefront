'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { WhopCheckoutEmbed } from '@whop/checkout/react';
import { API_URL } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import type { ItemDTO } from '@/lib/items';

interface Props {
  item: ItemDTO;
  buyable: boolean;
}

type CheckoutError =
  | { kind: 'text'; message: string }
  | { kind: 'trade_url_required' }
  | { kind: 'not_authenticated' }
  | { kind: 'stale'; lastKnownPrice: number; lastKnownCurrency: string };

type CheckoutSession = { orderId: string; planId: string };

const CHECKOUT_DISABLED = process.env.NEXT_PUBLIC_CHECKOUT_DISABLED === 'true';

// Skinramp-style flow: as soon as the buyer lands here we kick off
// /api/checkout, then swap the page to the Whop iframe. No intermediate "Pay
// $X" button — they already chose the item on /market/[id], asking them to
// re-confirm here just adds a click. Errors (auth missing, trade URL missing,
// listing stale) still bubble up inline; the kicker only runs once per item
// per mount.
export const CheckoutFlow = ({ item, buyable }: Props) => {
  const router = useRouter();
  const [error, setError] = useState<CheckoutError | null>(null);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Strict-mode guard: useEffect runs twice in dev. We never want to double-
  // POST /api/checkout (would burn two Whop Plans + two orphan orders).
  const startedRef = useRef(false);
  // Count stale-listing retries so we don't lock the buyer in an infinite
  // "Continue at the new price" dialog when the server keeps rejecting
  // (typically: the item's price oracle entry temporarily disappeared and
  // its lastSyncedAt won't refresh until the worker's next successful tick).
  const staleRetriesRef = useRef(0);

  const summary = <ItemSummary item={item} />;

  const startCheckout = async () => {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/checkout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sourceItemId: item.id }),
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
        if (body?.error === 'listing_stale') {
          const fresh = await fetch(`${API_URL}/api/items/${item.id}`, { cache: 'no-store' })
            .then((r) =>
              r.ok
                ? (r.json() as Promise<{
                    item: { salePriceMinor: number; currency: string; available?: boolean };
                  }>)
                : null,
            )
            .catch(() => null);
          if (!fresh || fresh.item.available === false) {
            setError({
              kind: 'text',
              message: 'This skin just sold out. Browse the market for similar items.',
            });
            return;
          }
          staleRetriesRef.current += 1;
          // After 2 consecutive stale rejections, stop offering the
          // "continue at new price" loop — the server isn't going to flip
          // on this tick. Surface a friendlier "try again in a moment"
          // and let the buyer refresh on their own.
          if (staleRetriesRef.current >= 2) {
            setError({
              kind: 'text',
              message:
                "This item's price hasn't refreshed yet on our side — try again in a minute or pick a different skin.",
            });
            return;
          }
          setError({
            kind: 'stale',
            lastKnownPrice: fresh.item.salePriceMinor,
            lastKnownCurrency: fresh.item.currency,
          });
          return;
        }
        const friendly =
          body?.error === 'item_temporarily_unavailable'
            ? "Sorry — this item is temporarily out of stock. We're restocking soon."
            : body?.error === 'item_unavailable'
              ? 'This item is no longer available.'
              : (body?.error ?? `Checkout failed (${res.status})`);
        setError({ kind: 'text', message: friendly });
        return;
      }
      const data = (await res.json()) as {
        orderId: string;
        redirectUrl: string;
        providerSessionId?: string;
      };
      if (data.providerSessionId) {
        setSession({ orderId: data.orderId, planId: data.providerSessionId });
      } else {
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      setError({ kind: 'text', message: err instanceof Error ? err.message : 'Network error' });
    }
  };

  useEffect(() => {
    if (CHECKOUT_DISABLED || !buyable) return;
    if (startedRef.current) return;
    startedRef.current = true;
    void startCheckout();
  }, [item.id, buyable]);

  const retryAfterStaleRefresh = async () => {
    setRefreshing(true);
    startedRef.current = false;
    await startCheckout();
    setRefreshing(false);
  };

  if (CHECKOUT_DISABLED) {
    return (
      <div className="space-y-6">
        {summary}
        <Notice tone="amber" title="Sales launching soon">
          We&apos;re finalising payment setup. Sign in and save your trade URL — you&apos;ll be
          ready the moment we open the store.
        </Notice>
      </div>
    );
  }

  if (!buyable) {
    return (
      <div className="space-y-6">
        {summary}
        {item.status === 'coming_soon' ? (
          <Notice tone="sky" title="Awaiting restock">
            This skin is awaiting restock — we&apos;re sourcing it now. Browse the rest of the
            market for items in stock today.
          </Notice>
        ) : (
          <Notice tone="zinc" title="No longer available">
            This item is no longer in stock.
          </Notice>
        )}
      </div>
    );
  }

  if (session) {
    return (
      <div className="space-y-5">
        {summary}
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70">
          <WhopCheckoutEmbed
            planId={session.planId}
            theme="dark"
            styles={{ container: { paddingX: 0, paddingY: 16 } }}
            onComplete={(_planId, _receiptId) => {
              router.push(`/order/${session.orderId}`);
            }}
          />
        </div>
        <p className="text-center text-[11px] text-zinc-500">
          Secure payment by Whop · Card details never touch our servers.
        </p>
      </div>
    );
  }

  if (error?.kind === 'stale') {
    return (
      <div className="space-y-6">
        {summary}
        <Notice tone="amber" title="Price just updated">
          <p>
            Latest price:{' '}
            <span className="font-mono font-semibold text-amber-100">
              {formatPrice(error.lastKnownPrice, error.lastKnownCurrency)}
            </span>
            . Continue at the new price?
          </p>
          <button
            type="button"
            onClick={retryAfterStaleRefresh}
            disabled={refreshing}
            className="btn-primary mt-3 w-full py-2.5 text-sm"
          >
            {refreshing ? 'Working…' : 'Continue'}
          </button>
        </Notice>
      </div>
    );
  }
  if (error?.kind === 'trade_url_required') {
    return (
      <div className="space-y-6">
        {summary}
        <Notice tone="amber" title="Add your Steam trade URL first">
          <p>We need it to deliver the skin to your account.</p>
          <Link
            href="/account"
            className="mt-2 inline-flex text-sm font-medium text-amber-100 underline underline-offset-2 hover:text-white"
          >
            Go to account →
          </Link>
        </Notice>
      </div>
    );
  }
  if (error?.kind === 'not_authenticated') {
    return (
      <div className="space-y-6">
        {summary}
        <Notice tone="sky" title="Sign in to continue">
          <p>Sign in with Steam to complete your purchase.</p>
          <Link
            href="/account"
            className="mt-2 inline-flex text-sm font-medium text-sky-100 underline underline-offset-2 hover:text-white"
          >
            Sign in →
          </Link>
        </Notice>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-6">
        {summary}
        <Notice tone="red" title="Something went wrong">
          {error.message}
        </Notice>
      </div>
    );
  }

  // Pending state: we've started the session POST but no iframe yet. Show
  // the summary + a skeleton box so the page doesn't reflow when the iframe
  // mounts. The skeleton matches the iframe's rough aspect on desktop.
  return (
    <div className="space-y-5">
      {summary}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-950/70">
        <div className="flex h-[520px] flex-col items-center justify-center gap-3 text-zinc-500">
          <Spinner />
          <p className="text-sm">Preparing secure checkout…</p>
        </div>
      </div>
      <p className="text-center text-[11px] text-zinc-500">
        Secure payment by Whop · Card details never touch our servers.
      </p>
    </div>
  );
};

const ItemSummary = ({ item }: { item: ItemDTO }) => (
  <div className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
    {item.iconUrl ? (
      <img
        src={item.iconUrl}
        alt=""
        className="h-14 w-14 shrink-0 rounded-lg bg-zinc-950/60 object-contain p-1.5"
      />
    ) : (
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-zinc-900 font-display text-lg font-bold text-zinc-500">
        {item.displayName.slice(0, 1).toUpperCase()}
      </div>
    )}
    <div className="min-w-0 flex-1">
      <div className="truncate text-sm font-semibold text-white">{item.displayName}</div>
      <div className="mt-0.5 truncate text-xs text-zinc-500">{item.type ?? 'Rust skin'}</div>
    </div>
    <div className="text-right">
      <div className="font-display text-xl font-bold tabular-nums text-white">
        {formatPrice(item.salePriceMinor, item.currency)}
      </div>
    </div>
  </div>
);

type Tone = 'amber' | 'sky' | 'red' | 'zinc';
const TONE_CLASSES: Record<Tone, string> = {
  amber: 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200',
  sky: 'border-sky-500/20 bg-sky-500/[0.04] text-sky-200',
  red: 'border-red-500/20 bg-red-500/[0.04] text-red-300',
  zinc: 'border-white/[0.08] bg-white/[0.02] text-zinc-300',
};
const Notice = ({
  tone,
  title,
  children,
}: {
  tone: Tone;
  title: string;
  children: React.ReactNode;
}) => (
  <div className={`rounded-xl border px-4 py-3.5 text-sm ${TONE_CLASSES[tone]}`}>
    <p className="font-medium">{title}</p>
    <div className="mt-1 text-[13px] opacity-90">{children}</div>
  </div>
);

const Spinner = () => (
  <svg viewBox="0 0 24 24" className="h-6 w-6 animate-spin" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity={0.25} strokeWidth={2.5} />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" />
  </svg>
);
