import Link from 'next/link';

interface SearchParams {
  orderId?: string;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { orderId } = await searchParams;
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 text-5xl">✓</div>
      <h1 className="text-2xl font-bold">Payment received</h1>
      <p className="mt-2 text-neutral-400">
        We&apos;re dispatching your skin via Steam trade offer. Check your Steam notifications in a
        minute or two.
      </p>
      {orderId ? (
        <div className="mt-6 rounded-md bg-neutral-900 px-4 py-2 font-mono text-xs text-neutral-500">
          Order {orderId}
        </div>
      ) : null}
      <Link
        href="/market"
        className="mt-8 rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
      >
        Continue shopping
      </Link>
    </main>
  );
}
