// Rarity → Tailwind class bundles. Centralised so item cards, detail pages,
// and filters all use the same colour mapping.

export type RarityKey = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'default';

const MAP: Record<RarityKey, { text: string; border: string; bg: string; glow: string; line: string }> = {
  common: {
    text: 'text-zinc-300',
    border: 'border-zinc-500/30',
    bg: 'bg-zinc-500/10',
    glow: 'bg-zinc-500/20',
    line: 'via-zinc-400/40',
  },
  uncommon: {
    text: 'text-emerald-300',
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/10',
    glow: 'bg-emerald-500/25',
    line: 'via-emerald-400/50',
  },
  rare: {
    text: 'text-sky-300',
    border: 'border-sky-500/30',
    bg: 'bg-sky-500/10',
    glow: 'bg-sky-500/25',
    line: 'via-sky-400/50',
  },
  epic: {
    text: 'text-fuchsia-300',
    border: 'border-fuchsia-500/30',
    bg: 'bg-fuchsia-500/10',
    glow: 'bg-fuchsia-500/25',
    line: 'via-fuchsia-400/50',
  },
  legendary: {
    text: 'text-amber-300',
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/10',
    glow: 'bg-amber-500/30',
    line: 'via-amber-400/50',
  },
  default: {
    text: 'text-zinc-400',
    border: 'border-white/10',
    bg: 'bg-white/[0.04]',
    glow: 'bg-brand/15',
    line: 'via-white/20',
  },
};

export function rarityKey(rarity: string | null | undefined): RarityKey {
  if (!rarity) return 'default';
  const k = rarity.toLowerCase() as RarityKey;
  return k in MAP ? k : 'default';
}

export function rarityClasses(rarity: string | null | undefined) {
  return MAP[rarityKey(rarity)];
}
