import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@rustskinpay/db';
import { readSession } from '../auth/session.js';
import { audit } from '../services/audit.js';

// Steam SteamID64 = SteamID3 + this base offset (universe=public, type=individual).
const STEAMID_BASE = 76561197960265728n;

/**
 * Trade URL format: https://steamcommunity.com/tradeoffer/new/?partner=<SteamID3>&token=<token>
 * The "partner" param is the Steam Account ID (SteamID3 = SteamID64 - 76561197960265728).
 * Returning the candidate SteamID64 lets the caller match it against the session.
 */
function parseTradeUrlSteamId64(tradeUrl: string): string | null {
  try {
    const u = new URL(tradeUrl);
    if (u.hostname !== 'steamcommunity.com') return null;
    if (u.pathname !== '/tradeoffer/new/') return null;
    const partner = u.searchParams.get('partner');
    const token = u.searchParams.get('token');
    if (!partner || !token) return null;
    if (!/^\d+$/.test(partner)) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
    const steamId3 = BigInt(partner);
    return (steamId3 + STEAMID_BASE).toString();
  } catch {
    return null;
  }
}

const tradeUrlSchema = z.object({
  tradeUrl: z.string().url(),
});

export const registerAccountRoutes = (server: FastifyInstance): void => {
  server.post(
    '/api/me/trade-url',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const session = readSession(request);
      if (!session) return reply.code(401).send({ error: 'not_authenticated' });

      const parse = tradeUrlSchema.safeParse(request.body);
      if (!parse.success) {
        return reply.code(400).send({ error: 'invalid_body', detail: parse.error.flatten() });
      }

      const candidate = parseTradeUrlSteamId64(parse.data.tradeUrl);
      if (!candidate) {
        return reply.code(400).send({ error: 'invalid_trade_url' });
      }
      if (candidate !== session.sid) {
        request.log.warn(
          { sessionSteamId: session.sid, tradeUrlSteamId: candidate },
          'trade url ownership mismatch',
        );
        return reply.code(403).send({ error: 'trade_url_not_owned' });
      }

      const before = await prisma.user.findUnique({
        where: { id: session.sub },
        select: { tradeUrl: true },
      });

      const user = await prisma.user.update({
        where: { id: session.sub },
        data: { tradeUrl: parse.data.tradeUrl },
        select: { id: true, tradeUrl: true },
      });

      // AuditLog: trade URL changes are a high-value target for account takeover.
      await audit(
        {
          actorType: 'USER',
          actorId: session.sub,
          action: before?.tradeUrl ? 'trade_url.changed' : 'trade_url.set',
          entityType: 'User',
          entityId: session.sub,
          metadata: { hadPrevious: Boolean(before?.tradeUrl) },
        },
        request.log,
      );

      return { user };
    },
  );
};
