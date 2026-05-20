import Link from 'next/link';

export default function CheckoutCancelledPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-zinc-800 text-zinc-400">
        <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </div>
      <h1 className="mt-5 font-display text-3xl font-bold">Payment cancelled</h1>
      <p className="mt-2 text-zinc-400">
        No charge has been made. The item is still available — feel free to try again.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/market" className="btn-primary">
          Back to market
        </Link>
        <Link href="/account#orders" className="btn-secondary">
          See my orders
        </Link>
      </div>
    </main>
  );
}
