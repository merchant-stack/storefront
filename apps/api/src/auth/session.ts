import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../env.js';

export const SESSION_COOKIE = 'rustskinpay_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionPayload {
  sub: string; // User.id
  sid: string; // SteamID64
}

export const setSessionCookie = (
  reply: FastifyReply,
  payload: SessionPayload,
  isProduction: boolean,
): void => {
  const token = reply.server.jwt.sign(payload, { expiresIn: `${SESSION_TTL_SECONDS}s` });
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

export const clearSessionCookie = (reply: FastifyReply): void => {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
};

export const readSession = (request: FastifyRequest): SessionPayload | null => {
  const token = request.cookies[SESSION_COOKIE];
  if (!token) return null;
  try {
    const payload = request.server.jwt.verify<SessionPayload>(token);
    return payload;
  } catch {
    return null;
  }
};
