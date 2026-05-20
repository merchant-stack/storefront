import Link from 'next/link';
import type { ItemDTO } from '@/lib/items';
import { formatPrice } from '@/lib/format';

interface Props {
  item: ItemDTO;
}

export const ItemCard = ({ item }: Props) => {
  return (
    <Link
      href={`/market/${item.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition-colors hover:border-neutral-600"
    >
      <div className="relative aspect-square bg-neutral-950">
        {item.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="h-full w-full object-contain p-4"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-700">
            no image
          </div>
        )}
        {item.rarity ? (
          <span className="absolute right-2 top-2 rounded bg-neutral-950/80 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-300">
            {item.rarity}
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium text-neutral-100">
          {item.displayName}
        </div>
        <div className="text-xs text-neutral-500">{item.type ?? ''}</div>
        <div className="mt-2 text-base font-semibold text-brand">
          {formatPrice(item.salePriceMinor, item.currency)}
        </div>
      </div>
    </Link>
  );
};
