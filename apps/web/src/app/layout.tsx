import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { CookieBanner } from '@/components/CookieBanner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'RustSupply — Buy Rust skins, instant Steam delivery',
    template: '%s — RustSupply',
  },
  description:
    'Buy Rust skins with instant Steam delivery. Pay once — we handle the rest. No listing, no escrow, no waiting.',
  metadataBase: new URL('https://rustsupply.com'),
  openGraph: {
    title: 'RustSupply',
    description: 'Buy Rust skins with instant Steam delivery.',
    type: 'website',
  },
  twitter: { card: 'summary_large_image' },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      {/*
       * suppressHydrationWarning + wrapping the whole React tree in a single
       * #app div isolates React's reconciliation from third-party DOM mutation.
       * Specifically: Yandex.Browser injects service-icon SVGs directly into
       * <body> on every navigation. Without the wrapper, React's body-child
       * `insertBefore` operations bumped into the injected nodes and crashed
       * the whole client tree with "Failed to execute 'insertBefore' on Node".
       * With the wrapper, the extension's nodes live as siblings of #app and
       * React only ever traverses inside #app.
       */}
      <body
        className="flex min-h-screen flex-col font-sans text-zinc-100 antialiased"
        suppressHydrationWarning
      >
        <div id="app" className="flex min-h-screen flex-col">
          <Header />
          <div className="flex-1">{children}</div>
          <Footer />
          <CookieBanner />
        </div>
      </body>
    </html>
  );
}
