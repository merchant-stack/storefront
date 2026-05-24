'use client';

// App-level error boundary. Catches any unhandled client-side exception
// thrown during render (e.g. third-party browser extensions mutating the
// DOM out from under React, like Yandex.Browser's service-icon injector).
// Without this, the user sees Next.js's default white-screen "Application
// error" page; with this, they see a recoverable retry UI and can keep
// shopping after a Reset.
import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to the browser console for debugging; in prod we'd ship to Sentry
    // / equivalent. The error.digest is Next's stable identifier so we can
    // correlate with server-side logs.
    console.error('[global error boundary]', error.digest, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
      <h1 className="font-display text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
        Something went wrong
      </h1>
      <p className="mt-4 max-w-md text-sm text-zinc-400">
        The page hit an unexpected error. This is sometimes caused by a browser
        extension modifying the page. Try reloading, or open the site in an
        incognito window with extensions disabled.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => reset()}
          className="btn-primary px-6 py-3 text-sm"
        >
          Try again
        </button>
        <a
          href="/"
          className="text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          Or go to homepage
        </a>
      </div>
      {error.digest ? (
        <p className="mt-12 text-[10px] uppercase tracking-wider text-zinc-600">
          Reference: {error.digest}
        </p>
      ) : null}
    </main>
  );
}
