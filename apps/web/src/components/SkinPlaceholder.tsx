// Visual fallback for items without a real Steam iconUrl (currently SHOWCASE
// rows — we don't have a cheap way to fetch a real Steam icon for an
// arbitrary market_hash_name without an authenticated per-item API call).
// Renders a deterministic colour gradient (hue derived from the name hash)
// plus the item's initials, so the card looks intentional rather than
// broken. Same name → same colour across renders + processes.

interface Props {
  name: string;
  /** Tailwind class override for the initials text size. Defaults to text-4xl. */
  textClassName?: string;
}

export const SkinPlaceholder = ({ name, textClassName = 'text-4xl' }: Props) => {
  const initials = getInitials(name);
  const { start, end } = colourPairForName(name);
  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-md font-display ${textClassName} font-black tracking-tight text-white/85`}
      style={{ background: `linear-gradient(135deg, ${start}, ${end})` }}
    >
      {initials}
    </div>
  );
};

function getInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const out = words
    .map((w) => w[0])
    .filter((c): c is string => Boolean(c))
    .join('')
    .toUpperCase();
  return out || '?';
}

function colourPairForName(name: string): { start: string; end: string } {
  // djb2-ish string hash → stable across renders + processes. Avoids the
  // visual jitter of randomly-coloured cards on every page reload.
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return {
    start: `hsl(${hue}, 38%, 24%)`,
    end: `hsl(${(hue + 32) % 360}, 38%, 12%)`,
  };
}
