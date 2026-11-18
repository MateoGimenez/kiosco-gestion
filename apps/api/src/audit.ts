// Auditoría (NF-08): helper para escribir en AuditLog. Nunca recibe contraseñas ni tokens.
import type { Request } from 'express';
import type { AccessChannel, Prisma, PrismaClient } from './generated/client';
import { auditIp } from './network';

/** Cliente de Prisma o transacción: así se puede auditar dentro de la misma transacción. */
export type Db = PrismaClient | Prisma.TransactionClient;

export interface AuditEntry {
  userId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | number | null;
  details?: Prisma.InputJsonValue;
  channel: AccessChannel;
  ipAddress?: string | null;
}

export async function writeAudit(db: Db, entry: AuditEntry): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId == null ? null : String(entry.entityId).slice(0, 200),
      details: entry.details ?? {},
      channel: entry.channel,
      ipAddress: entry.ipAddress ?? null,
    },
  });
}

/** Puerta, IP informativa y (en la remota) usuario de Tailscale de un pedido. */
export function auditContext(req: Request): {
  channel: AccessChannel;
  ipAddress: string | null;
  tailscaleUser?: string;
} {
  const forwarded = req.headers['x-forwarded-for'];
  const tailscale = req.headers['tailscale-user-login'];
  return {
    channel: req.access === 'remote' ? 'REMOTE' : 'LOCAL',
    ipAddress: auditIp(
      req.access,
      req.socketAddress,
      Array.isArray(forwarded) ? forwarded.join(',') : forwarded,
    ),
    ...(req.access === 'remote' && typeof tailscale === 'string' && tailscale
      ? { tailscaleUser: tailscale.slice(0, 100) }
      : {}),
  };
}
