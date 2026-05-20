import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getItem } from '@/lib/items';
import { formatPrice } from '@/lib/format';
import { CheckoutButton } from '@/components/CheckoutButton';

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  const available = item.available !== false;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        href={`/market/${item.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m15 5-7 7 7 7" />
        </svg>
        Back to item
      </Link>

      <h1 className="mt-6 font-display text-3xl font-bold">Review your purchase</h1>

      <div className="card mt-8 overflow-hidden">
        <div className="flex items-center gap-4 p-5">
          {item.iconUrl ? (
            <img
              src={item.iconUrl}
              alt={item.displayName}
              className="h-20 w-20 rounded-lg bg-zinc-950/60 object-contain p-2"
            />
          ) : null}
          <div className="flex-1 min-w-0">
            <div className="label">{item.type ?? 'Rust skin'}</div>
            <div className="mt-0.5 truncate text-lg font-semibold">{item.displayName}</div>
            <div className="truncate font-mono text-xs text-zinc-500">{item.marketHashName}</div>
          </div>
          <div className="text-right">
            <div className="label">Total</div>
            <div className="font-display text-2xl font-bold text-brand">
              {formatPrice(item.salePriceMinor, item.currency)}
            </div>
          </div>
        </div>
        <div className="border-t border-white/[0.06] bg-white/[0.02] p-5">
          <ul className="space-y-2 text-sm text-zinc-400">
            <li className="flex items-start gap-2">
              <Check />
              Instant delivery to your Steam account after payment.
            </li>
            <li className="flex items-start gap-2">
              <Check />
              Steam trade offer sent to the URL on your account profile.
            </li>
            <li className="flex items-start gap-2">
              <Check />
              Auto-refund if we can&apos;t deliver.
            </li>
          </ul>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm text-amber-200">
        Steam Mobile Authenticator on your account avoids the 15-day trade hold.
      </div>

      <div className="mt-8">
        {available ? (
          <CheckoutButton
            sourceItemId={item.id}
            label={`Pay ${formatPrice(item.salePriceMinor, item.currency)}`}
          />
        ) : (
          <div className="card p-4 text-center text-sm text-zinc-400">
            This item is no longer available.
          </div>
        )}
      </div>
    </main>
  );
}

const Check = () => (
  <div className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand/15 text-brand">
    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={3.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
    </svg>
  </div>
);
