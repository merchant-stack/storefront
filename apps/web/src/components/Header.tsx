'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fetchMe, logout, steamLoginUrl, type SessionUser } from '@/lib/api';

export const Header = () => {
  const pathname = usePathname();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void fetchMe().then((u) => {
      setUser(u);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const onLogout = async () => {
    await logout();
    setUser(null);
    setMenuOpen(false);
  };

  const navLink = (href: string, label: string) => {
    const active = pathname === href || (href !== '/' && pathname.startsWith(href));
    return (
      <Link
        href={href}
        className={`relative px-3 py-1.5 text-sm font-medium transition-colors ${
          active ? 'text-white' : 'text-zinc-400 hover:text-white'
        }`}
      >
        {label}
        {active ? (
          <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand" />
        ) : null}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-brand/15 ring-1 ring-brand/30 transition-all group-hover:bg-brand/25 group-hover:ring-brand/50">
              <span className="font-display text-sm font-black text-brand">R</span>
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              RustSkin<span className="text-brand">Pay</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navLink('/market', 'Market')}
            {user ? navLink('/account', 'Account') : null}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!loaded ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-white/[0.04]" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
              >
                {user.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-md ring-1 ring-white/10"
                  />
                ) : (
                  <div className="grid h-7 w-7 place-items-center rounded-md bg-zinc-800 text-xs font-semibold">
                    {user.displayName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <span className="hidden text-sm font-medium sm:block">{user.displayName}</span>
                <svg
                  className={`h-3.5 w-3.5 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                </svg>
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-full mt-2 w-56 animate-fade-in overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur">
                  <div className="border-b border-white/[0.06] px-4 py-3">
                    <p className="truncate text-sm font-medium">{user.displayName}</p>
                    <p className="truncate font-mono text-xs text-zinc-500">{user.steamId64}</p>
                  </div>
                  <Link
                    href="/account"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    Account & trade URL
                  </Link>
                  <Link
                    href="/account#orders"
                    className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    Order history
                  </Link>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="flex w-full items-center gap-2 border-t border-white/[0.06] px-4 py-2.5 text-left text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <a href={steamLoginUrl()} className="btn-primary text-sm">
              <SteamIcon />
              Sign in with Steam
            </a>
          )}
        </div>
      </div>
    </header>
  );
};

const SteamIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M12 0C5.4 0 0 5.4 0 12c0 5.6 3.8 10.3 9 11.6l2.6-3.7c-.4-.1-.7-.2-1-.4-1.5-.8-2.4-2.3-2.4-3.9V15l4.1 1.7c1.3.5 2.8.3 3.8-.5 1.1-.8 1.7-2 1.7-3.3v-.2c0-2.4-2-4.3-4.4-4.3-1.6 0-3.1.9-3.9 2.3l-3.6-1.5C6.7 4.6 9.2 3 12 3c5 0 9 4 9 9s-4 9-9 9c-.5 0-.9 0-1.4-.1l1.4-2c4-.1 7.2-3.3 7.2-7.3 0-4-3.3-7.3-7.3-7.3-3 0-5.6 1.8-6.7 4.5l-.1.2L7.6 11C8 9.7 9.2 8.9 10.5 8.9c1.7 0 3 1.4 3 3.1 0 1.7-1.4 3.1-3.1 3.1-.9 0-1.7-.4-2.2-1l-2.1-.9c.6 1.9 2.4 3.3 4.5 3.3 2.6 0 4.7-2.1 4.7-4.7 0-2.5-2-4.6-4.5-4.7 1-.5 2.1-.7 3.2-.7 4 0 7.2 3.3 7.2 7.3 0 4-3.3 7.3-7.3 7.3-4 0-7.3-3.3-7.3-7.3 0-1.1.2-2.1.6-3l-3-1.2C1.2 8.9 1 10.4 1 12c0 6.1 4.9 11 11 11s11-4.9 11-11S18.1 0 12 0z" />
  </svg>
);
