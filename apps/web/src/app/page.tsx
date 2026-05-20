import Link from 'next/link';
import { getItems } from '@/lib/items';
import { ItemCard } from '@/components/ItemCard';

export default async function HomePage() {
  const { items } = await getItems({ sort: 'newest', limit: 8 });

  return (
    <main className="mx-auto max-w-7xl px-6">
      {/* Hero */}
      <section className="relative pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="absolute left-1/2 top-0 -z-10 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-brand/10 blur-[120px]" />
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-1.5 text-xs font-medium text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live inventory · instant delivery
          </div>
          <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight text-balance sm:text-6xl lg:text-7xl">
            Rust skins, delivered to Steam{' '}
            <span className="bg-gradient-to-r from-brand-300 via-brand-500 to-brand-700 bg-clip-text text-transparent">
              instantly
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400 text-balance">
            Pay once with card or crypto. Your skin lands in your Steam inventory in minutes.
            No listing. No escrow. No waiting.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/market" className="btn-primary px-6 py-3 text-base">
              Browse skins
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
              </svg>
            </Link>
            <Link href="#how-it-works" className="btn-secondary px-6 py-3 text-base">
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* Featured */}
      {items.length > 0 ? (
        <section className="py-12">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl">Latest arrivals</h2>
              <p className="mt-1 text-sm text-zinc-400">Latest skins added to our catalog.</p>
            </div>
            <Link
              href="/market"
              className="hidden text-sm font-medium text-zinc-400 hover:text-white sm:inline-flex sm:items-center sm:gap-1"
            >
              See all
              <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.slice(0, 8).map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 py-16">
        <div className="text-center">
          <h2 className="font-display text-3xl font-bold sm:text-4xl">How it works</h2>
          <p className="mt-2 text-zinc-400">Three steps, end to end.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {[
            {
              n: '01',
              t: 'Pick a skin',
              d: 'Browse our live catalog of Rust skins. Prices are locked at checkout — no surprises.',
            },
            {
              n: '02',
              t: 'Pay securely',
              d: 'Card or crypto via Stripe. Our checkout has zero PCI surface; we never see your card.',
            },
            {
              n: '03',
              t: 'Get it on Steam',
              d: 'Our bot delivers the skin to your Steam account via trade offer in minutes.',
            },
          ].map((step) => (
            <div key={step.n} className="card card-hover p-6">
              <div className="font-mono text-xs text-brand">{step.n}</div>
              <h3 className="mt-3 font-display text-xl font-bold">{step.t}</h3>
              <p className="mt-2 text-sm text-zinc-400">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Trust */}
      <section className="py-16">
        <div className="card overflow-hidden p-8 sm:p-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <h2 className="font-display text-2xl font-bold sm:text-3xl text-balance">
                Built for serious traders
              </h2>
              <p className="mt-3 text-zinc-400">
                We don't hold your money in escrow. We don't sit on listings. We're a payment
                layer — you pay us, we go buy, we ship. The fastest path between &quot;I want
                this skin&quot; and &quot;it's in my inventory&quot;.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                'Stripe-secured payments — your card is never on our servers',
                'Steam Mobile Authenticator avoids the 15-day trade hold',
                'Auto-refund if we can\'t deliver — no manual ticket needed',
                'Idempotency keys protect against accidental double-charge',
              ].map((line) => (
                <li key={line} className="flex items-start gap-3">
                  <div className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
                    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-zinc-300">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
