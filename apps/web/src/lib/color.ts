// Tiny colour helpers for the item display plates.

/**
 * Darken a 6-char hex (no '#') by `amount` 0..1. Used to produce the bottom
 * stop of the item plate gradient from DMarket's nameColor / backgroundColor.
 */
export function darken(hex: string, amount = 0.45): string {
  const sanitized = hex.replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(sanitized)) return sanitized;
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  const f = (c: number): string =>
    Math.max(0, Math.round(c * (1 - amount)))
      .toString(16)
      .padStart(2, '0');
  return `${f(r)}${f(g)}${f(b)}`;
}
