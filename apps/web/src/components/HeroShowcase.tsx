// Hero product showcase. Asymmetric grid: one big featured tile + two smaller
// stacked next to it. No rotations — clean, intentional, modern.
import Link from 'next/link';
import type { ItemDTO } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { darken } from '@/lib/color';
import { rarityClasses } from '@/lib/rarity';

interface Props {
  items: ItemDTO[];
}

export const HeroShowcase = ({ items }: Props) => {
  const cards = items.slice(0, 3);
  if (cards.length === 0) {
    return (
      <div className="grid h-full place-items-center text-zinc-600">
        <span className="font-mono text-xs uppercase tracking-widest">Loading inventory…</span>
      </div>
    );
  }

  const [big, ...rest] = cards;
  const small = rest.slice(0, 2);

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-12 -z-10 rounded-full bg-brand/15 blur-[100px]" />

      <div className="grid h-[480px] grid-cols-3 gap-4">
        {big ? <ShowcaseCard item={big} size="lg" floatDelay={0} /> : null}
        <div className="col-span-1 grid grid-rows-2 gap-4">
          {small.map((item, i) => (
            <ShowcaseCard key={item.id} item={item} size="sm" floatDelay={(i + 1) * 0.7} />
          ))}
        </div>
      </div>
    </div>
  );
};

const ShowcaseCard = ({
  item,
  size,
  floatDelay,
}: {
  item: ItemDTO;
  size: 'lg' | 'sm';
  floatDelay: number;
}) => {
  const rarity = rarityClasses(item.rarity);
  const isLg = size === 'lg';
  return (
    <Link
      href={`/market/${item.id}`}
      className={`group relative flex flex-col overflow-hidden border border-white/[0.08] bg-zinc-950/40 transition-all duration-300 hover:-translate-y-1 hover:border-brand/50 hover:shadow-card-hover ${
        isLg ? 'col-span-2 row-span-2' : ''
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent ${rarity.line} to-transparent`}
      />
      <div
        className={`hud-corners scanlines relative flex-1 overflow-hidden ${isLg ? 'p-8' : 'p-3'}`}
        style={
          item.iconBackgroundColor
            ? {
                background: `radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,255,255,0.12), transparent 60%), linear-gradient(180deg, #${item.iconBackgroundColor} 0%, #${darken(item.iconBackgroundColor, 0.55)} 100%)`,
              }
            : {
                background:
                  'radial-gradient(ellipse 90% 60% at 50% 0%, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, #2a2d33 0%, #1a1c20 100%)',
              }
        }
      >
        {item.iconUrl ? (
          <img
            src={item.iconUrl}
            alt=""
            className="h-full w-full animate-floatY object-contain drop-shadow-[0_24px_50px_rgba(0,0,0,0.6)]"
            style={{ animationDelay: `${floatDelay}s` }}
          />
        ) : null}
        {item.rarity && isLg ? (
          <span
            className={`absolute right-3 top-3 border-l-2 bg-zinc-950/85 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest backdrop-blur ${rarity.text}`}
            style={{ borderLeftColor: 'currentColor' }}
          >
            {item.rarity}
          </span>
        ) : null}
      </div>

      <div
        className={`relative border-t border-white/[0.06] bg-zinc-950/85 backdrop-blur ${
          isLg ? 'p-4' : 'p-2.5'
        }`}
      >
        <div className={`truncate text-zinc-100 ${isLg ? 'text-sm font-medium' : 'text-xs'}`}>
          {item.displayName}
        </div>
        <div
          className={`mt-1 font-mono font-bold tabular-nums text-brand ${
            isLg ? 'text-xl' : 'text-sm'
          }`}
        >
          {formatPrice(item.salePriceMinor, item.currency)}
        </div>
      </div>
    </Link>
  );
};
