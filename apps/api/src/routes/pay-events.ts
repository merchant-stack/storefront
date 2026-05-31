// POST /api/pay-events — lightweight analytics beacon for the /pay page.
//
// Called client-side (including via navigator.sendBeacon) to record funnel
// events: page opened, user interacted with the form, payment complete,
// tab closed without paying, errors shown. No auth — orderId is the bearer
// (same pattern as /pay/:id). We validate orderId exists before writing so
// junk beacons can't inflate the table.
//
// Device type is derived server-side from the User-Agent so the client
// doesn't have to send it. Country derivation is deferred (store IP only;
// enrich offline or via a future job).

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@rustskinpay/db';

const ALLOWED_EVENTS = [
  'page_opened',
  'user_interacted',
  'payment_complete',
  'tab_closed',
  'error_shown',
] as const;

const bodySchema = z
  .object({
    orderId: z.string().min(1).max(40),
    eventType: z.enum(ALLOWED_EVENTS),
    timeOnPageMs: z.number().int().nonnegative().max(86_400_000).optional(),
    errorCode: z.string().max(120).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();

function parseDeviceType(ua: string): 'mobile' | 'tablet' | 'desktop' {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|opera mini|iemobile/i.test(ua)) return 'mobile';
  return 'desktop';
}

function headerStr(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

export const registerPayEventRoutes = (server: FastifyInstance): void => {
  server.post(
    '/api/pay-events',
    {
      config: {
        rateLimit: { max: 60, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_request' });
      }
      const { orderId, eventType, timeOnPageMs, errorCode, metadata } = parsed.data;

      // Validate orderId exists — prevents spurious writes for fabricated IDs.
      const exists = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!exists) {
        // Return 200 to avoid leaking whether an orderId is valid.
        return reply.code(200).send({ ok: true });
      }

      const ua = headerStr(request.headers['user-agent']) ?? '';
      const ip = request.ip ?? null;

      await prisma.payPageEvent.create({
        data: {
          orderId,
          eventType,
          ip,
          deviceType: parseDeviceType(ua),
          userAgent: ua.slice(0, 512),
          timeOnPageMs: timeOnPageMs ?? null,
          errorCode: errorCode ?? null,
          metadata: (metadata as object | undefined) ?? undefined,
        },
      });

      return reply.code(200).send({ ok: true });
    },
  );
};
