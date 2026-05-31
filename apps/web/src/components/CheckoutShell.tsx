import Link from 'next/link';
import type { ReactNode } from 'react';

interface Props {
  /** Sub-headline beneath the big "Checkout" title — context for the buyer. */
  subtitle?: ReactNode;
  /** Main column (iframe + any inline error UI). */
  children: ReactNode;
  /**
   * When true (default), show the rustsupply brand mark at the top. Pages
   * that exist to embed someone else's payment flow (e.g. merchant deposit
   * gateway at /pay/[id]) pass false: the buyer shouldn't see who's
   * processing the payment behind the scenes, just a clean form.
   */
  showBrand?: boolean;
}

// Minimal page chrome for /checkout/[id] and /pay/[id]. Light-themed by
// intent: industry-standard payment flows (Stripe Checkout, Shopify, Apple
// Pay) are light regardless of the source site's theme — buyers read it as
// "focused secure step." Also dodges a Whop dark-theme bug where the
// country dropdown popup renders gray-on-white inside their iframe. Global
// Header/Footer are suppressed on these routes via pathname checks.
export const CheckoutShell = ({ subtitle, children, showBrand = true }: Props) => {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <div className="mx-auto max-w-2xl px-6 pb-24 pt-10 sm:pt-14">
        {showBrand ? (
          <Link
            href="/"
            aria-label="RustSupply home"
            className="group inline-flex items-center"
          >
            <span className="font-display text-xl font-bold tracking-tight text-zinc-900">
              rust
              <span className="bg-gradient-to-r from-brand-400 via-brand to-brand-600 bg-clip-text text-transparent">
                supply
              </span>
              <span className="ml-0.5 inline-block h-1.5 w-1.5 -translate-y-2 rounded-full bg-brand shadow-glow transition-all group-hover:scale-125" />
            </span>
          </Link>
        ) : null}

        <h1
          className={`font-display text-4xl font-bold tracking-tight text-zinc-950 sm:text-[44px] ${
            showBrand ? 'mt-14' : 'mt-4 sm:mt-8'
          }`}
        >
          Checkout
        </h1>
        {subtitle ? <p className="mt-2 text-sm text-zinc-500 sm:text-base">{subtitle}</p> : null}

        <div className="mt-8">{children}</div>

        <div className="mt-10 flex items-center justify-center gap-2 text-xs text-zinc-400">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 12.75v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Secured by Whop · 256-bit TLS · PCI-DSS Level 1
        </div>
      </div>
    </main>
  );
};
