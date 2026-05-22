import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';
import { getRedis } from '../services/redis.js';

export const SESSION_COOKIE = 'rustskinpay_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string; // User.id
  sid: string; // SteamID64
  // Unique session identifier — stored in Redis at session creation, deleted
  // on logout. readSession refuses any token whose jti is no longer in Redis,
  // making logout a real revocation rather than just a cookie clear.
  jti: string;
}

const redisKey = (jti: string): string => `session:${jti}`;

export const setSessionCookie = async (
  reply: FastifyReply,
  payload: Omit<SessionPayload, 'jti'>,
  isProduction: boolean,
): Promise<void> => {
  const jti = randomUUID();
  const fullPayload: SessionPayload = { ...payload, jti };
  const token = reply.server.jwt.sign(fullPayload, { expiresIn: `${SESSION_TTL_SECONDS}s` });
  // Anchor the session in Redis. Value carries the user id so audit logs /
  // future "active sessions" UIs can list a buyer's live cookies.
  await getRedis().set(redisKey(jti), payload.sub, 'EX', SESSION_TTL_SECONDS);
  // SameSite=None requires Secure=true (Chrome / Safari enforce this since 2020).
  // We auto-promote secure when SameSite=None even in dev, so a misconfigured
  // dev setup fails closed rather than silently dropping the cookie.
  const secure = isProduction || env.SESSION_SAMESITE === 'none';
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: env.SESSION_SAMESITE,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
};

export const clearSessionCookie = async (
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> => {
  // Extract the jti from the live cookie so we can delete the matching Redis
  // key — this is what turns "logout" into actual revocation. A stolen cookie
  // captured before logout becomes useless the moment logout runs.
  const token = request.cookies[SESSION_COOKIE];
  if (token) {
    try {
      const payload = request.server.jwt.verify<SessionPayload>(token);
      if (payload.jti) {
        await getRedis().del(redisKey(payload.jti));
      }
    } catch {
      // Token expired or invalid — nothing to revoke server-side. Still clear
      // the cookie below.
    }
  }
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
};

export const readSession = async (
  request: FastifyRequest,
): Promise<SessionPayload | null> => {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = request.server.jwt.verify<SessionPayload>(token);
    if (!payload.jti) return null;
    const exists = await getRedis().exists(redisKey(payload.jti));
    if (!exists) return null;
    return payload;
  } catch {
    return null;
  }
};
