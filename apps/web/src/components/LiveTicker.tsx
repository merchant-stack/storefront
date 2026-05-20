// Horizontal marquee strip of latest items below the hero. Pure CSS infinite
// scroll — duplicates the children once so the loop has no visible jump.
import type { ItemDTO } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { darken } from '@/lib/color';

interface Props {
  items: ItemDTO[];
}

export const LiveTicker = ({ items }: Props) => {
  if (items.length === 0) return null;
  const doubled = [...items, ...items];
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-zinc-950/40">
      {/* Edge fade masks */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-zinc-950 to-transparent" />

      <div className="flex w-max animate-tickerScroll gap-4 py-5">
        {doubled.map((it, i) => (
          <a
            key={`${it.id}-${i}`}
            href={`/market/${it.id}`}
            className="group flex w-72 shrink-0 items-center gap-3 border border-white/[0.06] bg-zinc-950/40 p-3 transition-colors hover:border-brand/40"
          >
            <div
              className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden p-1"
              style={
                it.iconBackgroundColor
                  ? {
                      background: `linear-gradient(180deg, #${it.iconBackgroundColor}, #${darken(it.iconBackgroundColor, 0.5)})`,
                    }
                  : { background: 'linear-gradient(180deg, #2a2d33, #1a1c20)' }
              }
            >
              {it.iconUrl ? (
                <img src={it.iconUrl} alt="" className="h-full w-full object-contain" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-zinc-100">{it.displayName}</div>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="font-mono text-sm font-bold tabular-nums text-brand">
                  {formatPrice(it.salePriceMinor, it.currency)}
                </span>
                {it.type ? (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                    {it.type}
                  </span>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
