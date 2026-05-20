export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-5xl font-bold tracking-tight">
        RustSkin<span className="text-brand">Pay</span>
      </h1>
      <p className="max-w-xl text-lg text-neutral-400">
        Buy Rust skins with instant Steam delivery. Pay once — we source the item, our bot sends it
        to your Steam account. No listing, no waiting, no escrow.
      </p>
      <a
        href="/market"
        className="mt-2 rounded-md bg-brand px-5 py-2.5 text-base font-medium text-white hover:bg-brand-dark"
      >
        Browse skins
      </a>
    </main>
  );
}
