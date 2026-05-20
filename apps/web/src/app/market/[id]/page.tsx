import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const unavailable = item.available === false;
  const rarity = rarityClasses(item.rarity);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <Link
        href="/market"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
        </svg>
        Back to market
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1.1fr_1fr]">
        {/* Image */}
        <div className="relative">
          <div
            className={`absolute -inset-8 rounded-3xl opacity-30 blur-3xl ${rarity.glow}`}
            aria-hidden
          />
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-card p-8">
            {item.iconUrl ? (
              <img
                src={item.iconUrl}
                alt={item.displayName}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-700">
                no image
              </div>
            )}
          </div>
        </div>

        {/* Details */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {item.type ? <span className="chip">{item.type}</span> : null}
            {item.rarity ? (
              <span className={`chip ${rarity.text} ${rarity.border}`}>{item.rarity}</span>
            ) : null}
            <span className="chip">
              <svg
                viewBox="0 0 24 24"
                className="h-3 w-3 text-emerald-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
              In stock
            </span>
          </div>

          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            {item.displayName}
          </h1>
          <p className="mt-2 font-mono text-xs text-zinc-500">{item.marketHashName}</p>

          <div className="card mt-8 p-6">
            <div className="label">Price</div>
            <div className="mt-1 font-display text-4xl font-bold text-brand sm:text-5xl">
              {formatPrice(item.salePriceMinor, item.currency)}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              All-in. Includes sourcing fee. Cards + crypto accepted at checkout.
            </p>

            <form action={`/checkout/${item.id}`} method="get" className="mt-6">
              <button type="submit" disabled={unavailable} className="btn-primary w-full py-3 text-base">
                {unavailable ? 'Unavailable' : 'Buy now'}
                {!unavailable ? (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                  </svg>
                ) : null}
              </button>
            </form>
          </div>

          <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
            <div className="card p-4">
              <dt className="label">Source</dt>
              <dd className="mt-1 font-medium">{item.provider}</dd>
            </div>
            <div className="card p-4">
              <dt className="label">Delivery</dt>
              <dd className="mt-1 font-medium">Steam trade · minutes</dd>
            </div>
            <div className="card p-4">
              <dt className="label">Last refreshed</dt>
              <dd className="mt-1 font-medium">
                {new Date(item.lastSyncedAt).toLocaleString()}
              </dd>
            </div>
            <div className="card p-4">
              <dt className="label">Refund</dt>
              <dd className="mt-1 font-medium">Auto if undeliverable</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm text-amber-200">
            <strong className="font-semibold">Tip:</strong> Enable Steam Mobile Authenticator on your
            account to avoid the 15-day trade hold.
          </div>
        </div>
      </div>
    </main>
  );
}
