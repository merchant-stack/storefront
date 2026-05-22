import type { FastifyInstance } from 'fastify';
import { prisma } from '@rustskinpay/db';
import { env } from '../env.js';
import {
  buildSteamLoginUrl,
  fetchSteamPlayerSummary,
  verifySteamOpenId,
} from '../services/steam.js';
import { audit } from '../services/audit.js';
import { clearSessionCookie, readSession, setSessionCookie } from './session.js';

const apiOrigin = (): string => env.API_ORIGIN;

export const registerAuthRoutes = (server: FastifyInstance): void => {
  // Auth endpoints get a tighter rate limit — brute prevention and OpenID
  // callback should never be hit at high rates by a single IP.
  const authLimit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

  server.get('/auth/steam/login', authLimit, async (_request, reply) => {
    const loginUrl = buildSteamLoginUrl({
      returnTo: `${apiOrigin()}/auth/steam/callback`,
      realm: apiOrigin(),
    });
    return reply.redirect(loginUrl);
  });

  server.get('/auth/steam/callback', authLimit, async (request, reply) => {
    const query = request.query as Record<string, string | string[] | undefined>;

    const steamId64 = await verifySteamOpenId(query, `${apiOrigin()}/auth/steam/callback`);
    if (!steamId64) {
      return reply.redirect(`${env.WEB_ORIGIN}/?auth_error=invalid_openid`);
    }

    const summary = await fetchSteamPlayerSummary(steamId64, env.STEAM_API_KEY);

    const user = await prisma.user.upsert({
      where: { steamId64 },
      create: {
        steamId64,
        displayName: summary?.personaname ?? `Steam_${steamId64.slice(-6)}`,
        avatarUrl: summary?.avatarfull,
        lastLoginAt: new Date(),
      },
      update: {
        displayName: summary?.personaname ?? undefined,
        avatarUrl: summary?.avatarfull ?? undefined,
        lastLoginAt: new Date(),
      },
    });

    await setSessionCookie(reply, { sub: user.id, sid: steamId64 }, env.NODE_ENV === 'production');

    await audit(
      {
        actorType: 'USER',
        actorId: user.id,
        action: 'auth.login',
        entityType: 'User',
        entityId: user.id,
        metadata: { steamId64, ip: request.ip },
      },
      request.log,
    );

    return reply.redirect(env.WEB_ORIGIN);
  });

  server.post('/auth/logout', authLimit, async (request, reply) => {
    await clearSessionCookie(request, reply);
    return { ok: true };
  });

  server.get('/auth/me', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const session = await readSession(request);
    if (!session) {
      return reply.code(401).send({ error: 'not_authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.sub },
      select: {
        id: true,
        steamId64: true,
        displayName: true,
        avatarUrl: true,
        tradeUrl: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      await clearSessionCookie(request, reply);
      return reply.code(401).send({ error: 'user_not_found' });
    }

    return { user };
  });
};
