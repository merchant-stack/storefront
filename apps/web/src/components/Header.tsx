'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchMe, logout, steamLoginUrl, type SessionUser } from '@/lib/api';

export const Header = () => {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      setLoaded(true);
    });
  }, []);

  const onLogout = async () => {
    await logout();
    setUser(null);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          RustSkin<span className="text-brand">Pay</span>
        </Link>
        <nav className="flex items-center gap-4 text-sm text-neutral-300">
          <Link href="/market" className="hover:text-white">
            Market
          </Link>
          {!loaded ? (
            <span className="text-neutral-500">…</span>
          ) : user ? (
            <div className="flex items-center gap-3">
              <Link href="/account" className="flex items-center gap-2 hover:text-white">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    className="h-7 w-7 rounded-full"
                  />
                ) : null}
                <span className="hidden sm:inline">{user.displayName}</span>
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="rounded border border-neutral-700 px-3 py-1 text-xs hover:border-neutral-500"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href={steamLoginUrl()}
              className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              Sign in with Steam
            </a>
          )}
        </nav>
      </div>
    </header>
  );
};
