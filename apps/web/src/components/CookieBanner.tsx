'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'rsp-cookie-consent';

export const CookieBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      // localStorage may be unavailable (private mode); just don't show banner.
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ accepted: true, at: Date.now() }));
    } catch {
      // Same as above — fail open.
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl animate-fade-in rounded-xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur sm:inset-x-6 sm:bottom-6 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-300">
          We use essential cookies to keep you signed in and process payments. By using
          RustSupply you agree to our{' '}
          <Link href="/privacy" className="text-brand hover:underline">
            privacy policy
          </Link>
          .
        </p>
        <button type="button" onClick={accept} className="btn-primary shrink-0">
          Got it
        </button>
      </div>
    </div>
  );
};
