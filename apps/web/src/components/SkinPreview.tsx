'use client';

// Collapsible "item you're buying" card for the merchant deposit /pay page.
//
// Shows a real Rust skin (the cover SKU picked server-side) framed as the
// thing being purchased, priced at the DEPOSIT amount — not the skin's own
// market price — so the figure matches what the buyer pays. The buyer can
// collapse it (per product requirement) if they just want the payment form.
//
// iconUrl may be null (Steam lookup failed at session create); we fall back
// to the generated SkinPlaceholder so the card always looks intentional.

import { useState } from 'react';
import { SkinPlaceholder } from './SkinPlaceholder';

interface Props {
  name: string;
  iconUrl: string | null;
  /** Pre-formatted price string equal to the payment amount, e.g. "$50.00". */
  priceLabel: string;
}

export const SkinPreview = ({ name, iconUrl, priceLabel }: Props) => {
  const [open, setOpen] = useState(true);

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-zinc-50"
      >
        <span className="text-sm font-medium text-zinc-700">Your item</span>
        <span className="flex items-center gap-1.5 text-xs text-zinc-400">
          {open ? 'Hide' : 'Show'}
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>

      {open ? (
        <div className="flex items-center gap-4 border-t border-zinc-100 px-5 py-4">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-zinc-50">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt={name}
                className="h-full w-full object-contain p-1.5"
              />
            ) : (
              <SkinPlaceholder name={name} textClassName="text-2xl" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-zinc-900">{name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Rust skin</div>
          </div>
          <div className="font-display text-xl font-bold tabular-nums text-zinc-950">
            {priceLabel}
          </div>
        </div>
      ) : null}
    </div>
  );
};
