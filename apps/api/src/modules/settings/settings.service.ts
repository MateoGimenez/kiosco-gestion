// Configuración general (docs/api/productos-stock.md, sección 4). Una sola fila (id = 1).
import type { Request } from 'express';
import {
  ERROR_CODES,
  SettingsSchema,
  type Settings,
  type UpdateSettingsRequest,
} from '@kiosco/shared';
import { auditContext, writeAudit, writeAuditThrottled } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { dec, money, type Tx } from '../../lib/db';

const SETTINGS_INCLUDE = { updatedBy: { select: { id: true, fullName: true } } } as const;

/** 360 -> "06:00". */
export function minutesToCutoff(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const m = String(minutes % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** "05:30" -> 330. */
export function cutoffToMinutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

async function readRow(db: Tx) {
  const row = await db.setting.findUnique({ where: { id: 1 }, include: SETTINGS_INCLUDE });
  // La fila la crea la migración: si falta, es un problema de instalación, no del pedido.
  if (!row) throw new AppError(500, ERROR_CODES.INTERNAL_ERROR, 'Falta la configuración.');
  return row;
}

type SettingRow = Awaited<ReturnType<typeof readRow>>;

function toSettings(row: SettingRow): Settings {
  return parseResponse(SettingsSchema, {
    storeName: row.storeName,
    priceRoundingStep: money(row.priceRoundingStep),
    businessDayCutoff: minutesToCutoff(row.businessDayCutoffMinutes),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy ? { id: row.updatedBy.id, fullName: row.updatedBy.fullName } : null,
  });
}

/** Redondeo actual de precios (para el precio sugerido). */
export async function getRoundingStep(db: Tx): Promise<string> {
  const row = await db.setting.findUnique({
    where: { id: 1 },
    select: { priceRoundingStep: true },
  });
  return row ? money(row.priceRoundingStep) : '10.00';
}

export async function getSettings(ctx: AppContext): Promise<Settings> {
  return toSettings(await readRow(ctx.prisma));
}

export async function updateSettings(
  ctx: AppContext,
  req: Request,
  input: UpdateSettingsRequest,
): Promise<Settings> {
  const audit = auditContext(req);
  // La hora de corte no se cambia desde afuera del local (se valida según el cuerpo, como H-20).
  if (req.access === 'remote' && input.businessDayCutoff !== undefined) {
    await writeAuditThrottled(ctx, `user:${req.user?.id ?? 'sin-sesion'}`, {
      userId: req.user?.id ?? null,
      action: 'ACCESS_DENIED',
      entityType: 'Route',
      entityId: 'PATCH /api/settings',
      details: { reason: 'LOCAL_ONLY', change: 'BUSINESS_DAY_CUTOFF' },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    throw new AppError(
      403,
      ERROR_CODES.LOCAL_ONLY,
      'La hora de corte solo se puede cambiar desde el local.',
      { fields: ['businessDayCutoff'] },
    );
  }
  return ctx.prisma.$transaction(async (tx) => {
    // Se bloquea la fila para que el "antes" de la auditoría sea exacto.
    await tx.$queryRaw`SELECT id FROM settings WHERE id = 1 FOR UPDATE`;
    const current = await readRow(tx);
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    const data: {
      storeName?: string;
      priceRoundingStep?: string;
      businessDayCutoffMinutes?: number;
    } = {};

    if (input.storeName !== undefined && input.storeName !== current.storeName) {
      before.storeName = current.storeName;
      after.storeName = input.storeName;
      data.storeName = input.storeName;
    }
    if (
      input.priceRoundingStep !== undefined &&
      !dec(input.priceRoundingStep).eq(dec(current.priceRoundingStep))
    ) {
      before.priceRoundingStep = money(current.priceRoundingStep);
      after.priceRoundingStep = money(input.priceRoundingStep);
      data.priceRoundingStep = input.priceRoundingStep;
    }
    if (input.businessDayCutoff !== undefined) {
      const minutes = cutoffToMinutes(input.businessDayCutoff);
      if (minutes !== current.businessDayCutoffMinutes) {
        before.businessDayCutoff = minutesToCutoff(current.businessDayCutoffMinutes);
        after.businessDayCutoff = minutesToCutoff(minutes);
        data.businessDayCutoffMinutes = minutes;
      }
    }

    // Si no cambió nada: 200 sin tocar la fila ni auditar.
    if (Object.keys(after).length === 0) return toSettings(current);

    await tx.setting.update({
      where: { id: 1 },
      data: { ...data, updatedById: req.user?.id ?? null },
    });
    await writeAudit(tx, {
      userId: req.user?.id ?? null,
      action: 'SETTINGS_UPDATE',
      entityType: 'Setting',
      entityId: 1,
      details: { before, after },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return toSettings(await readRow(tx));
  });
}
