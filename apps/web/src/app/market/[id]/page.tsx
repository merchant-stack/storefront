import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, getItems } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';
import { ItemCard } from '@/components/ItemCard';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const unavailable = item.available === false;
  const purchasable = item.status === 'in_stock';
  const isComingSoon = item.status === 'coming_soon';
  const rarity = rarityClasses(item.rarity);

  // Related: latest same-type items, excluding this one.
  const related = item.type
    ? await getItems({ type: item.type, limit: 5 }).then((r) =>
        r.items.filter((i) => i.id !== item.id).slice(0, 4),
      )
    : [];

  return (
    <main className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] opacity-30 blur-[100px]"
        style={{ background: 'radial-gradient(ellipse at center top, rgba(255,90,31,0.12), transparent 70%)' }}
      />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          href="/market"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-200"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
          </svg>
          Back to market
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[1.15fr_1fr]">
          {/* Image plate */}
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 p-12">
            {item.iconUrl ? (
              <img
                src={item.iconUrl}
                alt={item.displayName}
                className="h-full w-full object-contain drop-shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-700">no image</div>
            )}
            {isComingSoon ? (
              <span className="absolute left-4 top-4 rounded-md border border-sky-400/40 bg-sky-500/15 px-2 py-1 text-xs font-medium uppercase tracking-wider text-sky-300 backdrop-blur">
                Coming soon
              </span>
            ) : !purchasable ? (
              <span className="absolute left-4 top-4 rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-xs font-medium uppercase tracking-wider text-amber-300 backdrop-blur">
                Restocking soon
              </span>
            ) : (
              <span className="absolute left-4 top-4 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs font-medium uppercase tracking-wider text-emerald-300 backdrop-blur">
                In stock
              </span>
            )}
          </div>

          {/* Specs panel */}
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {item.type ? <span className="chip">{item.type}</span> : null}
              {item.rarity ? (
                <span className={`chip ${rarity.text} ${rarity.border}`}>{item.rarity}</span>
              ) : null}
            </div>

            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl">
              {item.displayName}
            </h1>
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
              {item.marketHashName}
            </p>

            <div className="mt-8 rounded-xl border border-white/[0.08] bg-zinc-900/40 p-6">
              <div className="label">Price</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`font-display text-5xl font-bold tabular-nums sm:text-6xl ${
                    purchasable ? 'text-brand' : 'text-zinc-300'
                  }`}
                >
                  {formatPrice(item.salePriceMinor, item.currency)}
                </span>
                <span className="text-xs uppercase tracking-widest text-zinc-500">USD</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">All-in price. Cards + crypto accepted at checkout.</p>

              {purchasable && !unavailable ? (
                <form action={`/checkout/${item.id}`} method="get" className="mt-6">
                  <button type="submit" className="btn-primary group w-full py-3.5 text-base">
                    Buy now
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 transition-transform group-hover:translate-x-1" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                    </svg>
                  </button>
                </form>
              ) : isComingSoon ? (
                <div className="mt-6 rounded-lg border border-sky-500/30 bg-sky-500/[0.06] p-4">
                  <div className="flex items-start gap-3 text-sm text-sky-200">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <div>
                      <div className="font-semibold">Awaiting restock</div>
                      <div className="mt-1 text-sky-200/80">
                        This skin isn&apos;t in our stock yet — we&apos;re sourcing it now. Browse
                        items we already have, or check back soon.
                      </div>
                    </div>
                  </div>
                  <Link href="/market?sort=price_asc" className="btn-secondary mt-4 w-full py-2.5 text-sm">
                    Browse available skins
                  </Link>
                </div>
              ) : (
                <div className="mt-6 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4">
                  <div className="flex items-start gap-3 text-sm text-amber-200">
                    <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <div>
                      <div className="font-semibold">Temporarily out of stock</div>
                      <div className="mt-1 text-amber-200/80">
                        This item is currently unavailable for purchase. We&apos;re restocking soon —
                        check back shortly or browse cheaper alternatives.
                      </div>
                    </div>
                  </div>
                  <Link href="/market?sort=price_asc" className="btn-secondary mt-4 w-full py-2.5 text-sm">
                    Browse available skins
                  </Link>
                </div>
              )}
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <Spec label="Delivery" value="< 5 min" />
              <Spec label="Payment" value="Card · Crypto" />
              <Spec label="Refund" value="Auto" />
            </dl>

            <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm text-amber-200">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
              </svg>
              <p>
                <strong className="font-semibold">Tip:</strong> enable Steam Mobile Authenticator
                on your account to avoid the 15-day trade hold.
              </p>
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-20 border-t border-white/[0.06] pt-12">
            <h2 className="font-display text-2xl font-bold sm:text-3xl">More {item.type ?? 'skins'}</h2>
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.map((r) => (
                <ItemCard key={r.id} item={r} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

const Spec = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border border-white/[0.06] bg-zinc-900/40 p-3">
    <dt className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">{label}</dt>
    <dd className="mt-1 text-sm font-bold text-zinc-100">{value}</dd>
  </div>
);
