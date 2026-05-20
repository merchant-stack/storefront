'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { fetchMe, logout, steamLoginUrl, type SessionUser } from '@/lib/api';

export const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [query, setQuery] = useState('');
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
    const onScroll = () => setScrolled(window.scrollY > 6);
    document.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const onLogout = async () => {
    await logout();
    setUser(null);
    setMenuOpen(false);
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/market?q=${encodeURIComponent(q)}` : '/market');
  };

  const navLink = (href: string, label: string) => {
    const active = href === '/market' ? pathname.startsWith('/market') : pathname === href;
    return (
      <Link
        href={href}
        className={`relative inline-flex h-9 items-center px-3 text-sm font-medium transition-colors ${
          active ? 'text-white' : 'text-zinc-400 hover:text-white'
        }`}
      >
        {label}
        {active ? (
          <span className="absolute inset-x-3 bottom-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent" />
        ) : null}
      </Link>
    );
  };

  return (
    <>
      <header
        className={`sticky top-0 z-30 transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/[0.08] bg-zinc-950/85 backdrop-blur-xl shadow-[0_1px_0_0_rgba(255,90,31,0.08)]'
            : 'border-b border-white/[0.04] bg-zinc-950/60 backdrop-blur'
        }`}
      >
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-8 px-6">
          {/* Brand */}
          <Link href="/" className="group flex items-center gap-3" aria-label="RustSkinPay home">
            <span className="font-display text-[19px] font-bold tracking-tight text-zinc-50">
              rustskin
              <span className="bg-gradient-to-r from-brand-400 via-brand to-brand-600 bg-clip-text text-transparent">
                pay
              </span>
              <span className="ml-0.5 inline-block h-1.5 w-1.5 -translate-y-2 rounded-full bg-brand shadow-glow transition-all group-hover:scale-125" />
            </span>
          </Link>

          {/* Nav (desktop) */}
          <nav className="hidden items-center md:flex">
            {navLink('/market', 'Market')}
            {user ? navLink('/account', 'Account') : null}
          </nav>

          {/* Search (centred, desktop) */}
          <form onSubmit={onSearch} className="ml-auto hidden flex-1 max-w-md md:block">
            <div className="relative">
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m21 21-4.34-4.34M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                />
              </svg>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Rust skins…"
                className="h-10 w-full rounded-lg border border-white/10 bg-white/[0.03] pl-10 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 transition-colors focus:border-brand/40 focus:bg-white/[0.05] focus:outline-none"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 lg:inline">
                ⏎
              </span>
            </div>
          </form>

          {/* Account */}
          <div className="ml-auto flex items-center gap-2 md:ml-0">
            {!loaded ? (
              <div className="h-9 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
            ) : user ? (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] py-1 pl-1 pr-2.5 transition-all hover:border-white/20 hover:bg-white/[0.06]"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
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
                  <span className="hidden max-w-[120px] truncate text-sm font-medium md:inline">
                    {user.displayName}
                  </span>
                  <svg
                    className={`h-3 w-3 text-zinc-500 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                  </svg>
                </button>
                {menuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-60 animate-fade-in overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur"
                  >
                    <div className="border-b border-white/[0.06] px-4 py-3">
                      <p className="truncate text-sm font-medium">{user.displayName}</p>
                      <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-500">
                        SteamID {user.steamId64}
                      </p>
                    </div>
                    <Link
                      href="/account"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                    >
                      <IconUser /> Account & trade URL
                    </Link>
                    <Link
                      href="/account#orders"
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                    >
                      <IconBox /> Order history
                    </Link>
                    <button
                      type="button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-3 border-t border-white/[0.06] px-4 py-2.5 text-left text-sm text-zinc-400 hover:bg-white/[0.05] hover:text-white"
                    >
                      <IconLogout /> Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <a href={steamLoginUrl()} className="btn-primary text-sm">
                <IconSteam /> Sign in
              </a>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen((o) => !o)}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-zinc-300 transition-colors hover:bg-white/[0.06] md:hidden"
              aria-label="Toggle menu"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
                {mobileOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen ? (
          <div className="animate-fade-in border-t border-white/[0.06] bg-zinc-950/95 backdrop-blur md:hidden">
            <div className="mx-auto max-w-7xl space-y-4 px-6 py-4">
              <form onSubmit={onSearch}>
                <div className="relative">
                  <svg
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m21 21-4.34-4.34M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
                    />
                  </svg>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Rust skins…"
                    className="input pl-10"
                  />
                </div>
              </form>
              <nav className="space-y-1">
                <Link
                  href="/market"
                  className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                >
                  Market
                </Link>
                {user ? (
                  <Link
                    href="/account"
                    className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-300 hover:bg-white/[0.05] hover:text-white"
                  >
                    Account
                  </Link>
                ) : null}
              </nav>
            </div>
          </div>
        ) : null}
      </header>
    </>
  );
};

const IconSteam = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
    <path d="M12 0C5.4 0 0 5.4 0 12c0 5.6 3.8 10.3 9 11.6l2.6-3.7c-.4-.1-.7-.2-1-.4-1.5-.8-2.4-2.3-2.4-3.9V15l4.1 1.7c1.3.5 2.8.3 3.8-.5 1.1-.8 1.7-2 1.7-3.3v-.2c0-2.4-2-4.3-4.4-4.3-1.6 0-3.1.9-3.9 2.3l-3.6-1.5C6.7 4.6 9.2 3 12 3c5 0 9 4 9 9s-4 9-9 9c-.5 0-.9 0-1.4-.1l1.4-2c4-.1 7.2-3.3 7.2-7.3 0-4-3.3-7.3-7.3-7.3-3 0-5.6 1.8-6.7 4.5l-.1.2L7.6 11C8 9.7 9.2 8.9 10.5 8.9c1.7 0 3 1.4 3 3.1 0 1.7-1.4 3.1-3.1 3.1-.9 0-1.7-.4-2.2-1l-2.1-.9c.6 1.9 2.4 3.3 4.5 3.3 2.6 0 4.7-2.1 4.7-4.7 0-2.5-2-4.6-4.5-4.7 1-.5 2.1-.7 3.2-.7 4 0 7.2 3.3 7.2 7.3 0 4-3.3 7.3-7.3 7.3-4 0-7.3-3.3-7.3-7.3 0-1.1.2-2.1.6-3l-3-1.2C1.2 8.9 1 10.4 1 12c0 6.1 4.9 11 11 11s11-4.9 11-11S18.1 0 12 0z" />
  </svg>
);

const IconUser = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 7.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Zm-3.75 7.5a8.25 8.25 0 0 0-7.5 4.5" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a8.25 8.25 0 0 1 7.5 4.5" />
  </svg>
);

const IconBox = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 9-4 9 4-9 4-9-4Zm0 0v10l9 4m0-14v14m0-14 9 4v10l-9 4" />
  </svg>
);

const IconLogout = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m0 0 3.75-3.75M3 12l3.75 3.75M15 3h3.75A2.25 2.25 0 0 1 21 5.25v13.5A2.25 2.25 0 0 1 18.75 21H15" />
  </svg>
);
