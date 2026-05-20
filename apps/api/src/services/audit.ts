// Thin wrapper for AuditLog inserts. Always non-throwing — auditing failure
// must never break the user-visible flow. Errors get logged via the request
// logger if a caller passes one.
import { prisma, type ActorType } from '@rustskinpay/db';
import type { FastifyBaseLogger } from 'fastify';

export interface AuditEntry {
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function audit(entry: AuditEntry, log?: FastifyBaseLogger): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: entry.actorType,
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        metadata: (entry.metadata as object | undefined) ?? undefined,
      },
    });
  } catch (err) {
    log?.warn({ err, entry }, 'audit log write failed');
  }
}
