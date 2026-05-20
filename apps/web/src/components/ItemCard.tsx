import Link from 'next/link';
import type { ItemDTO } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { rarityClasses } from '@/lib/rarity';

interface Props {
  item: ItemDTO;
}

export const ItemCard = ({ item }: Props) => {
  const rarity = rarityClasses(item.rarity);
  return (
    <Link
      href={`/market/${item.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-card transition-all hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-card"
    >
      {/* Rarity glow */}
      <div
        className={`pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent ${rarity.line} to-transparent`}
      />
      <div
        className={`pointer-events-none absolute -inset-x-12 -top-12 h-24 opacity-0 blur-2xl transition-opacity group-hover:opacity-60 ${rarity.glow}`}
      />

      <div className="relative aspect-square bg-zinc-950/60 p-3">
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            no image
          </div>
        )}
        {item.rarity ? (
          <span
            className={`absolute right-2 top-2 rounded-md border bg-zinc-950/80 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider backdrop-blur ${rarity.text} ${rarity.border}`}
          >
            {item.rarity}
          </span>
        ) : null}
      </div>
      <div className="relative flex flex-1 flex-col gap-1 border-t border-white/[0.04] p-3">
        <div className="line-clamp-2 text-sm font-medium text-zinc-100">{item.displayName}</div>
        {item.type ? <div className="text-xs text-zinc-500">{item.type}</div> : null}
        <div className="mt-2 flex items-end justify-between gap-2">
          <span className="font-display text-lg font-bold text-brand">
            {formatPrice(item.salePriceMinor, item.currency)}
          </span>
          <span className="text-xs text-zinc-500 transition-colors group-hover:text-zinc-300">Buy →</span>
        </div>
      </div>
    </Link>
  );
};
