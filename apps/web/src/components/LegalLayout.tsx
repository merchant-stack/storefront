import type { ReactNode } from 'react';

interface Props {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}

export const LegalLayout = ({ title, lastUpdated, children }: Props) => (
  <main className="mx-auto max-w-3xl px-6 py-16">
    <h1 className="font-display text-4xl font-bold">{title}</h1>
    {lastUpdated ? (
      <p className="mt-2 text-sm text-zinc-500">Last updated: {lastUpdated}</p>
    ) : null}
    <article className="prose prose-invert prose-zinc mt-10 max-w-none text-zinc-300 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-zinc-100 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:my-4 [&_p]:leading-relaxed [&_a]:text-brand [&_a]:no-underline hover:[&_a]:underline [&_ul]:my-4 [&_ul]:space-y-1 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-zinc-100">
      {children}
    </article>
  </main>
);
