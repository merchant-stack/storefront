'use client';

// Embedded Whop checkout for the merchant deposit gateway (/pay/[id]).
//
// On onComplete we redirect to the merchant's returnUrl with a success token
// in the URL so the merchant page can show a "thanks" message immediately.
// Critically: the merchant's server-side credit logic does NOT trust this
// redirect — they wait for our HMAC-signed webhook before crediting the
// user's balance. The redirect is UX-only.
//
// Email is collected in our own field above the Whop iframe (Whop's built-in
// email input is hidden via hideEmail). We persist it to localStorage so
// returning buyers don't have to retype it.

import { useEffect, useState } from 'react';
import { WhopCheckoutEmbed } from '@whop/checkout/react';

const EMAIL_KEY = 'checkout_email';

interface Props {
  planId: string;
  returnUrl: string;
}

export const PayEmbed = ({ planId, returnUrl }: Props) => {
  const [email, setEmail] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(EMAIL_KEY);
      if (saved) setEmail(saved);
    } catch {
      // localStorage unavailable (private browsing) — skip silently
    }
  }, []);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setEmail(v);
    try { localStorage.setItem(EMAIL_KEY, v); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <label className="block px-5 pt-4 pb-3">
          <span className="mb-1.5 block text-sm font-medium text-zinc-700">Email</span>
          <input
            type="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-zinc-400 focus:bg-white focus:ring-2 focus:ring-zinc-200"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <WhopCheckoutEmbed
          planId={planId}
          prefill={email ? { email } : undefined}
          hideEmail
          // Light theme deliberately: matches the surrounding light page chrome
          // (see CheckoutShell.tsx) and dodges Whop's dark-theme dropdown bug
          // where the country dropdown popup renders gray-on-white inside their iframe.
          theme="light"
          styles={{ container: { paddingX: 16, paddingY: 24 } }}
          onComplete={() => {
            window.location.href = returnUrl;
          }}
        />
      </div>
    </div>
  );
};
