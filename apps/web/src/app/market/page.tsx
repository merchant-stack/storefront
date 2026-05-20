import { getItems } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

interface SearchParams {
  q?: string;
  sort?: 'newest' | 'price_asc' | 'price_desc';
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { items } = await getItems({
    q: params.q,
    sort: params.sort ?? 'newest',
    limit: 48,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Buy Rust skins</h1>
        <form className="flex items-center gap-2" action="/market" method="get">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ''}
            placeholder="Search skins…"
            className="w-64 rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          />
          <select
            name="sort"
            defaultValue={params.sort ?? 'newest'}
            className="rounded border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-sm"
          >
            <option value="newest">Newest</option>
            <option value="price_asc">Price ↑</option>
            <option value="price_desc">Price ↓</option>
          </select>
        </form>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-neutral-800 p-12 text-center text-neutral-500">
          Catalog is loading. The sync job pulls fresh items every few minutes.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {items.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </main>
  );
}
