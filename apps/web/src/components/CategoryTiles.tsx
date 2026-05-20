// Category browse-tiles row. Each tile shows a representative item icon for the
// category as background art + name + count.
import Link from 'next/link';
import type { ItemDTO } from '@/lib/items';
import { darken } from '@/lib/color';

interface CategoryTile {
  label: string;
  count: number;
  representative: ItemDTO | undefined;
}

interface Props {
  tiles: CategoryTile[];
}

export const CategoryTiles = ({ tiles }: Props) => (
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {tiles.map((t) => (
      <Link
        key={t.label}
        href={`/market?type=${encodeURIComponent(t.label)}`}
        className="group relative aspect-[4/3] overflow-hidden border border-white/[0.08] transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card-hover"
        style={
          t.representative?.iconBackgroundColor
            ? {
                background: `linear-gradient(135deg, #${t.representative.iconBackgroundColor} 0%, #${darken(t.representative.iconBackgroundColor, 0.6)} 100%)`,
              }
            : { background: 'linear-gradient(135deg, #2a2d33, #16181b)' }
        }
      >
        {/* Scanline overlay */}
        <div className="scanlines absolute inset-0 opacity-60" />

        {/* Representative item floating in the background */}
        {t.representative?.iconUrl ? (
          <img
            src={t.representative.iconUrl}
            alt=""
            className="absolute -right-6 -top-2 h-[110%] w-auto rotate-[12deg] object-contain opacity-50 drop-shadow-[0_16px_30px_rgba(0,0,0,0.5)] transition-all duration-500 group-hover:rotate-[6deg] group-hover:opacity-80"
          />
        ) : null}

        {/* Gradient sweep on hover */}
        <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-brand/15 to-transparent transition-transform duration-700 group-hover:translate-x-full" />

        {/* Content */}
        <div className="relative z-[1] flex h-full flex-col justify-between p-5">
          <div className="hud-pill self-start">
            <span className="text-brand">●</span> {t.count} {t.count === 1 ? 'unit' : 'units'}
          </div>
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-zinc-300/80">
              Category
            </div>
            <div className="mt-1 font-display text-2xl font-black tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)] sm:text-3xl">
              {t.label}
            </div>
            <div className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-white/80 transition-all group-hover:gap-2 group-hover:text-brand">
              Browse
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </Link>
    ))}
  </div>
);
