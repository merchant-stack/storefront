import Link from 'next/link';
import { getFacets, getItems } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

interface SearchParams {
  q?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  type?: string;
  rarity?: string;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const [{ items }, facets] = await Promise.all([
    getItems({
      q: params.q,
      sort: params.sort ?? 'newest',
      type: params.type,
      rarity: params.rarity,
      limit: 60,
      purchasableOnly: true,
    }),
    getFacets(),
  ]);

  const activeRarity = params.rarity?.toLowerCase();
  const activeType = params.type?.toLowerCase();
  const hasFilters = Boolean(params.q || params.type || params.rarity);

  const linkWith = (key: 'rarity' | 'type', value: string | null) => {
    const next = new URLSearchParams();
    if (params.q) next.set('q', params.q);
    if (params.sort) next.set('sort', params.sort);
    if (params.type && key !== 'type') next.set('type', params.type);
    if (params.rarity && key !== 'rarity') next.set('rarity', params.rarity);
    if (value) next.set(key, value);
    const qs = next.toString();
    return `/market${qs ? `?${qs}` : ''}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-widest text-brand">
            // Market
          </span>
          <h1 className="mt-2 font-display text-4xl font-black tracking-tight sm:text-5xl">
            Buy Rust skins
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-widest text-zinc-500">
            {items.length} unit{items.length === 1 ? '' : 's'} matching · live inventory
          </p>
        </div>
        {hasFilters ? (
          <Link href="/market" className="btn-ghost font-mono text-[11px] uppercase tracking-widest text-zinc-400">
            Clear filters
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </Link>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Sidebar */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          {/* Search */}
          <form action="/market" method="get" className="space-y-2">
            <label className="label" htmlFor="q">
              Search
            </label>
            <div className="relative">
              <input
                id="q"
                type="text"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Skin name…"
                className="input pl-9"
              />
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.34-4.34M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                />
              </svg>
            </div>
            {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
            {params.type ? <input type="hidden" name="type" value={params.type} /> : null}
            {params.rarity ? <input type="hidden" name="rarity" value={params.rarity} /> : null}
          </form>

          {/* Sort */}
          <FilterGroup title="Sort">
            {(
              [
                { v: 'newest', l: 'Newest' },
                { v: 'price_asc', l: 'Price ↑' },
                { v: 'price_desc', l: 'Price ↓' },
              ] as const
            ).map((opt) => {
              const next = new URLSearchParams();
              if (params.q) next.set('q', params.q);
              if (params.type) next.set('type', params.type);
              if (params.rarity) next.set('rarity', params.rarity);
              next.set('sort', opt.v);
              return (
                <FilterRow
                  key={opt.v}
                  href={`/market?${next.toString()}`}
                  active={(params.sort ?? 'newest') === opt.v}
                  label={opt.l}
                  variant="sort"
                />
              );
            })}
          </FilterGroup>

          {/* Type — dynamic from DB */}
          {facets.types.length > 0 ? (
            <FilterGroup title="Type">
              <FilterRow
                href={linkWith('type', null)}
                active={!activeType}
                label="All types"
              />
              {facets.types.map((t) => (
                <FilterRow
                  key={t.value}
                  href={linkWith('type', t.value)}
                  active={activeType === t.value.toLowerCase()}
                  label={t.value}
                  count={t.count}
                />
              ))}
            </FilterGroup>
          ) : null}

          {/* Rarity — dynamic from DB. Hidden if catalog has no rarity data. */}
          {facets.rarities.length > 0 ? (
            <FilterGroup title="Rarity">
              <FilterRow
                href={linkWith('rarity', null)}
                active={!activeRarity}
                label="Any rarity"
              />
              {facets.rarities.map((r) => (
                <FilterRow
                  key={r.value}
                  href={linkWith('rarity', r.value)}
                  active={activeRarity === r.value.toLowerCase()}
                  label={r.value}
                  count={r.count}
                />
              ))}
            </FilterGroup>
          ) : null}
        </aside>

        {/* Grid */}
        <div>
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/[0.04] text-zinc-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.25M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <p className="mt-4 text-zinc-400">No skins match your filters.</p>
              <Link href="/market" className="btn-secondary mt-5 inline-flex text-sm">
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <ItemCard key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

const FilterGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div>
    <h3 className="label mb-2">{title}</h3>
    <div className="space-y-0.5">{children}</div>
  </div>
);

const FilterRow = ({
  href,
  active,
  label,
  count,
  variant = 'default',
}: {
  href: string;
  active: boolean;
  label: string;
  count?: number;
  variant?: 'default' | 'sort';
}) => (
  <Link
    href={href}
    className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
      active
        ? variant === 'sort'
          ? 'bg-brand/15 text-brand'
          : 'bg-white/[0.07] text-white'
        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
    }`}
  >
    <span className="truncate">{label}</span>
    {typeof count === 'number' ? (
      <span
        className={`ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
          active ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-zinc-500 group-hover:text-zinc-400'
        }`}
      >
        {count}
      </span>
    ) : active && variant === 'sort' ? (
      <span className="h-1.5 w-1.5 rounded-full bg-brand" />
    ) : null}
  </Link>
);
