import Link from 'next/link';

export default function CheckoutCancelledPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <h1 className="text-2xl font-bold">Payment cancelled</h1>
      <p className="mt-2 text-neutral-400">No charge has been made. The item is still available.</p>
      <Link
        href="/market"
        className="mt-8 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Back to market
      </Link>
    </main>
  );
}
