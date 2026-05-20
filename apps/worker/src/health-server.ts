// Minimal HTTP server for worker health + metrics. No frameworks — just node:http
// since the worker doesn't otherwise serve HTTP and we want zero startup cost.
import { createServer, type Server } from 'node:http';
import { Counter, Registry, collectDefaultMetrics } from 'prom-client';
import { queueConnection } from './queue.js';

const registry = new Registry();
registry.setDefaultLabels({ app: 'rustskinpay-worker' });
collectDefaultMetrics({ register: registry });

export const jobsProcessed = new Counter({
  name: 'worker_jobs_processed_total',
  help: 'Worker jobs processed, by queue + outcome.',
  labelNames: ['queue', 'outcome'],
  registers: [registry],
});

export const dmarketCalls = new Counter({
  name: 'worker_dmarket_calls_total',
  help: 'DMarket API calls made by the worker.',
  labelNames: ['endpoint', 'outcome'],
  registers: [registry],
});

let server: Server | null = null;

export function startHealthServer(port: number): void {
  if (server) return;
  server = createServer(async (req, res) => {
    if (!req.url) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (req.url === '/health' || req.url === '/healthz') {
      // Liveness: process is up. Distinct from readiness — Redis can be down
      // and the process is still alive (worker will reconnect on its own).
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'rustskinpay-worker' }));
      return;
    }
    if (req.url === '/ready') {
      // Readiness: Redis ping responds. Hosting platform can drain traffic.
      try {
        await queueConnection.ping();
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ready: true }));
      } catch (err) {
        res.writeHead(503, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ready: false, reason: (err as Error).message }));
      }
      return;
    }
    if (req.url === '/metrics') {
      const body = await registry.metrics();
      res.writeHead(200, { 'content-type': registry.contentType });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port);
}

export function stopHealthServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => {
      server = null;
      resolve();
    });
  });
}
