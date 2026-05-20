import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem, getItems } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';
import { darken } from '@/lib/color';
import { ItemCard } from '@/components/ItemCard';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const unavailable = item.available === false;
  const rarity = rarityClasses(item.rarity);

  // Related: latest same-type items, excluding this one.
  const related = item.type
    ? await getItems({ type: item.type, limit: 5 }).then((r) =>
        r.items.filter((i) => i.id !== item.id).slice(0, 4),
      )
    : [];

  return (
    <main className="relative">
      {/* Atmospheric backdrop from item palette */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[600px] opacity-40 blur-[100px]"
        style={
          item.iconBackgroundColor
            ? {
                background: `radial-gradient(ellipse at center top, #${item.iconBackgroundColor}, transparent 70%)`,
              }
            : { background: 'radial-gradient(ellipse at center top, rgba(255,90,31,0.15), transparent 70%)' }
        }
      />

      <div className="mx-auto max-w-7xl px-6 py-8">
        <Link
          href="/market"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:text-brand"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
          </svg>
          Back to market
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          {/* Image plate */}
          <div
            className="hud-corners scanlines relative aspect-square overflow-hidden border border-white/[0.08] p-12"
            style={
              item.iconBackgroundColor
                ? {
                    background: `radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.14), transparent 65%), linear-gradient(180deg, #${item.iconBackgroundColor} 0%, #${darken(item.iconBackgroundColor, 0.55)} 100%)`,
                  }
                : undefined
            }
          >
            {item.iconUrl ? (
              <img
                src={item.iconUrl}
                alt={item.displayName}
                className="h-full w-full animate-floatY object-contain drop-shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-zinc-700">no image</div>
            )}
            <div className="hud-pill absolute bottom-4 left-4">
              <span className="text-emerald-400">●</span> AVAILABLE
            </div>
          </div>

          {/* Specs panel */}
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2">
              {item.type ? <span className="hud-pill">{item.type}</span> : null}
              {item.rarity ? (
                <span className={`hud-pill ${rarity.text}`} style={{ borderColor: 'currentColor' }}>
                  {item.rarity}
                </span>
              ) : null}
              <span className="hud-pill text-emerald-400">IN STOCK</span>
            </div>

            <h1 className="mt-5 font-display text-4xl font-black leading-[1.05] tracking-tight text-balance sm:text-5xl">
              {item.displayName}
            </h1>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
              {item.marketHashName}
            </p>

            <div className="relative mt-8 border border-white/[0.08] bg-zinc-950/40 p-6">
              <div className="hud-pill">PRICE</div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-mono text-5xl font-black tabular-nums text-brand drop-shadow-[0_0_24px_rgba(255,90,31,0.4)] sm:text-6xl">
                  {formatPrice(item.salePriceMinor, item.currency)}
                </span>
                <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">USD</span>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                All-in price. Cards + crypto accepted at checkout.
              </p>

              <form action={`/checkout/${item.id}`} method="get" className="mt-6">
                <button
                  type="submit"
                  disabled={unavailable}
                  className="btn-primary group w-full py-4 text-base"
                >
                  <span className="font-mono text-[12px] font-bold uppercase tracking-widest">
                    {unavailable ? 'Unavailable' : 'Buy now'}
                  </span>
                  {!unavailable ? (
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 transition-transform group-hover:translate-x-1" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                    </svg>
                  ) : null}
                </button>
              </form>
            </div>

            <dl className="mt-5 grid grid-cols-3 gap-3 text-sm">
              <Spec label="Delivery" value="< 5 min" />
              <Spec label="Payment" value="Card · Crypto" />
              <Spec label="Refund" value="Auto" />
            </dl>

            <div className="mt-5 flex items-start gap-3 border border-amber-500/20 bg-amber-500/[0.05] p-4 text-sm text-amber-200">
              <svg viewBox="0 0 24 24" className="mt-0.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                />
              </svg>
              <p>
                <strong className="font-semibold">Tip:</strong> enable Steam Mobile Authenticator
                on your account to avoid the 15-day trade hold.
              </p>
            </div>
          </div>
        </div>

        {related.length > 0 ? (
          <section className="mt-20">
            <div className="divider-hud" />
            <div className="mt-10 flex items-end justify-between">
              <div>
                <span className="font-mono text-[11px] uppercase tracking-widest text-brand">
                  Related
                </span>
                <h2 className="mt-2 font-display text-2xl font-bold sm:text-3xl">
                  More {item.type ?? 'skins'}
                </h2>
              </div>
            </div>
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
  <div className="border border-white/[0.06] bg-zinc-950/40 p-3">
    <dt className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{label}</dt>
    <dd className="mt-1 font-mono text-sm font-bold text-zinc-100">{value}</dd>
  </div>
);
