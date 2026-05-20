import { getItems } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

interface SearchParams {
  q?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
  type?: string;
  rarity?: string;
}

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const TYPES = ['Weapon', 'Clothing', 'Armor', 'Door', 'Face Mask', 'Bandana'];

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { items } = await getItems({
    q: params.q,
    sort: params.sort ?? 'newest',
    type: params.type,
    rarity: params.rarity,
    limit: 60,
  });

  const activeRarity = params.rarity?.toLowerCase();
  const activeType = params.type?.toLowerCase();

  const filterLink = (key: 'rarity' | 'type', value: string | null) => {
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
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Buy Rust skins</h1>
        <p className="mt-2 text-sm text-zinc-400">
          {items.length} item{items.length === 1 ? '' : 's'} live · synced every 5 min from DMarket
        </p>
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
          <div className="space-y-2">
            <h3 className="label">Sort</h3>
            <div className="space-y-1">
              {[
                { v: 'newest', l: 'Newest' },
                { v: 'price_asc', l: 'Price — low to high' },
                { v: 'price_desc', l: 'Price — high to low' },
              ].map((opt) => {
                const next = new URLSearchParams();
                if (params.q) next.set('q', params.q);
                if (params.type) next.set('type', params.type);
                if (params.rarity) next.set('rarity', params.rarity);
                next.set('sort', opt.v);
                const active = (params.sort ?? 'newest') === opt.v;
                return (
                  <a
                    key={opt.v}
                    href={`/market?${next.toString()}`}
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-brand/15 text-brand'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {opt.l}
                    {active ? <span className="h-1.5 w-1.5 rounded-full bg-brand" /> : null}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Rarity */}
          <div className="space-y-2">
            <h3 className="label">Rarity</h3>
            <div className="space-y-1">
              <a
                href={filterLink('rarity', null)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  !activeRarity
                    ? 'bg-white/[0.06] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                Any
              </a>
              {RARITIES.map((r) => {
                const active = activeRarity === r.toLowerCase();
                return (
                  <a
                    key={r}
                    href={filterLink('rarity', r)}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-white/[0.06] text-white'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {r}
                  </a>
                );
              })}
            </div>
          </div>

          {/* Type */}
          <div className="space-y-2">
            <h3 className="label">Type</h3>
            <div className="space-y-1">
              <a
                href={filterLink('type', null)}
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  !activeType
                    ? 'bg-white/[0.06] text-white'
                    : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                Any
              </a>
              {TYPES.map((t) => {
                const active = activeType === t.toLowerCase();
                return (
                  <a
                    key={t}
                    href={filterLink('type', t)}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-white/[0.06] text-white'
                        : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                    }`}
                  >
                    {t}
                  </a>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Grid */}
        <div>
          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-16 text-center">
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
              <a href="/market" className="mt-4 inline-flex text-sm text-brand hover:underline">
                Clear filters
              </a>
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
