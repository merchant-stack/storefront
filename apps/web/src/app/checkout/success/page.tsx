import { OrderStatusTracker } from '@/components/OrderStatusTracker';

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
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <h1 className="mt-5 font-display text-3xl font-bold">Payment received</h1>
        <p className="mt-2 text-zinc-400">
          We&apos;re preparing your delivery and sending the Steam trade offer.
        </p>
      </div>

      {orderId ? (
        <OrderStatusTracker orderId={orderId} />
      ) : (
        <div className="card mt-8 p-6 text-center text-sm text-zinc-400">
          No order reference in URL. Check your{' '}
          <a href="/account#orders" className="text-brand hover:underline">
            order history
          </a>{' '}
          for status.
        </div>
      )}
    </main>
  );
}
