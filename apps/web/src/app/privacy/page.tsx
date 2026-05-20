import type { Metadata } from 'next';
import { LegalLayout, PlaceholderNotice } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" lastUpdated="2026-05-20 (draft)">
      <PlaceholderNotice />

      <h2>What we collect</h2>
      <p>
        When you sign in with Steam, we receive your public SteamID, display name and avatar. To
        deliver purchased skins we also store the Steam trade URL you provide.
      </p>
      <p>
        Payment information (card details, billing address) is collected and processed by Stripe.
        We never see or store your full card number — we only receive a token and event
        notifications from Stripe.
      </p>

      <h2>What we don&apos;t collect</h2>
      <ul>
        <li>Your Steam password — authentication is via Steam OpenID, we never see it.</li>
        <li>Your real name, address, or government ID.</li>
        <li>Cross-site tracking cookies or third-party advertising identifiers.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To deliver the skins you purchase (Steam trade offers).</li>
        <li>To process payments and issue refunds (via Stripe).</li>
        <li>To detect and prevent fraud and abuse.</li>
        <li>To respond to your support requests.</li>
      </ul>

      <h2>Who we share with</h2>
      <ul>
        <li>
          <strong>Stripe</strong> — payment processing. Subject to{' '}
          <a href="https://stripe.com/privacy" target="_blank" rel="noreferrer">
            Stripe&apos;s privacy policy
          </a>
          .
        </li>
        <li>
          <strong>Inventory partners</strong> — to fulfil your order, we share the item reference
          with the partner platform that holds the inventory. We do not share your personal data.
        </li>
        <li>
          <strong>Steam</strong> — by design, since we send the trade offer to your account.
        </li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You may request a copy of the data we hold about you, or its deletion, by emailing
        support (address to be published before launch).
      </p>

      <h2>Cookies</h2>
      <p>
        We use a single essential cookie to keep you signed in. We do not use tracking,
        analytics, or advertising cookies.
      </p>
    </LegalLayout>
  );
}
