import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Header } from '@/components/Header';
import './globals.css';

export const metadata: Metadata = {
  title: 'RustSkinPay — Rust skins, instant trades',
  description: 'Buy and sell Rust skins with instant Steam delivery.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
        <Header />
        {children}
      </body>
    </html>
  );
}
