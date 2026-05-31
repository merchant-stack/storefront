'use client';

// Embedded Whop checkout for the merchant deposit gateway (/pay/[id]).
//
// On onComplete we redirect to the merchant's returnUrl with a success token
// in the URL so the merchant page can show a "thanks" message immediately.
// Critically: the merchant's server-side credit logic does NOT trust this
// redirect — they wait for our HMAC-signed webhook before crediting the
// user's balance. The redirect is UX-only.
//
// Email persistence: on mount we read localStorage and pass it to Whop via
// `prefill` so the field is pre-filled for returning buyers. On completion
// we read it back via the embed controls ref and save it again (in case the
// buyer edited it before paying).

import { useRef, useEffect, useState } from 'react';
import { WhopCheckoutEmbed } from '@whop/checkout/react';
import { firePayEvent } from './PayAnalytics';

const EMAIL_KEY = 'checkout_email';

interface Props {
  orderId: string;
  planId: string;
  returnUrl: string;
}

export const PayEmbed = ({ orderId, planId, returnUrl }: Props) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const [savedEmail, setSavedEmail] = useState<string | undefined>(undefined);
  const interacted = useRef(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(EMAIL_KEY);
      if (v) setSavedEmail(v);
    } catch {
      // localStorage unavailable (private browsing) — skip silently
    }
  }, []);

  const handleFormInteraction = () => {
    if (!interacted.current) {
      interacted.current = true;
      firePayEvent(orderId, 'user_interacted');
    }
  };

  return (
    <div
      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
      onPointerDown={handleFormInteraction}
    >
      <WhopCheckoutEmbed
        ref={controls}
        planId={planId}
        prefill={savedEmail ? { email: savedEmail } : undefined}
        // Light theme deliberately: matches the surrounding light page chrome
        // (see CheckoutShell.tsx) and dodges Whop's dark-theme dropdown bug
        // where the country dropdown popup renders gray-on-white inside their iframe.
        theme="light"
        styles={{ container: { paddingX: 16, paddingY: 24 } }}
        onComplete={() => {
          firePayEvent(orderId, 'payment_complete');
          // Try to save whatever email the buyer actually used before redirecting.
          const maybePromise = controls.current?.getEmail?.() as Promise<string> | undefined;
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise
              .then((email: string) => {
                if (email) {
                  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
                }
                window.location.href = returnUrl;
              })
              .catch(() => { window.location.href = returnUrl; });
          } else {
            window.location.href = returnUrl;
          }
        }}
      />
    </div>
  );
};
