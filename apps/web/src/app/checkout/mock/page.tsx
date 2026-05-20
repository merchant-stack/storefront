import { MockPayPanel } from '@/components/MockPayPanel';

interface SearchParams {
  orderId?: string;
}

export default async function CheckoutMockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { orderId } = await searchParams;

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-12">
      <div className="mb-6 w-full rounded-md border border-amber-700/40 bg-amber-950/40 px-4 py-3 text-center text-xs text-amber-300">
        MOCK PAYMENT — Stripe is bypassed. No real charge. (dev mode)
      </div>

      <h1 className="text-2xl font-bold">Fake checkout</h1>
      <p className="mt-2 text-center text-sm text-neutral-400">
        This page replaces Stripe Checkout when <code>MOCK_PAYMENTS=true</code>. Click <em>Pay</em> to
        mark the order paid and trigger the same downstream flow as a real Stripe webhook.
      </p>

      {orderId ? (
        <>
          <div className="mt-6 rounded-md bg-neutral-900 px-4 py-2 font-mono text-xs text-neutral-500">
            Order {orderId}
          </div>
          <MockPayPanel orderId={orderId} />
        </>
      ) : (
        <div className="mt-6 text-sm text-red-400">Missing orderId in URL.</div>
      )}
    </main>
  );
}
