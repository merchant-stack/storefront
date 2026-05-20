// Prometheus metrics for the API. Exposed on GET /metrics (gated by an env flag
// so it's not publicly scrapable in prod without intent).
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
registry.setDefaultLabels({ app: 'rustskinpay-api' });
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests processed.',
  labelNames: ['method', 'route', 'status'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds.',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

export const stripeWebhooksTotal = new Counter({
  name: 'stripe_webhooks_total',
  help: 'Stripe webhook events received, by type + outcome.',
  labelNames: ['type', 'outcome'],
  registers: [registry],
});

export const checkoutsCreated = new Counter({
  name: 'checkouts_created_total',
  help: 'Checkout sessions created.',
  labelNames: ['outcome'],
  registers: [registry],
});
