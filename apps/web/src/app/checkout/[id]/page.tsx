import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getItem } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { CheckoutButton } from '@/components/CheckoutButton';

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const available = item.available !== false;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href={`/market/${item.id}`} className="text-sm text-neutral-400 hover:text-white">
        ← Back to item
      </Link>
      <h1 className="mt-4 text-2xl font-bold">Review your purchase</h1>

      <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <div className="flex items-center gap-4">
          {item.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.iconUrl}
              alt={item.displayName}
              className="h-20 w-20 rounded bg-neutral-950 object-contain p-2"
            />
          ) : null}
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-neutral-500">
              {item.type ?? 'Rust skin'}
            </div>
            <div className="text-lg font-semibold">{item.displayName}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-neutral-500">Price</div>
            <div className="text-xl font-bold text-brand">
              {formatPrice(item.salePriceMinor, item.currency)}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-3 text-sm text-neutral-400">
        <p>
          You&apos;ll be redirected to Stripe Checkout to complete payment. After payment, we source
          the item and our bot sends it to your Steam account via trade offer — make sure your trade
          URL is set in your profile.
        </p>
        <p className="text-amber-400">
          Steam Mobile Authenticator on your account avoids the 15-day trade hold.
        </p>
      </div>

      <div className="mt-8">
        {available ? (
          <CheckoutButton
            sourceItemId={item.id}
            label={`Pay ${formatPrice(item.salePriceMinor, item.currency)}`}
          />
        ) : (
          <div className="rounded-md bg-neutral-900 px-4 py-3 text-center text-sm text-neutral-400">
            This item is no longer available.
          </div>
        )}
      </div>
    </main>
  );
}
