import type { Metadata } from 'next';
import { LegalLayout } from '@/components/LegalLayout';
import { LEGAL_ENTITY, SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/lib/support';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy policy" lastUpdated="2026-05-20">
      <h2>1. Data controller</h2>
      <p>
        The controller of personal data processed in connection with the RustSkinPay service
        (the &quot;Service&quot;) is <strong>{LEGAL_ENTITY.name}</strong>,{' '}
        {LEGAL_ENTITY.registrationLabel} {LEGAL_ENTITY.registrationNumber}, registered at{' '}
        {LEGAL_ENTITY.address.line1}, {LEGAL_ENTITY.address.district},{' '}
        {LEGAL_ENTITY.address.city}, {LEGAL_ENTITY.address.country}. For any data-protection
        request, including the rights described below, contact{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
      </p>
      <p>
        This policy describes what personal data we collect, the purposes for which we process
        it, the legal bases on which we rely, with whom we share it, how long we keep it, and
        the rights you have. We process personal data in accordance with the General Data
        Protection Regulation (Regulation (EU) 2016/679, &quot;GDPR&quot;) and the data
        protection law of the Republic of Armenia.
      </p>

      <h2>2. Personal data we collect</h2>
      <p>We collect the following categories of data:</p>
      <ul>
        <li>
          <strong>Steam profile data</strong> — your public 64-bit Steam ID, display name, and
          avatar URL, received from Valve via Steam OpenID when you sign in. We do not receive
          your Steam password.
        </li>
        <li>
          <strong>Steam trade URL</strong> — the URL you submit so that we can dispatch
          purchased Skins. The URL includes a numeric partner ID and a short token issued by
          Steam.
        </li>
        <li>
          <strong>Email address</strong> — collected at checkout by our payment processor and
          stored by us against your order. We use it to send transactional notices (order
          confirmation, refund notice, delivery notice).
        </li>
        <li>
          <strong>Order data</strong> — the Skin you bought, the price, the time of purchase,
          the payment method category (e.g. card / cryptocurrency), the payment processor&apos;s
          transaction identifier, and the status of delivery.
        </li>
        <li>
          <strong>Technical data</strong> — IP address, user-agent string, approximate
          geolocation derived from IP, request timestamps. Collected and held in server logs.
        </li>
        <li>
          <strong>Security and anti-fraud signals</strong> — login history, trade-URL change
          history, rate-limit counters, and similar markers used to detect account-takeover and
          payment fraud.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> collect: your Steam password, your real name (unless you
        choose to provide it in support correspondence), your residential address (unless
        required by mandatory anti-money-laundering rules above the applicable threshold),
        government identifiers, biometric data, or special categories of data within the
        meaning of GDPR Article 9.
      </p>
      <p>
        Card numbers, CVV, and other payment instrument data are collected and processed by
        our payment processor (currently Stripe Payments Europe, Limited) directly through
        their hosted checkout. We never see them.
      </p>

      <h2>3. Why we process your data, and on what legal basis</h2>
      <p>
        Under GDPR Article 6, each purpose for which we process personal data has a legal
        basis. The principal purposes are:
      </p>
      <ul>
        <li>
          <strong>Performance of the contract with you</strong> (Art. 6(1)(b)): processing
          your order, dispatching the Skin to your trade URL, issuing refunds where
          applicable, communicating order updates by email.
        </li>
        <li>
          <strong>Compliance with our legal obligations</strong> (Art. 6(1)(c)): retaining
          transactional records for tax purposes, responding to lawful requests from
          competent authorities, complying with anti-money-laundering obligations applicable
          to us.
        </li>
        <li>
          <strong>Our legitimate interests</strong> (Art. 6(1)(f)), where these are not
          overridden by your rights: preventing fraud and account takeover, securing the
          Service against attack, defending and pursuing legal claims, producing aggregated
          statistics to operate and improve the Service.
        </li>
        <li>
          <strong>Your consent</strong> (Art. 6(1)(a)), where required — for example,
          non-essential cookies if and when we introduce them. We do not currently set
          marketing or tracking cookies. You may withdraw consent at any time without
          affecting the lawfulness of processing carried out before withdrawal.
        </li>
      </ul>

      <h2>4. Who we share your data with</h2>
      <p>
        We share personal data only with the processors and recipients necessary to operate
        the Service:
      </p>
      <ul>
        <li>
          <strong>Payment processors</strong> (Stripe; and, where you choose crypto payment,
          our crypto payment processor). They process card and payment data on our behalf
          under their own privacy policies and applicable data-protection law.
        </li>
        <li>
          <strong>Inventory partners</strong> (currently Waxpeer) — to deliver the Skin we
          share your Steam trade URL (which contains a numeric ID and short token) and the
          Skin reference. We do not share your name, email, or payment data with the inventory
          partner.
        </li>
        <li>
          <strong>Hosting and infrastructure providers</strong> — the services on which the
          Service runs, our managed database, our managed cache, and our transactional email
          provider.
        </li>
        <li>
          <strong>Valve Corporation</strong> — by design, since authentication is via Steam
          OpenID and delivery is a Steam trade offer. We exchange the minimum data necessary.
        </li>
        <li>
          <strong>Public authorities</strong> — where compelled by a valid legal request from
          a competent authority. We do not voluntarily disclose user data to third parties for
          their own purposes.
        </li>
      </ul>

      <h2>5. International transfers</h2>
      <p>
        Some of our processors are established outside the European Economic Area or the
        Republic of Armenia (for example, Stripe processes some data via its US affiliate).
        Where we transfer personal data outside the EEA, the transfer is made under the
        European Commission&apos;s Standard Contractual Clauses or another transfer mechanism
        recognised by GDPR. You may request a copy of the safeguards by writing to{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
      </p>

      <h2>6. Retention</h2>
      <p>
        We retain personal data only for as long as necessary for the purpose for which it was
        collected, and in any event:
      </p>
      <ul>
        <li>
          <strong>Account data</strong> (Steam ID, trade URL, email): for as long as you have
          an active account, plus the longer of (i) the period during which a related claim
          can be brought against us under applicable limitation periods and (ii) any period
          imposed by mandatory record-keeping rules.
        </li>
        <li>
          <strong>Order and payment records</strong>: for the period required by tax law
          applicable to us (under Armenian tax rules typically 5 years from the end of the tax
          year of the transaction).
        </li>
        <li>
          <strong>Server logs</strong>: typically up to 90 days, longer if needed for a
          specific security investigation.
        </li>
        <li>
          <strong>Marketing consents</strong>: until you withdraw consent, and a short period
          thereafter to evidence withdrawal.
        </li>
      </ul>
      <p>
        After the retention period we delete or anonymise the data so that it can no longer be
        associated with you.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Subject to the conditions and exceptions set out in GDPR and Armenian data-protection
        law, you have the right to:
      </p>
      <ul>
        <li>
          <strong>Access</strong> the personal data we hold about you and obtain a copy;
        </li>
        <li>
          <strong>Rectify</strong> inaccurate or incomplete data;
        </li>
        <li>
          <strong>Erase</strong> your data in certain circumstances (for example, where the
          data is no longer necessary for the purpose for which it was collected, or where you
          have withdrawn consent and there is no other legal basis);
        </li>
        <li>
          <strong>Restrict</strong> processing in certain circumstances (for example, where
          you contest the accuracy of the data);
        </li>
        <li>
          <strong>Object</strong> to processing carried out under our legitimate interests
          (including profiling based on those interests);
        </li>
        <li>
          <strong>Receive your data in a portable format</strong> where the processing is
          based on consent or on the performance of the contract and is carried out by
          automated means;
        </li>
        <li>
          <strong>Withdraw any consent</strong> you have given, at any time;
        </li>
        <li>
          <strong>Lodge a complaint</strong> with a competent supervisory authority — for
          users in the European Union, the supervisory authority of the EU Member State in
          which you reside, work, or where the alleged infringement occurred; for users in
          Armenia, the Personal Data Protection Agency.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>{' '}
        from the email address associated with your purchases. We may ask you to confirm your
        identity before acting on a request. We will respond within one month of receipt of
        the request; in complex cases we may extend that period by a further two months and
        will tell you why.
      </p>

      <h2>8. Automated decision-making</h2>
      <p>
        We use automated rules to detect suspicious orders (for example, velocity checks,
        mismatched trade URLs, suspect IP ranges). Where an order is automatically blocked,
        you may request human review by contacting{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>. We do not carry out profiling that
        produces legal effects in respect of you within the meaning of GDPR Article 22.
      </p>

      <h2>9. Cookies</h2>
      <p>
        The Service uses one strictly necessary cookie to keep you signed in between page
        loads. We do not currently set tracking, analytics, advertising, or third-party
        marketing cookies, and we do not embed third-party social-media trackers. If we
        introduce any such cookie in the future we will request your consent first via a
        cookie banner.
      </p>

      <h2>10. Security</h2>
      <p>
        We protect personal data using appropriate technical and organisational measures,
        including transport-layer encryption (TLS) for all traffic, encryption at rest of
        sensitive credentials, strict access controls, rate limiting and bot-protection
        controls, audit logging of sensitive actions (such as trade URL changes), and
        software-supply-chain monitoring. No system can be guaranteed to be impervious to
        attack, but we apply industry-standard practice. If we become aware of a personal data
        breach affecting your data we will notify you and the competent supervisory authority
        as required by GDPR.
      </p>

      <h2>11. Children</h2>
      <p>
        The Service is not directed at, and not offered to, persons under the age of 18 (or
        the higher local age of majority). We do not knowingly process personal data of
        children. If you believe a child has provided us with personal data, please contact
        us and we will delete it.
      </p>

      <h2>12. Changes to this policy</h2>
      <p>
        We may update this policy from time to time to reflect changes in our practices or
        legal requirements. The &quot;Last updated&quot; date at the top of the page indicates
        when the policy was last revised. Material changes will be brought to your attention
        by a prominent notice on the Service and, where we have your email address, by email
        before they take effect.
      </p>

      <h2>13. Contact</h2>
      <p>
        Data controller: <strong>{LEGAL_ENTITY.name}</strong>,{' '}
        {LEGAL_ENTITY.registrationLabel} {LEGAL_ENTITY.registrationNumber},{' '}
        {LEGAL_ENTITY.address.line1}, {LEGAL_ENTITY.address.district},{' '}
        {LEGAL_ENTITY.address.city}, {LEGAL_ENTITY.address.country}. Privacy contact:{' '}
        <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>.
      </p>
    </LegalLayout>
  );
}
