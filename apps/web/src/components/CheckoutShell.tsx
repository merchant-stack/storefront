import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  /** Sub-headline beneath the big "Checkout" title — context for the buyer. */
  subtitle: ReactNode;
  /** Main column (iframe + any inline error UI). */
  children: ReactNode;
}

// Minimal page chrome for /checkout/[id] and /pay/[id]. Mirrors the layout
// pattern most modern card-payment flows use (Stripe, Shopify, skinramp):
// strip all marketing nav, leave just a small brand mark + the form. Pages
// that mount this opt out of the global Header/Footer via pathname checks
// in those components.
export const CheckoutShell = ({ subtitle, children }: Props) => {
  return (
    <main className="min-h-screen bg-zinc-950">
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 sm:pt-14">
        <Link
          href="/"
          aria-label="RustSupply home"
          className="group inline-flex items-center"
        >
          <span className="font-display text-xl font-bold tracking-tight text-zinc-50">
            rust
            <span className="bg-gradient-to-r from-brand-400 via-brand to-brand-600 bg-clip-text text-transparent">
              supply
            </span>
            <span className="ml-0.5 inline-block h-1.5 w-1.5 -translate-y-2 rounded-full bg-brand shadow-glow transition-all group-hover:scale-125" />
          </span>
        </Link>

        <h1 className="mt-14 font-display text-4xl font-bold tracking-tight text-white sm:text-[44px]">
          Checkout
        </h1>
        <p className="mt-2 text-sm text-zinc-400 sm:text-base">{subtitle}</p>

        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
};
