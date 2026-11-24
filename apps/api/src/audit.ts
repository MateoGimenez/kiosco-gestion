// Auditoría (NF-08): helper para escribir en AuditLog. Nunca recibe contraseñas ni tokens.
import { createHmac } from 'node:crypto';
import type { Request } from 'express';
import type { Logger } from 'pino';
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

/**
 * Limita cuánto pueden inflar la auditoría los eventos que cualquiera puede provocar
 * (ACCESS_DENIED, LOGIN_LOCKED): como máximo UNA fila por minuto por clave (IP o usuario).
 * En memoria; si hay demasiadas claves distintas, deja de escribir (el resto va solo al log).
 */
export class AuditThrottle {
  private readonly last = new Map<string, number>();

  constructor(
    private readonly intervalMs = 60_000,
    private readonly maxKeys = 5_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** True si corresponde escribir en la auditoría (y lo anota). */
  allow(key: string): boolean {
    const now = this.now();
    const prev = this.last.get(key);
    if (prev !== undefined && now - prev < this.intervalMs) return false;
    if (prev === undefined && this.last.size >= this.maxKeys) {
      for (const [k, t] of this.last) if (now - t >= this.intervalMs) this.last.delete(k);
      if (this.last.size >= this.maxKeys) return false;
    }
    this.last.set(key, now);
    return true;
  }
}

/** Lo que necesita `writeAuditThrottled` del contexto de la app. */
interface ThrottleDeps {
  prisma: Db;
  logger: Logger;
  auditThrottle: AuditThrottle;
}

/**
 * Audita un evento "provocable desde afuera" como máximo 1 vez por minuto por clave; lo demás
 * va solo al log. Nunca lanza: un fallo de la base no debe cambiar la respuesta.
 */
export async function writeAuditThrottled(
  deps: ThrottleDeps,
  throttleKey: string,
  entry: AuditEntry,
): Promise<void> {
  if (!deps.auditThrottle.allow(`${entry.action}:${throttleKey}`)) {
    deps.logger.warn(
      { action: entry.action, entityId: entry.entityId, channel: entry.channel },
      'Evento de seguridad no auditado (límite de 1 por minuto)',
    );
    return;
  }
  try {
    await writeAudit(deps.prisma, entry);
  } catch (err) {
    deps.logger.error({ err }, `No se pudo auditar ${entry.action}`);
  }
}

/**
 * HMAC (con una clave derivada de JWT_SECRET) de un nombre de usuario que no existe. Se guarda
 * en la auditoría en lugar de lo escrito: alguien pudo haber tipeado su contraseña en el campo
 * "usuario". Sirve para ver si el mismo nombre se repite, sin poder recuperarlo.
 */
export function usernameHmac(jwtSecret: string, value: string): string {
  const key = createHmac('sha256', jwtSecret).update('kiosco:audit:unknown-username:v1').digest();
  return createHmac('sha256', key).update(value).digest('hex').slice(0, 16);
}
