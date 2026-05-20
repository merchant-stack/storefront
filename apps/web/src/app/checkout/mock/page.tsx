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
    <main className="mx-auto flex max-w-xl flex-col items-center px-6 py-16">
      <div className="w-full rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-center text-xs font-medium text-amber-200">
        MOCK PAYMENT — Stripe bypassed. No real charge. Dev mode only.
      </div>

      <h1 className="mt-8 font-display text-3xl font-bold">Fake checkout</h1>
      <p className="mt-2 max-w-md text-center text-sm text-zinc-400">
        This page stands in for Stripe Checkout when{' '}
        <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-xs">MOCK_PAYMENTS=true</code>.
        Click <em>Pay</em> to mark the order paid and trigger the same downstream flow as a real
        Stripe webhook.
      </p>

      {orderId ? (
        <>
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-xs text-zinc-400">
            Order {orderId}
          </div>
          <MockPayPanel orderId={orderId} />
        </>
      ) : (
        <div className="mt-6 text-sm text-red-300">Missing orderId in URL.</div>
      )}
    </main>
  );
}
