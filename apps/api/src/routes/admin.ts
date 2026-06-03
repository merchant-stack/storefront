// GET /api/admin/analytics — pay-page funnel data for the internal dashboard.
//
// Auth: valid session + role === ADMIN. Returns 403 for any other role so
// the response is indistinguishable from "not found" to scanners.

import type { FastifyInstance } from 'fastify';
import { prisma } from '@rustskinpay/db';
import { readSession } from '../auth/session.js';

export const registerAdminRoutes = (server: FastifyInstance): void => {
  server.get('/api/admin/analytics', async (request, reply) => {
    const session = await readSession(request);
    if (!session) return reply.code(401).send({ error: 'not_authenticated' });

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { role: true },
    });
    if (!user || user.role !== 'ADMIN') {
      return reply.code(403).send({ error: 'forbidden' });
    }

    const days = Math.min(Number((request.query as Record<string, string>).days ?? 7), 90);
    const since = new Date(Date.now() - days * 86_400_000);

    // ---- funnel ----
    const [totalOrders, openedRaw, interactedRaw, paidRaw, tabClosedRaw] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: since } } }),
      prisma.payPageEvent.findMany({
        where: { eventType: 'page_opened', occurredAt: { gte: since } },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      prisma.payPageEvent.findMany({
        where: { eventType: 'user_interacted', occurredAt: { gte: since } },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      prisma.payPageEvent.findMany({
        where: { eventType: 'payment_complete', occurredAt: { gte: since } },
        select: { orderId: true },
        distinct: ['orderId'],
      }),
      prisma.payPageEvent.findMany({
        where: { eventType: 'tab_closed', occurredAt: { gte: since }, timeOnPageMs: { not: null } },
        select: { timeOnPageMs: true },
      }),
    ]);

    // ---- device breakdown (from page_opened events) ----
    const deviceRows = await prisma.payPageEvent.groupBy({
      by: ['deviceType'],
      where: { eventType: 'page_opened', occurredAt: { gte: since } },
      _count: { deviceType: true },
    });
    const devices: Record<string, number> = { mobile: 0, desktop: 0, tablet: 0 };
    for (const row of deviceRows) {
      const key = row.deviceType ?? 'desktop';
      devices[key] = (devices[key] ?? 0) + row._count.deviceType;
    }

    // ---- avg time on page ----
    const times = tabClosedRaw.map((r) => r.timeOnPageMs).filter((t): t is number => t !== null);
    const avgTimeMs = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;

    // ---- recent sessions ----
    const recentOrders = await prisma.order.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        totalAmountMinor: true,
        currency: true,
        status: true,
        createdAt: true,
      },
    });
    // PayPageEvent.orderId no longer has an FK relation to Order (so cobalt
    // cmvd sessions, which have no Order, can be recorded for the funnel +
    // devices above). Fetch this batch's events separately and group by id.
    const recentOrderIds = recentOrders.map((o) => o.id);
    const recentEvents = recentOrderIds.length
      ? await prisma.payPageEvent.findMany({
          where: { orderId: { in: recentOrderIds } },
          select: { orderId: true, eventType: true, deviceType: true, occurredAt: true },
          orderBy: { occurredAt: 'asc' },
        })
      : [];
    const eventsByOrder = new Map<string, { eventType: string; deviceType: string | null }[]>();
    for (const e of recentEvents) {
      const arr = eventsByOrder.get(e.orderId) ?? [];
      arr.push({ eventType: e.eventType, deviceType: e.deviceType });
      eventsByOrder.set(e.orderId, arr);
    }

    return reply.send({
      period_days: days,
      funnel: {
        created: totalOrders,
        opened: openedRaw.length,
        interacted: interactedRaw.length,
        paid: paidRaw.length,
      },
      devices,
      avg_time_on_page_ms: avgTimeMs,
      tab_closed_count: tabClosedRaw.length,
      recent_sessions: recentOrders.map((o) => {
        const evs = eventsByOrder.get(o.id) ?? [];
        return {
          order_id: o.id,
          amount_minor: o.totalAmountMinor,
          currency: o.currency,
          status: o.status,
          created_at: o.createdAt.toISOString(),
          events: evs.map((e) => e.eventType),
          device: evs[0]?.deviceType ?? null,
        };
      }),
    });
  });
};
