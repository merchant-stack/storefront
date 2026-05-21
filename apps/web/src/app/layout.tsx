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
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${jetbrainsMono.variable}`}>
      <body className="flex min-h-screen flex-col font-sans text-zinc-100 antialiased">
        <Header />
        <div className="flex-1">{children}</div>
        <Footer />
        <CookieBanner />
      </body>
    </html>
  );
}
