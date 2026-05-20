import Link from 'next/link';
import { getFacets, getItems } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';
import { CategoryTiles } from '@/components/CategoryTiles';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';

export default async function HomePage() {
  // Landing surfaces only show purchasable items — anything beyond our
  // fulfilment ceiling would just confuse a buyer landing here cold.
  const [{ items: featured }, { items: hero }, facets] = await Promise.all([
    getItems({ sort: 'newest', limit: 12, purchasableOnly: true }),
    getItems({ sort: 'price_desc', limit: 1, purchasableOnly: true }),
    getFacets(),
  ]);

  const heroItem = hero[0];

  const topCategories = facets.types.slice(0, 4);
  const categoryReps = await Promise.all(
    topCategories.map(async (t) => {
      const r = await getItems({ type: t.value, limit: 1, purchasableOnly: true });
      return { label: t.value, count: t.count, representative: r.items[0] };
    }),
  );
  // Drop categories that have no purchasable items so we don't render empty tiles.
  const visibleCategories = categoryReps.filter((c) => c.representative);

  return (
    <main className="relative">
      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="pointer-events-none absolute left-1/3 top-0 h-[600px] w-[900px] rounded-full bg-brand/10 blur-[140px]" />

        <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
          <div>
            <div className="inline-flex">
              <span className="hud-pill text-zinc-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                {featured.length}+ skins · live
              </span>
            </div>

            <h1 className="mt-7 font-display text-[clamp(2.75rem,7vw,5.5rem)] font-black leading-[0.95] tracking-tight">
              <span className="text-zinc-50">Buy Rust skins.</span>
              <br />
              <span className="bg-gradient-to-r from-brand-400 via-brand to-brand-700 bg-clip-text text-transparent">
                Receive in minutes.
              </span>
            </h1>

            <p className="mt-6 max-w-md text-base text-zinc-400">
              Pay with card or crypto. Your skin lands in your Steam inventory in minutes.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link href="/market" className="btn-primary group px-7 py-3.5 text-base">
                Browse market
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/market?sort=price_asc"
                className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
              >
                Or shop by lowest price →
              </Link>
            </div>

            {/* Inline stats — sit within the text column, not full-bleed */}
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
              {(
                [
                  { v: `${featured.length}+`, l: 'In stock' },
                  { v: '< 5 min', l: 'Delivery' },
                  { v: '24/7', l: 'Online' },
                ] as const
              ).map((s) => (
                <div key={s.l}>
                  <dt className="font-display text-2xl font-bold tabular-nums text-zinc-50">
                    {s.v}
                  </dt>
                  <dd className="mt-0.5 text-xs text-zinc-500">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {heroItem ? <HeroProduct item={heroItem} /> : null}
        </div>
      </section>

      {/* ===================== CATEGORIES ===================== */}
      {visibleCategories.length > 0 ? (
        <section className="mx-auto max-w-7xl px-6 pb-16 sm:pb-20">
          <div className="mb-6">
            <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Shop by category
            </h2>
          </div>
          <CategoryTiles tiles={visibleCategories} />
        </section>
      ) : null}

      {/* ===================== INVENTORY ===================== */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Latest drops
          </h2>
          <Link
            href="/market"
            className="hidden text-sm text-zinc-400 hover:text-brand sm:inline-flex sm:items-center sm:gap-1.5"
          >
            All inventory →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {featured.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
        <div className="mt-10 flex justify-center sm:hidden">
          <Link href="/market" className="btn-secondary px-8 py-3 text-sm">
            All inventory
          </Link>
        </div>
      </section>
    </main>
  );
}

const HeroProduct = ({
  item,
}: {
  item: {
    id: string;
    iconUrl: string | null;
    iconBackgroundColor: string | null;
    displayName: string;
    type: string | null;
    rarity: string | null;
    salePriceMinor: number;
    currency: string;
  };
}) => {
  const rarity = rarityClasses(item.rarity);
  return (
    <Link
      href={`/market/${item.id}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/[0.08] bg-zinc-900/40 transition-all duration-300 hover:-translate-y-1 hover:border-brand/40"
    >
      <div className="relative aspect-[5/4] overflow-hidden bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 p-12">
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="h-full w-full object-contain drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : null}
        {item.rarity ? (
          <span
            className={`absolute right-4 top-4 rounded-md border bg-zinc-950/85 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur ${rarity.text} ${rarity.border}`}
          >
            {item.rarity}
          </span>
        ) : null}
        <span className="hud-pill absolute left-4 top-4">Featured</span>
      </div>
      <div className="flex items-end justify-between border-t border-white/[0.06] p-5">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-bold text-zinc-50">
            {item.displayName}
          </div>
          {item.type ? <div className="mt-0.5 text-xs text-zinc-500">{item.type}</div> : null}
        </div>
        <div className="text-right">
          <div className="font-display text-2xl font-bold tabular-nums text-brand sm:text-3xl">
            {formatPrice(item.salePriceMinor, item.currency)}
          </div>
        </div>
      </div>
    </Link>
  );
};
