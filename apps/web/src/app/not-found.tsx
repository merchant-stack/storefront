import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <div className="font-display text-8xl font-black text-brand opacity-90">404</div>
      <h1 className="mt-4 font-display text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-zinc-400">
        The page you&apos;re looking for has moved, was sold, or never existed.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className="btn-primary">
          Go home
        </Link>
        <Link href="/market" className="btn-secondary">
          Browse market
        </Link>
      </div>
    </main>
  );
}
