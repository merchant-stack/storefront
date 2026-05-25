import { notFound } from 'next/navigation';
import { getItem } from '@/lib/items';
import { CheckoutShell } from '@/components/CheckoutShell';
import { CheckoutFlow } from '@/components/CheckoutFlow';

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getItem(id);
  if (!item) notFound();

  // Gating: SHOWCASE items can never be checked out — we don't actually stock
  // them. If a user direct-links here (the market detail page already hides
  // the Buy CTA for showcase items, but URL guessing / shared links are
  // possible), CheckoutFlow renders the same "coming soon" copy in place of
  // the iframe.
  const available = item.available !== false;
  const buyable = available && item.status === 'in_stock';

  return (
    <CheckoutShell
      subtitle="Your skin purchase will be automatically delivered to your Steam account."
    >
      <CheckoutFlow item={item} buyable={buyable} />
    </CheckoutShell>
  );
}
