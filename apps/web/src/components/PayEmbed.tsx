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
    <div className="rounded-xl border border-white/[0.08] bg-zinc-950/60 p-1">
      <WhopCheckoutEmbed
        planId={planId}
        theme="dark"
        styles={{ container: { paddingX: 0, paddingY: 16 } }}
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
