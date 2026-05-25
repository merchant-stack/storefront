'use client';

// Embedded Whop checkout for the merchant deposit gateway (/pay/[id]).
//
// On onComplete we redirect to the merchant's returnUrl with a success token
// in the URL so the merchant page can show a "thanks" message immediately.
// Critically: the merchant's server-side credit logic does NOT trust this
// redirect — they wait for our HMAC-signed webhook before crediting the
// user's balance. The redirect is UX-only.

import { WhopCheckoutEmbed } from '@whop/checkout/react';

interface Props {
  planId: string;
  returnUrl: string;
}

export const PayEmbed = ({ planId, returnUrl }: Props) => {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <WhopCheckoutEmbed
        planId={planId}
        // Light theme deliberately: matches the surrounding light page chrome
        // (see CheckoutShell.tsx) and dodges Whop's dark-theme dropdown bug
        // where the country popover renders gray-on-white. Revert to dark
        // once Whop fixes their popover contrast.
        theme="light"
        styles={{ container: { paddingX: 16, paddingY: 24 } }}
        onComplete={(_planId, _receiptId) => {
          // Merchant's webhook is what actually credits the user. This
          // redirect is just for the buyer's UX — their browser lands back
          // on the merchant's "thanks" page, which polls the merchant's own
          // backend for credit confirmation.
          window.location.href = returnUrl;
        }}
      />
    </div>
  );
};
