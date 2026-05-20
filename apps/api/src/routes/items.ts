// GET /api/items — public storefront listing, reads SourceItem.
// GET /api/items/:id — single item detail.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma, type Prisma } from '@rustskinpay/db';
import { env } from '../env.js';

const listQuerySchema = z.object({
  q: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  rarity: z.string().trim().min(1).optional(),
  priceMin: z.coerce.number().int().nonnegative().optional(),
  priceMax: z.coerce.number().int().positive().optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest']).default('newest'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(60).default(24),
  /** When 'true', cap results at MAX_BUY_PRICE_MINOR. Used by landing surfaces. */
  purchasableOnly: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const registerItemRoutes = (server: FastifyInstance): void => {
  server.get('/api/items', async (request, reply) => {
    const parse = listQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parse.error.flatten() });
    }
    const q = parse.data;

    const where: Prisma.SourceItemWhereInput = { available: true };
    const effectiveMax = q.purchasableOnly
      ? Math.min(q.priceMax ?? Number.MAX_SAFE_INTEGER, env.MAX_BUY_PRICE_MINOR)
      : q.priceMax;
    if (q.priceMin !== undefined || effectiveMax !== undefined) {
      where.salePriceMinor = {
        ...(q.priceMin !== undefined ? { gte: q.priceMin } : {}),
        ...(effectiveMax !== undefined ? { lte: effectiveMax } : {}),
      };
    }
    if (q.q) where.displayName = { contains: q.q, mode: 'insensitive' };
    if (q.type) where.type = { equals: q.type, mode: 'insensitive' };
    if (q.rarity) where.rarity = { equals: q.rarity, mode: 'insensitive' };

    const orderBy: Prisma.SourceItemOrderByWithRelationInput =
      q.sort === 'price_asc'
        ? { salePriceMinor: 'asc' }
        : q.sort === 'price_desc'
          ? { salePriceMinor: 'desc' }
          : { lastSyncedAt: 'desc' };

    // Dedup by displayName — Waxpeer often returns N listings of the same skin
    // at slightly different prices. Showing the same Orange Longsleeve five
    // times on the storefront is noise; one representative is enough.
    const rows = await prisma.sourceItem.findMany({
      where,
      orderBy,
      take: q.limit + 1,
      distinct: ['marketHashName'],
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        displayName: true,
        marketHashName: true,
        iconUrl: true,
        iconBackgroundColor: true,
        type: true,
        rarity: true,
        salePriceMinor: true,
        currency: true,
        lastSyncedAt: true,
      },
    });

    const hasMore = rows.length > q.limit;
    const sliced = hasMore ? rows.slice(0, q.limit) : rows;
    const items = sliced.map((it) => ({
      ...it,
      purchasable: it.salePriceMinor <= env.MAX_BUY_PRICE_MINOR,
    }));
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;

    return { items, nextCursor };
  });

  // Facet counts for filter sidebar. Returns distinct type + rarity values
  // among currently-available items, with counts. Cached weakly via Cache-Control
  // since the worker only refreshes every 5 minutes.
  server.get('/api/items/facets', async (_request, reply) => {
    const [types, rarities] = await Promise.all([
      prisma.sourceItem.groupBy({
        by: ['type'],
        where: { available: true, type: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { type: 'desc' } },
      }),
      prisma.sourceItem.groupBy({
        by: ['rarity'],
        where: { available: true, rarity: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { rarity: 'desc' } },
      }),
    ]);
    void reply.header('Cache-Control', 'public, max-age=60');
    return {
      types: types.map((t) => ({ value: t.type, count: t._count._all })),
      rarities: rarities.map((r) => ({ value: r.rarity, count: r._count._all })),
    };
  });

  server.get('/api/items/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const item = await prisma.sourceItem.findUnique({
      where: { id },
      select: {
        id: true,
        displayName: true,
        marketHashName: true,
        iconUrl: true,
        iconBackgroundColor: true,
        type: true,
        rarity: true,
        salePriceMinor: true,
        currency: true,
        available: true,
        lastSyncedAt: true,
      },
    });
    if (!item) return reply.code(404).send({ error: 'not_found' });
    return {
      item: { ...item, purchasable: item.salePriceMinor <= env.MAX_BUY_PRICE_MINOR },
    };
  });
};
