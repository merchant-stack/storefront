import Link from 'next/link';
import type { ItemDTO } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';

interface Props {
  item: ItemDTO;
}

export const ItemCard = ({ item }: Props) => {
  const rarity = rarityClasses(item.rarity);
  const purchasable = item.purchasable !== false;
  return (
    <Link
      href={`/market/${item.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-zinc-900/40 transition-all duration-300 ${
        purchasable ? 'hover:-translate-y-0.5 hover:border-brand/40 hover:bg-zinc-900/60' : 'hover:border-white/15'
      }`}
    >
      {/* Image plate */}
      <div
        className={`relative aspect-square overflow-hidden bg-gradient-to-br from-zinc-800/60 to-zinc-900/60 p-5 ${
          purchasable ? '' : 'opacity-70'
        }`}
      >
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.4)] transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">no image</div>
        )}
        {item.rarity ? (
          <span
            className={`absolute right-3 top-3 rounded-md border bg-zinc-950/85 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur ${rarity.text} ${rarity.border}`}
          >
            {item.rarity}
          </span>
        ) : null}
        {!purchasable ? (
          <span className="absolute left-3 top-3 rounded-md border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300 backdrop-blur">
            Restocking
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-zinc-100">
          {item.displayName}
        </div>
        {item.type ? <div className="text-xs text-zinc-500">{item.type}</div> : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className={`font-display text-lg font-bold tabular-nums ${
              purchasable ? 'text-brand' : 'text-zinc-400'
            }`}
          >
            {formatPrice(item.salePriceMinor, item.currency)}
          </span>
          <span
            className={`text-xs ${
              purchasable
                ? 'text-zinc-500 transition-colors group-hover:text-brand'
                : 'text-amber-300/70'
            }`}
          >
            {purchasable ? 'Buy →' : 'Soon'}
          </span>
        </div>
      </div>
    </Link>
  );
};
