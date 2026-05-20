import { notFound } from 'next/navigation';
import { getItem } from '@/lib/items';
import { formatPrice } from '@/lib/format';

export default async function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const unavailable = item.available === false;

  return (
    <main className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-8 md:grid-cols-2">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        {item.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="mx-auto h-72 w-72 object-contain"
          />
        ) : (
          <div className="flex h-72 w-full items-center justify-center text-neutral-700">
            no image
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <div className="text-sm uppercase tracking-wide text-neutral-500">
            {item.type ?? 'Rust skin'}
          </div>
          <h1 className="mt-1 text-3xl font-bold">{item.displayName}</h1>
          {item.rarity ? (
            <span className="mt-2 inline-block rounded bg-neutral-800 px-2 py-0.5 text-xs uppercase tracking-wide text-neutral-300">
              {item.rarity}
            </span>
          ) : null}
        </div>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="text-sm text-neutral-500">Price</div>
          <div className="text-3xl font-bold text-brand">
            {formatPrice(item.salePriceMinor, item.currency)}
          </div>
        </div>

        <form action={`/checkout/${item.id}`} method="get">
          <button
            type="submit"
            disabled={unavailable}
            className="w-full rounded-md bg-brand px-4 py-3 text-base font-semibold text-white transition-colors hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-neutral-700"
          >
            {unavailable ? 'Unavailable' : 'Buy now'}
          </button>
        </form>

        <div className="text-xs text-neutral-500">
          Sourced from {item.provider}. Delivery via Steam trade after payment.
        </div>
      </div>
    </main>
  );
}
