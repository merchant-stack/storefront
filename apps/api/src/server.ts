import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import rawBody from 'fastify-raw-body';
import { env } from './env.js';
import { httpRequestDurationSeconds, httpRequestsTotal, registry } from './services/metrics.js';
import { registerAuthRoutes } from './auth/routes.js';
import { registerItemRoutes } from './routes/items.js';
import { registerCheckoutRoutes } from './routes/checkout.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerAccountRoutes } from './routes/account.js';
import { registerDevRoutes } from './routes/dev.js';

/**
 * Pino log redaction: never let secrets / signing material reach logs. Applies
 * across all log levels including request/response auto-logs and any explicit
 * server.log.{info,error} calls anywhere in the codebase.
 */
const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["x-api-key"]',
  'req.headers["x-request-sign"]',
  'req.headers["stripe-signature"]',
  'res.headers["set-cookie"]',
  '*.DMARKET_SECRET_KEY',
  '*.DMARKET_PUBLIC_KEY',
  '*.STRIPE_SECRET_KEY',
  '*.STRIPE_WEBHOOK_SECRET',
  '*.STEAM_BOT_PASSWORD',
  '*.STEAM_BOT_SHARED_SECRET',
  '*.STEAM_BOT_IDENTITY_SECRET',
  '*.STEAM_API_KEY',
  '*.COOKIE_SECRET',
];

export const buildServer = (): FastifyInstance => {
  const server = Fastify({
    logger:
      env.NODE_ENV === 'development'
        ? {
            transport: { target: 'pino-pretty', options: { colorize: true } },
            redact: { paths: REDACT_PATHS, censor: '[redacted]' },
          }
        : {
            level: 'info',
            redact: { paths: REDACT_PATHS, censor: '[redacted]' },
          },
    trustProxy: true,
    // Strip stack traces from any 5xx error response sent to client in prod.
    disableRequestLogging: false,
  });

  // Helmet — security headers. CSP only matters where we serve HTML (we don't
  // here — the API returns JSON), but the rest are still useful for any
  // accidental HTML response, and as defense-in-depth behind any future proxy.
  void server.register(helmet, {
    contentSecurityPolicy: false, // API is JSON-only; let web set its own CSP.
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    frameguard: { action: 'deny' },
    strictTransportSecurity:
      env.NODE_ENV === 'production'
        ? { maxAge: 60 * 60 * 24 * 365, includeSubDomains: true, preload: true }
        : false,
  });

  // Rate limit — applies globally with sensible per-IP defaults. Stricter
  // limits get attached per-route via `config.rateLimit` overrides on the
  // sensitive routes themselves.
  void server.register(rateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    cache: 10_000,
    allowList: (req) => req.url === '/health',
    keyGenerator: (req) => (req.ip ? req.ip : 'unknown'),
  });

  void server.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: true,
  });
  void server.register(cookie, { secret: env.COOKIE_SECRET });
  // JWT uses its own secret + binds aud/iss so a token signed for another
  // service (or with a leaked cookie secret) cannot be replayed against us.
  void server.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { aud: 'rustsupply-session', iss: env.API_ORIGIN },
    verify: { allowedAud: 'rustsupply-session', allowedIss: env.API_ORIGIN },
  });
  void server.register(rawBody, {
    field: 'rawBody',
    global: false,
    encoding: 'utf8',
    runFirst: true,
  });

  // Origin-check CSRF defense for state-changing requests. SameSite=Lax cookies
  // already block most CSRF, but a simple HTML form POST from another origin
  // still sends cookies and isn't preflighted by CORS. Reject any non-GET that
  // doesn't come from our web origin. Exempt the Stripe webhook which is
  // signed and authenticated by its own X-Signature header.
  server.addHook('onRequest', async (request, reply) => {
    const method = request.method.toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return;
    if (request.url.startsWith('/api/webhooks/')) return; // signed by provider
    const origin = request.headers.origin;
    const referer = request.headers.referer;
    // If neither origin nor referer is present, refuse (could be curl or
    // server-side, but state changes must be from our SPA). Accept either an
    // exact match in the allowed-origins list, or a referer that starts with
    // any allowed origin.
    const originOk = typeof origin === 'string' && env.ALLOWED_ORIGINS.includes(origin);
    const refererOk =
      typeof referer === 'string' &&
      env.ALLOWED_ORIGINS.some((o) => referer.startsWith(`${o}/`));
    if (!originOk && !refererOk) {
      request.log.warn({ origin, referer, url: request.url }, 'csrf: origin mismatch');
      return reply.code(403).send({ error: 'csrf_blocked' });
    }
  });

  // Prod error handler: never leak internals. Dev keeps the default which
  // bubbles up stack traces (helpful while iterating).
  if (env.NODE_ENV === 'production') {
    server.setErrorHandler((err: FastifyError, request, reply) => {
      request.log.error({ err, url: request.url }, 'request failed');
      const status =
        err.statusCode && err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;
      reply
        .code(status)
        .send({ error: status >= 500 ? 'internal_error' : err.message || 'error' });
    });
  }

  server.get('/health', () => ({ ok: true, service: 'rustskinpay-api' }));

  // Prometheus metrics endpoint. Gated by a bearer token so scrapers can hit
  // it without exposing business signal (revenue, traffic spikes, error rates)
  // to the public web. When METRICS_BEARER_TOKEN is unset in production the
  // endpoint 404s — so an attacker can't tell metrics exist at all.
  server.get('/metrics', async (request, reply) => {
    if (env.NODE_ENV === 'production') {
      if (!env.METRICS_BEARER_TOKEN) {
        return reply.code(404).send();
      }
      const auth = request.headers.authorization;
      const expected = `Bearer ${env.METRICS_BEARER_TOKEN}`;
      if (typeof auth !== 'string' || auth !== expected) {
        return reply.code(404).send();
      }
    }
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });

  // Per-request metrics. `routeOptions.url` collapses parameterised paths to
  // the route template (`/api/items/:id`) so we don't blow up cardinality.
  server.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions?.url ?? 'unknown';
    if (route === '/metrics' || route === '/health') return;
    const labels = {
      method: request.method,
      route,
      status: String(reply.statusCode),
    };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, reply.elapsedTime / 1000);
  });

  void server.register(async (instance) => {
    registerAuthRoutes(instance);
    registerItemRoutes(instance);
    registerCheckoutRoutes(instance);
    registerWebhookRoutes(instance);
    registerAccountRoutes(instance);
    registerDevRoutes(instance);
  });

  return server;
};
