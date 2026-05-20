import Link from 'next/link';
import { LEGAL_ENTITY_ONE_LINE, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

export const Footer = () => {
  return (
    <footer className="mt-24 border-t border-white/[0.06] bg-zinc-950/50">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              RustSkin<span className="text-brand">Pay</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-zinc-400">
              Buy Rust skins with instant Steam delivery. Pay once, we handle the rest.
            </p>
          </div>

          <nav>
            <h3 className="label">Shop</h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-400">
              <li>
                <Link href="/market" className="hover:text-white">
                  All skins
                </Link>
              </li>
              <li>
                <Link href="/market?sort=newest" className="hover:text-white">
                  New arrivals
                </Link>
              </li>
              <li>
                <Link href="/market?sort=price_asc" className="hover:text-white">
                  Cheapest first
                </Link>
              </li>
            </ul>
          </nav>

          <nav>
            <h3 className="label">Account</h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-400">
              <li>
                <Link href="/account" className="hover:text-white">
                  My account
                </Link>
              </li>
              <li>
                <Link href="/account#orders" className="hover:text-white">
                  Order history
                </Link>
              </li>
            </ul>
          </nav>

          <nav>
            <h3 className="label">Legal</h3>
            <ul className="mt-4 space-y-2 text-sm text-zinc-400">
              <li>
                <Link href="/privacy" className="hover:text-white">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-white">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/refunds" className="hover:text-white">
                  Refund policy
                </Link>
              </li>
              <li>
                <a href={SUPPORT_MAILTO} className="hover:text-white">
                  {SUPPORT_EMAIL}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-12 border-t border-white/[0.06] pt-8 text-xs text-zinc-500">
          <p>© {new Date().getFullYear()} RustSkinPay. All rights reserved.</p>
          <p className="mt-1.5 text-zinc-600">{LEGAL_ENTITY_ONE_LINE}</p>
        </div>
      </div>
    </footer>
  );
};
