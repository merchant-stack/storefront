import type { Metadata } from 'next';
import { LegalLayout, PlaceholderNotice } from '@/components/LegalLayout';

export const metadata: Metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of service" lastUpdated="2026-05-20 (draft)">
      <PlaceholderNotice />

      <h2>What RustSkinPay does</h2>
      <p>
        RustSkinPay sells in-game cosmetic items for Rust and dispatches them to your Steam
        account via a Steam trade offer. We are not affiliated with Valve, Facepunch Studios,
        or any inventory partner platform.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 18 years old (or the age of majority in your jurisdiction).</li>
        <li>You sign in via Steam OpenID. You are responsible for your Steam account&apos;s security.</li>
        <li>You agree to provide a valid Steam trade URL that you own.</li>
      </ul>

      <h2>Payments and pricing</h2>
      <p>
        Prices are shown in USD and are final at checkout. Payments are processed by a licensed
        third-party payment provider. We do not store your card details.
      </p>

      <h2>Delivery</h2>
      <p>
        We aim to deliver within minutes of payment confirmation. Steam-imposed trade holds (up
        to 15 days without Mobile Authenticator) are outside our control. If we cannot deliver,
        we automatically refund you in full — see the refund policy.
      </p>

      <h2>Prohibited use</h2>
      <ul>
        <li>Using the service for money laundering, fraud, or sanctions evasion.</li>
        <li>Attempting to abuse refund flows or chargebacks.</li>
        <li>Reselling skins acquired through our service in violation of Steam&apos;s rules.</li>
      </ul>

      <h2>Liability</h2>
      <p>
        Our maximum liability for any order is limited to the amount you paid for that order.
        We are not liable for Steam outages, Valve policy changes, or in-game item value
        fluctuations.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms; the &quot;Last updated&quot; date above reflects the latest
        revision.
      </p>
    </LegalLayout>
  );
}
