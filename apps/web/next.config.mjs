/** @type {import('next').NextConfig} */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const IS_PROD = process.env.NODE_ENV === 'production';

const csp = [
  "default-src 'self'",
  // Next.js needs unsafe-inline + unsafe-eval in dev for HMR; in prod we allow
  // inline only for the small Next runtime + nonce-less style tags Next emits
  // (Tailwind compiled output is in self CSS files). Tightening further would
  // require a nonce-aware Next setup — defer.
  // js.whop.com hosts the embed loader (@whop/checkout) — required for the
  // in-page Whop checkout iframe on /checkout/[id].
  IS_PROD
    ? "script-src 'self' 'unsafe-inline' https://js.whop.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.whop.com",
  "style-src 'self' 'unsafe-inline'",
  // Item icons come from Steam's CDNs + dev placeholder host. Add more if other
  // sources (e.g. dmarket cdn) start appearing in payloads.
  //
  // yastatic.net is whitelisted so Yandex.Browser's auto-injected service-icon
  // SVGs (service_logo.svg / service_name.svg) load instead of being blocked.
  // When CSP blocks those, the extension's retry logic was mutating the DOM
  // aggressively enough to crash React's reconciliation. See layout.tsx
  // wrapper-div comment for the parallel runtime fix.
  "img-src 'self' data: blob: https://community.cloudflare.steamstatic.com https://steamcommunity-a.akamaihd.net https://placehold.co https://yastatic.net",
  "font-src 'self' data:",
  // API + Stripe + Whop embed callbacks are the only allowed XHR/fetch targets.
  `connect-src 'self' ${API_URL} https://api.stripe.com https://js.whop.com https://whop.com`,
  // Whop's embed mounts an iframe pointing at whop.com / js.whop.com to render
  // the actual card form; we need to allow it explicitly because frame-src
  // defaults to default-src (= 'self') under our policy.
  "frame-src 'self' https://js.whop.com https://whop.com",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  IS_PROD ? 'upgrade-insecure-requests' : '',
].filter(Boolean).join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // HSTS only when we're actually on HTTPS (hosting layer terminates TLS).
  ...(IS_PROD
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@rustskinpay/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'community.cloudflare.steamstatic.com' },
      { protocol: 'https', hostname: 'steamcommunity-a.akamaihd.net' },
      { protocol: 'https', hostname: 'placehold.co' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
