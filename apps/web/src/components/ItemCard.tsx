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
      className="group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-gradient-card transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.16] hover:shadow-card"
    >
      {/* Rarity glow at top edge */}
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${rarity.line} to-transparent`}
      />
      {/* Soft top-corner glow on hover */}
      <div
        className={`pointer-events-none absolute -inset-x-12 -top-12 h-32 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-70 ${rarity.glow}`}
      />
      {/* Diagonal sweep on hover */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-tr from-transparent via-white/[0.06] to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />

      <div className="relative aspect-square overflow-hidden bg-zinc-950/60 p-4">
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt={item.displayName}
            className="h-full w-full object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.5)] transition-transform duration-500 ease-out group-hover:scale-110 group-hover:rotate-1"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-700">
            no image
          </div>
        )}
        {item.rarity ? (
          <span
            className={`absolute right-2.5 top-2.5 rounded-md border bg-zinc-950/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider backdrop-blur ${rarity.text} ${rarity.border}`}
          >
            {item.rarity}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-1 flex-col gap-1 border-t border-white/[0.04] bg-zinc-950/30 p-3.5">
        <div className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-zinc-100 transition-colors group-hover:text-white">
          {item.displayName}
        </div>
        {item.type ? (
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">{item.type}</div>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="font-display text-lg font-bold tabular-nums text-brand transition-all group-hover:scale-105 group-hover:text-brand-300">
            {formatPrice(item.salePriceMinor, item.currency)}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 -translate-x-1">
            Buy
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
};
