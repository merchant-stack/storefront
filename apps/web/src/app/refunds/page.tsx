import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { LEGAL_ENTITY, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

export const metadata: Metadata = { title: 'Refund policy' };

export default function RefundsPage() {
  return (
    <LegalLayout title="Refund policy" lastUpdated="2026-05-20">
      <h2>1. What this policy covers</h2>
      <p>
        This policy describes when and how RustSupply (operated by{' '}
        <strong>{LEGAL_ENTITY.name}</strong>) issues refunds. It is part of, and should be
        read together with, our{' '}
        <a href="/terms">Terms of service</a>. Nothing in this policy limits any
        non-waivable right you may have as a consumer under the mandatory law of your
        jurisdiction; where this policy is more generous than the mandatory minimum, the
        terms of this policy apply.
      </p>

      <h2>2. Automatic refund where we cannot deliver</h2>
      <p>
        If we cannot dispatch the Skin you purchased — for example because the inventory
        partner reports that the item became unavailable between your payment and our buy
        attempt, the Steam trade offer was declined for a reason attributable to us or our
        partner, or our delivery flow records a non-recoverable failure — we refund the full
        amount you paid (purchase price plus any tax or fee you were charged) by the same
        payment method you used. The refund is issued automatically; you do not need to
        contact us, and we do not require any further action from you to receive it.
      </p>
      <p>
        Refunds are normally issued within minutes of the failure being recorded. The time it
        takes for the refunded amount to appear in your account depends on the original
        payment method: card refunds typically clear in 5–10 business days; cryptocurrency
        refunds clear with the next network confirmation; bank-based methods may take longer.
      </p>

      <h2>3. Steam trade holds are not delivery failures</h2>
      <p>
        Steam may apply a hold of up to 15 days on an incoming trade where either side of the
        trade does not meet Valve&apos;s Steam Guard Mobile Authenticator requirements
        (typically: at least 7 days on a trusted device with mobile authenticator enabled).
        The trade hold is imposed by Valve and is entirely outside our control. The Skin is
        still on its way to you; the hold delays only the moment it becomes usable in-game.
      </p>
      <p>
        Because delivery did occur, a trade hold is <strong>not</strong> a ground for refund.
        If you want to avoid future trade holds, set up Steam Guard Mobile Authenticator on a
        trusted device and wait 7 days before purchasing.
      </p>

      <h2>4. No buyer&apos;s remorse refunds for delivered Skins</h2>
      <p>
        Once a Steam trade offer for your Skin has been dispatched to the trade URL you
        provided, the contract is performed on our side and the Skin can no longer be
        recovered or resold. Consistent with the limitation of the right of withdrawal for
        digital content described in section 7 of our Terms (and with Article 16(m) of EU
        Directive 2011/83/EU and equivalent rules elsewhere), we do not refund delivered
        Skins on grounds of change of mind, change in the market price of the Skin, or
        dissatisfaction with the visual appearance once it is on your account.
      </p>

      <h2>5. Cancellation before delivery</h2>
      <p>
        If you want to cancel an order before delivery has occurred, contact us at{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> immediately with your order ID. In
        practice the dispatch process completes within minutes of payment confirmation, so
        the window during which manual cancellation is possible is short. Where we are able
        to cancel before delivery, we refund in full.
      </p>

      <h2>6. Wrong item delivered</h2>
      <p>
        If the Skin delivered to your Steam account materially does not match what was shown
        on the order page (e.g. wrong skin entirely; wrong wear category where the order page
        specified one; missing stickers where the order page specified them), contact us
        within 14 days of delivery at <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with your
        order ID, a screenshot of the trade offer or the item in your Steam inventory, and
        the Steam trade offer ID. We will assess the discrepancy and, where it is genuine,
        offer either (i) replacement with the correct Skin or (ii) where replacement is not
        feasible at proportionate cost, a full refund.
      </p>
      <p>
        Because Skins, once transferred, cannot be repaired and cannot be remotely retrieved,
        a replacement may require you to return the original Skin via a Steam trade to a
        recipient we will specify. We will not charge you a fee or a Steam network commission
        for the return trade.
      </p>

      <h2>7. Chargebacks</h2>
      <p>
        Where we have delivered the Skin (a Steam trade offer was sent to the trade URL you
        provided) and you initiate a chargeback or payment-dispute with your card issuer or
        payment provider, we will contest the chargeback with evidence of delivery, including
        the trade offer record from our inventory partner and the dispatch timestamps. If the
        chargeback is upheld in your favour despite delivery having occurred we reserve the
        right to suspend your account from future purchases. Initiating a chargeback in
        respect of a delivered order is also a breach of clause 9 of our Terms of service.
      </p>
      <p>
        If you believe there has been a genuine delivery problem, please contact us first.
        The automatic refund flow described in section 2 above resolves the vast majority of
        delivery problems faster than a chargeback would.
      </p>

      <h2>8. Refunds in cryptocurrency</h2>
      <p>
        Where you paid in cryptocurrency, refunds are issued in the same cryptocurrency and to
        the originating address. Because cryptocurrency prices fluctuate, the amount of
        cryptocurrency you receive may differ from the amount you originally sent. The refund
        is calculated as the USD value of your original purchase at the prevailing reference
        rate at the time of refund, converted into the cryptocurrency. We do not refund the
        fiat-value loss caused by adverse exchange-rate movement; this is a known
        characteristic of cryptocurrency payments.
      </p>

      <h2>9. Contact</h2>
      <p>
        For any refund question that this policy does not answer, write to{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with your order ID. Service operator:{' '}
        <strong>{LEGAL_ENTITY.name}</strong>, {LEGAL_ENTITY.address.line1},{' '}
        {LEGAL_ENTITY.address.district}, {LEGAL_ENTITY.address.city},{' '}
        {LEGAL_ENTITY.address.country}.
      </p>
    </LegalLayout>
  );
}
