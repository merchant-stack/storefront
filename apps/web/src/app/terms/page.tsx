import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { LEGAL_ENTITY, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

export const metadata: Metadata = { title: 'Terms of service' };

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of service" lastUpdated="2026-05-20">
      <h2>1. Who we are</h2>
      <p>
        RustSkinPay (the &quot;Service&quot;, &quot;we&quot;, &quot;us&quot;, or
        &quot;RustSkinPay&quot;) is operated by <strong>{LEGAL_ENTITY.name}</strong>,{' '}
        {LEGAL_ENTITY.registrationLabel} {LEGAL_ENTITY.registrationNumber}, with registered
        address at {LEGAL_ENTITY.address.line1}, {LEGAL_ENTITY.address.district},{' '}
        {LEGAL_ENTITY.address.city}, {LEGAL_ENTITY.address.country}. References to
        &quot;you&quot; or &quot;Buyer&quot; in this document mean any person who uses the
        Service. Contact for all matters related to this document:{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
      </p>
      <p>
        Governing law is the law of the Republic of Armenia, save that nothing in this document
        deprives a consumer of any protection granted by mandatory consumer-protection rules of
        the jurisdiction where the consumer is habitually resident (in particular Directive
        2011/83/EU and Regulation (EU) 2017/2394 for buyers in the European Union, and the
        Consumer Rights Act 2015 for buyers in the United Kingdom).
      </p>

      <h2>2. What the Service does</h2>
      <p>
        RustSkinPay is a direct online seller of in-game cosmetic items (&quot;Skins&quot;) for
        the video game Rust, published by Facepunch Studios and distributed via Valve&apos;s
        Steam platform. We acquire Skins from licensed third-party inventory partners and
        dispatch them to your Steam account by way of a Steam trade offer initiated against the
        Steam trade URL you provide.
      </p>
      <p>
        We are <strong>not</strong> a marketplace: every Skin sold via the Service is sold
        directly by RustSkinPay, not by a third-party seller. We are <strong>not</strong>{' '}
        affiliated with Valve Corporation, Facepunch Studios, or any inventory partner.
        Reference to such third-party names is made solely for the purpose of describing the
        nature of the Skins and the channels through which they are delivered.
      </p>

      <h2>3. Eligibility</h2>
      <p>By using the Service you confirm that:</p>
      <ul>
        <li>
          you are at least 18 years old, or the age of legal majority in your place of
          residence, whichever is higher, and that you have full legal capacity to enter into a
          binding agreement;
        </li>
        <li>
          you are not a person subject to sanctions adopted by the United Nations, the European
          Union, the United Kingdom, or the United States, and you are not accessing the
          Service from a jurisdiction subject to comprehensive sanctions;
        </li>
        <li>
          the Steam account to which Skins will be delivered is your own and was not obtained
          in breach of Valve&apos;s Steam Subscriber Agreement.
        </li>
      </ul>

      <h2>4. Your account and Steam authentication</h2>
      <p>
        You authenticate by signing in with Steam (Steam OpenID). We never see or store your
        Steam password. By signing in you authorise us to read your public Steam ID, display
        name, and avatar, and to associate orders with that Steam ID. You are responsible for
        the security of the Steam account you use.
      </p>
      <p>
        To receive delivery of a Skin you must add a valid <em>Steam trade URL</em> to your
        account. We verify that the trade URL you provide resolves to the SteamID you signed in
        with; we will refuse trade URLs that do not match. Submitting a trade URL belonging to
        another person is a violation of these terms and we may suspend the account and refuse
        delivery.
      </p>
      <p>
        Each user may operate one account at any given time. Creating multiple accounts to
        circumvent suspensions, exhaust promotional offers, or evade anti-fraud measures is
        prohibited and may result in cancellation of orders and forfeiture of refunds for the
        offending account.
      </p>

      <h2>5. Orders, prices, and payment</h2>
      <p>
        Prices on the Service are shown in USD unless otherwise indicated and include all taxes
        that we are legally required to collect at the point of sale based on your location.
        Where applicable consumer law in your jurisdiction requires VAT, GST, or sales tax to
        be charged in addition to the displayed price, this will be shown at checkout before
        you confirm the order.
      </p>
      <p>
        A binding contract of sale is concluded only when the payment processor confirms that
        the full purchase price has been credited to us. Until that confirmation, no Skin is
        reserved for you. We may reject any order at our discretion before this confirmation,
        in particular where the order triggers our anti-fraud signals, where the Skin has
        become unavailable from our inventory partner between the time you placed the order and
        the time payment cleared, or where your account is in breach of these terms.
      </p>
      <p>
        Payment is processed by a third-party payment provider (currently Stripe Payments
        Europe, Limited, and may be extended to others). Your payment data is handled by that
        provider under its own terms and privacy policy; we receive only the information
        necessary to identify the transaction (e.g. payment status, last four digits of the
        card, billing email). We never store full card numbers.
      </p>
      <p>
        Where you pay in a cryptocurrency, the underlying transaction is still denominated in
        USD; the amount of cryptocurrency due is calculated at the prevailing reference exchange
        rate at the time of checkout. If the value of the received cryptocurrency at the time
        of credit deviates by more than 5% from the value at the time of checkout, we reserve
        the right to cancel the order and refund the cryptocurrency to the originating address.
      </p>

      <h2>6. Delivery</h2>
      <p>
        Once payment has cleared we initiate the buy-and-dispatch process with our inventory
        partner. The partner sends a Steam trade offer for the purchased Skin directly to the
        Steam trade URL you provided. In normal conditions delivery is initiated within minutes
        of payment confirmation; in rare cases delivery may be delayed up to a few hours due to
        third-party processing.
      </p>
      <p>
        <strong>Steam trade holds.</strong> Steam may apply a hold of up to 15 days on the
        delivered trade where either side of the trade does not have a fully activated Steam
        Guard Mobile Authenticator confirmed for at least 7 days on a trusted device. Trade
        holds are imposed by Valve and are entirely outside our control. The Skin is still
        delivered; the hold delays only the moment at which it becomes usable in-game. A trade
        hold is not a defect, is not grounds for refund, and is not delivery failure.
      </p>
      <p>
        <strong>Delivery is deemed complete</strong> when the trade offer is sent to your trade
        URL by the inventory partner. From that point, accepting the trade offer in Steam is
        your responsibility. If you do not accept the trade offer before it expires (Steam
        trade offers expire after 14 days by default), the Skin returns to the inventory
        partner and the contract is treated as performed on our side.
      </p>

      <h2>7. Right of withdrawal — digital content</h2>
      <p>
        For consumers based in the European Union, the United Kingdom, and other jurisdictions
        applying equivalent rules, the statutory right of withdrawal applies to the purchase of
        digital content with the following limitation expressly drawn to your attention before
        you confirm payment:
      </p>
      <p>
        <strong>
          By confirming your order you give your express consent that performance of the
          contract — the dispatch of the trade offer to your Steam account — begins immediately
          upon payment confirmation, and you acknowledge that this causes you to lose your
          right of withdrawal once delivery has occurred.
        </strong>{' '}
        This is because once a Skin has been transferred to your Steam account, it can be moved,
        traded, or consumed without our control or that of our inventory partner, and it cannot
        be returned to inventory or resold. This limitation reflects Article 16(m) of EU
        Directive 2011/83/EU and equivalent provisions in other jurisdictions.
      </p>
      <p>
        Where you cancel before the trade offer has been sent (i.e. while the order is still
        being prepared) we will refund you in full. See the Refund policy for the operational
        detail.
      </p>

      <h2>8. Non-delivery and defective performance</h2>
      <p>
        If we are unable to dispatch the Skin you purchased — for example, because inventory
        became unavailable between checkout and dispatch, the trade offer was declined by Steam
        for reasons attributable to us or our partner, or our partner&apos;s system reports a
        delivery failure — we will refund the full purchase price (including taxes and any
        service fees we charged) by the same payment method you used, automatically and
        without further request from you, normally within minutes and in any event without
        undue delay.
      </p>
      <p>
        If the Skin delivered does not match the Skin shown on the order page (wrong item,
        wrong wear, wrong stickers where listed), contact us within 14 days of delivery at{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with your order ID. Because Skins, once
        transferred, cannot be repaired or remotely retrieved, our remedy is replacement with
        the correct Skin or, where replacement is not possible at proportionate cost, a full
        refund of the purchase price. Nothing in this clause limits your statutory rights as a
        consumer under the mandatory law of your jurisdiction.
      </p>

      <h2>9. Prohibited use</h2>
      <p>You agree not to do, and not to attempt to do, any of the following:</p>
      <ul>
        <li>
          use the Service for money laundering, terrorist financing, fraud, sanctions evasion,
          tax evasion, or any activity unlawful under the law of your jurisdiction or ours;
        </li>
        <li>
          pay with a payment instrument that does not belong to you or that has been
          stolen or otherwise obtained without authorisation, or use the Service to test,
          validate, or cycle compromised cards or bank credentials;
        </li>
        <li>
          provide a Steam trade URL that does not belong to you, or otherwise impersonate
          another person, falsify your identity, or supply false, incomplete, or misleading
          information at registration or checkout;
        </li>
        <li>
          engage in serial buy-and-refund patterns or exploit our automatic refund mechanism
          for any purpose other than receiving the Skin you ordered;
        </li>
        <li>
          initiate chargebacks for orders where the Skin was dispatched to the trade URL you
          provided, where you accepted the trade offer in Steam, or where a Steam trade hold
          (not a delivery failure) is the only obstacle to use;
        </li>
        <li>
          attempt to interfere with the operation of the Service, including by scraping our
          catalog without permission, probing for security weaknesses, reverse-engineering the
          checkout flow, deploying bots or other automated tools to interact with the Service,
          or circumventing rate limits, anti-fraud measures, or access controls;
        </li>
        <li>
          send unsolicited communications referring to the Service, conduct phishing against
          our users or impersonating us, deploy malware via any input field accepted by the
          Service, or attempt to obtain credentials of other users by any means;
        </li>
        <li>
          resell Skins acquired through the Service in violation of Valve&apos;s Steam
          Subscriber Agreement or any applicable end-user licence agreement.
        </li>
      </ul>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend or close your account, refuse pending orders, and withhold delivery
        where we have reasonable grounds to suspect a breach of these terms or unlawful use of
        the Service. Where we suspend an account we will tell you the reason and the steps
        available to you to challenge the decision, save where doing so would compromise an
        ongoing investigation or oblige us to breach a legal duty of confidentiality.
      </p>
      <p>
        You may close your account at any time by writing to{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Closure does not extinguish any
        outstanding liabilities or rights accrued before the closure date.
      </p>
      <p>
        <strong>Inactive accounts.</strong> If you have not signed in or placed an order for
        24 months, we may freeze your account to reduce exposure to account-takeover. A frozen
        account can be reactivated by writing to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{' '}
        and confirming control of the email address on file. After 36 months of continued
        inactivity we may administratively close the account; transactional and tax records
        are retained for the period required by applicable law (see the Privacy policy). We
        give at least one email notice before any freeze or closure where we have an email
        address for you.
      </p>

      <h2>11. Intellectual property</h2>
      <p>
        The Service — including its design, code, copy, and the &quot;RustSkinPay&quot; name
        and logo — is the property of {LEGAL_ENTITY.name}. Skin names, in-game images, and
        brand references displayed on the Service belong to their respective rights-holders
        (Valve Corporation, Facepunch Studios, and item creators where applicable) and are
        used for the descriptive purpose of identifying the items offered for sale. No licence
        in any third-party intellectual property is granted to you under these terms beyond
        what is necessary to use the Skin in the game it was made for.
      </p>

      <h2>12. Liability and indemnity</h2>
      <p>
        Nothing in this clause excludes or limits our liability for fraud, fraudulent
        misrepresentation, death or personal injury caused by negligence, or any liability
        that cannot lawfully be excluded under the law applicable to a consumer in the
        consumer&apos;s jurisdiction.
      </p>
      <p>
        Subject to the above, our total aggregate liability arising out of or in connection
        with any single order is limited to the amount actually paid by you for that order. We
        are not liable for loss of profits, loss of expected savings, loss of in-game progress
        or trade opportunities, fluctuations in Skin market value, Steam or Valve service
        outages, changes to Valve&apos;s policies (including changes to Steam trade rules), or
        any other indirect or consequential loss.
      </p>
      <p>
        If you breach these terms and that breach causes a third party to bring a claim
        against us, you agree to indemnify us against the reasonable legal costs and any
        compensation we are required to pay as a result of that claim, to the fullest extent
        permitted by the law applicable to you. For consumers resident in the European Union,
        the United Kingdom, or another jurisdiction whose consumer-protection law restricts
        indemnity obligations of consumers, this clause applies only insofar as it is
        compatible with that law.
      </p>

      <h2>13. Force majeure</h2>
      <p>
        We are not in breach of these terms, and not liable for any failure or delay, where the
        failure or delay is caused by events outside our reasonable control, including but not
        limited to: outages or policy changes at Valve / Steam; outages or policy changes at
        our inventory or payment partners; internet infrastructure failure; cyber-attack;
        natural disaster; epidemic; war; or governmental action. Where such an event prevents
        delivery, our obligation is limited to refund.
      </p>

      <h2>14. Changes to these terms and to the Service</h2>
      <p>
        We may update these terms from time to time. Where we make material changes that affect
        your rights we will give you reasonable advance notice by email (where we have your
        email address) and by a prominent notice on the Service. Updated terms apply
        prospectively only; orders placed under earlier versions of these terms remain
        governed by the version that was in force when the order was placed.
      </p>
      <p>
        We may add, modify, or discontinue features of the Service at any time. Discontinuing
        a feature does not affect rights you have already acquired (in particular, your right
        to delivery or refund of a paid order).
      </p>

      <h2>15. Complaints, reports, and dispute resolution</h2>
      <p>
        Please send any complaint to <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with your
        order ID, a description of the issue, and any screenshots or other evidence that may
        help us assist you. We aim to acknowledge complaints within 2 working days and to
        resolve them within 14 working days; where we need additional information from you,
        the 14-day period runs from the date we receive that information. Where a complaint
        relates to delivery and the automatic refund flow described in clause 8 has already
        resolved the matter, we will confirm that to you in writing.
      </p>
      <p>
        To report a violation of these terms, suspected fraud, an account-takeover, abusive
        behaviour towards you in any communication channel, or an intellectual-property issue
        (including a takedown request), please write to{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> with the subject line clearly indicating
        the nature of the report. Good-faith reports are treated confidentially and will not
        be used against the reporter.
      </p>
      <p>
        Consumers habitually resident in the European Union, Norway, Iceland, or Liechtenstein
        may use the European Commission&apos;s online dispute resolution platform at{' '}
        <a href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">
          ec.europa.eu/consumers/odr
        </a>
        . Use of the ODR platform is optional; you may also pursue your statutory rights
        before the competent national authority or court.
      </p>
      <p>
        Subject to mandatory consumer-protection rules, the courts of Yerevan, Republic of
        Armenia, have non-exclusive jurisdiction over any dispute arising out of these terms.
      </p>

      <h2>16. Severability and entire agreement</h2>
      <p>
        If any provision of these terms is held to be invalid or unenforceable by a court of
        competent jurisdiction, the remaining provisions remain in full force. A failure or
        delay by us to enforce any right under these terms does not operate as a waiver of
        that right. These terms (together with the Privacy policy and the Refund policy)
        constitute the entire agreement between you and us in respect of the Service.
      </p>

      <h2>17. Contact</h2>
      <p>
        Questions, complaints, or notices under these terms:{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. Postal address:{' '}
        {LEGAL_ENTITY.name}, {LEGAL_ENTITY.address.line1}, {LEGAL_ENTITY.address.district},{' '}
        {LEGAL_ENTITY.address.city}, {LEGAL_ENTITY.address.country}.
      </p>
    </LegalLayout>
  );
}
