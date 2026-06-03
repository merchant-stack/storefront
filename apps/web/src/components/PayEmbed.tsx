'use client';

// Embedded Whop checkout for the merchant deposit gateway (/pay/[id]).
//
// On onComplete we swap the embed for an in-page "Payment successful" screen
// (English) instead of bouncing the buyer straight away — they see a clear
// confirmation, then continue back to the merchant via returnUrl. When a real
// returnUrl is present we also auto-redirect after a short delay; when it's the
// bare "/" fallback (merchant sent no return_url) we DON'T redirect, so a
// cobalt buyer is never dumped onto our own storefront (white-label).
// Critically: the merchant's server-side credit logic does NOT trust this
// completion — they wait for our HMAC-signed webhook before crediting the
// user's balance. This screen + redirect is UX-only.
//
// Email persistence: on mount we read localStorage and pass it to Whop via
// `prefill` so the field is pre-filled for returning buyers. On completion
// we read it back via the embed controls ref and save it again (in case the
// buyer edited it before paying).

import { useRef, useEffect, useState } from 'react';
import { WhopCheckoutEmbed } from '@whop/checkout/react';
import { firePayEvent } from './PayAnalytics';

const EMAIL_KEY = 'checkout_email';
// Seconds to show the success screen before auto-returning to the merchant.
const AUTO_RETURN_SECONDS = 5;

interface Props {
  orderId: string;
  planId: string;
  returnUrl: string;
}

export const PayEmbed = ({ orderId, planId, returnUrl }: Props) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);
  const [savedEmail, setSavedEmail] = useState<string | undefined>(undefined);
  const [paid, setPaid] = useState(false);
  const interacted = useRef(false);

  // A real merchant return target (not the bare "/" fallback) is one we should
  // send the buyer back to; "/" means cobalt gave no return_url and we must
  // NOT redirect a white-label buyer onto our own storefront.
  const hasReturn = Boolean(returnUrl && returnUrl !== '/');

  useEffect(() => {
    try {
      const v = localStorage.getItem(EMAIL_KEY);
      if (v) setSavedEmail(v);
    } catch {
      // localStorage unavailable (private browsing) — skip silently
    }
  }, []);

  // After the success screen shows, auto-return to the merchant — but only
  // when there's a real returnUrl. Manual "Continue" is always available too.
  useEffect(() => {
    if (!paid || !hasReturn) return;
    const t = setTimeout(() => {
      window.location.href = returnUrl;
    }, AUTO_RETURN_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [paid, hasReturn, returnUrl]);

  const handleFormInteraction = () => {
    if (!interacted.current) {
      interacted.current = true;
      firePayEvent(orderId, 'user_interacted');
    }
  };

  if (paid) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-7 text-center shadow-sm">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
          </svg>
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-emerald-900">Payment successful</h2>
          <p className="mt-1.5 text-sm text-emerald-800/80">
            Your payment has been completed. You can safely close this window.
          </p>
        </div>
        {hasReturn ? (
          <a
            href={returnUrl}
            className="mt-2 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-zinc-800"
          >
            Continue →
          </a>
        ) : null}
      </div>
    );
  }

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
          // Save whatever email the buyer actually used, then show the success
          // screen (the auto-return effect handles the redirect from there).
          const maybePromise = controls.current?.getEmail?.() as Promise<string> | undefined;
          if (maybePromise && typeof maybePromise.then === 'function') {
            maybePromise
              .then((email: string) => {
                if (email) {
                  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
                }
                setPaid(true);
              })
              .catch(() => { setPaid(true); });
          } else {
            setPaid(true);
          }
        }}
      />
    </div>
  );
};
