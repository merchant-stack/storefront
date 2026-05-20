import type { Metadata } from 'next';
import { LegalLayout, PlaceholderNotice } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Refund policy' };

export default function RefundsPage() {
  return (
    <LegalLayout title="Refund policy" lastUpdated="2026-05-20 (draft)">
      <PlaceholderNotice />

      <h2>Automatic refunds</h2>
      <p>
        If we cannot deliver the skin you purchased — for example because the source offer
        disappeared or our bot cannot complete the trade — we refund your payment in full,
        automatically, via Stripe. You don&apos;t need to contact us.
      </p>

      <h2>No buyer&apos;s remorse refunds</h2>
      <p>
        Because digital items are delivered to your Steam inventory immediately and are not
        recoverable once sent, we cannot offer refunds simply because you changed your mind.
      </p>

      <h2>Trade holds</h2>
      <p>
        Steam may place a 15-day hold on the trade if your account doesn&apos;t use Mobile
        Authenticator. The item still arrives — the hold is between you and Steam. This is not
        grounds for a refund.
      </p>

      <h2>Chargebacks</h2>
      <p>
        If we&apos;ve delivered the item and you initiate a chargeback, we will dispute it with
        evidence of delivery. Unfounded chargebacks may result in a permanent account ban from
        our service.
      </p>

      <h2>How to contact us</h2>
      <p>
        For genuine delivery issues that the automatic flow didn&apos;t catch, email us at the
        support address (to be published before launch). Include your order ID for the fastest
        response.
      </p>
    </LegalLayout>
  );
}
