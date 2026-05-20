import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Neon drops idle connections aggressively; configure pg pool to close them
  // before Neon does and keep active ones alive via TCP keepalive.
  const adapter = new PrismaPg({
    connectionString: url,
    max: 5,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 30000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export const prisma: PrismaClient = globalThis.__prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export type { Prisma } from '@prisma/client';
export * from '@prisma/client';
