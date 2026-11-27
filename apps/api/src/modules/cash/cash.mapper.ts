// Mapeo de filas de caja a respuestas por rol (docs/api/caja.md 2.1). Cada respuesta se arma campo
// por campo y se valida con el esquema de su rol: el empleado nunca recibe efectivo inicial ni arqueo.
import {
  CashMovementSchema,
  CashSessionNoteSchema,
  CashSessionPublicSchema,
  CashSessionSchema,
  type CashMovement,
  type CashSession,
  type CashSessionNote,
  type CashSessionPublic,
  type OpeningVsPreviousClose,
  type PreviousClosing,
  type UserRole,
} from '@kiosco/shared';
import { parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateToDateOnly } from '../../lib/dates';
import { money, type Tx } from '../../lib/db';

export const CASH_INCLUDE = {
  openedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } },
  previousCashSession: { select: { id: true, countedCash: true } },
} as const;
export type CashRow = Prisma.CashSessionGetPayload<{ include: typeof CASH_INCLUDE }>;

/** Lo que ve cualquier rol: nunca el efectivo inicial (el cierre es a ciegas, H-40 a). */
export function toCashSessionPublic(row: CashRow): CashSessionPublic {
  return parseResponse(CashSessionPublicSchema, {
    id: row.id,
    shift: row.shift,
    businessDate: dateToDateOnly(row.businessDate),
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    openedBy: { id: row.openedBy.id, fullName: row.openedBy.fullName },
  });
}

export function toCashSessionFull(row: CashRow): CashSession {
  return parseResponse(CashSessionSchema, {
    ...toCashSessionPublic(row),
    openingCash: money(row.openingCash),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedBy: row.closedBy ? { id: row.closedBy.id, fullName: row.closedBy.fullName } : null,
  });
}

/** Diferencia de apertura guardada al abrir (solo encargado y dueño). */
export function toOpeningVsPreviousClose(row: CashRow): OpeningVsPreviousClose | null {
  if (!row.previousCashSession?.countedCash || !row.openingDifference) return null;
  return {
    previousCashSessionId: row.previousCashSession.id,
    previousCountedCash: money(row.previousCashSession.countedCash),
    difference: money(row.openingDifference),
  };
}

/** Una función por rol: el empleado nunca recibe `openingCash`. */
export function toCashSessionForRole(
  row: CashRow,
  role: UserRole,
): CashSession | CashSessionPublic {
  return role === 'EMPLOYEE' ? toCashSessionPublic(row) : toCashSessionFull(row);
}

/** Lo contado en el cierre anterior (H-51 c): informativo, solo para encargado y dueño. */
export async function findPreviousClosing(
  db: Tx,
  beforeId?: number,
): Promise<PreviousClosing | null> {
  const row = await db.cashSession.findFirst({
    where: { status: 'CLOSED', ...(beforeId ? { id: { lt: beforeId } } : {}) },
    orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
  });
  if (!row?.closedAt || !row.countedCash) return null;
  return {
    cashSessionId: row.id,
    shift: row.shift,
    businessDate: dateToDateOnly(row.businessDate),
    closedAt: row.closedAt.toISOString(),
    countedCash: money(row.countedCash),
  };
}

export const MOVEMENT_INCLUDE = {
  user: { select: { id: true, fullName: true } },
  sale: { select: { id: true, cashSessionId: true } },
  supplierAccountEntry: { select: { supplier: { select: { id: true, name: true } } } },
} as const;
type MovementRow = Prisma.CashMovementGetPayload<{ include: typeof MOVEMENT_INCLUDE }>;

export function toCashMovement(row: MovementRow): CashMovement {
  return parseResponse(CashMovementSchema, {
    id: row.id,
    cashSessionId: row.cashSessionId,
    direction: row.direction,
    reason: row.reason,
    description: row.description,
    amount: money(row.amount),
    user: row.user,
    createdAt: row.createdAt.toISOString(),
    sale: row.sale ? { id: row.sale.id, cashSessionId: row.sale.cashSessionId } : null,
    supplierAccountEntryId: row.supplierAccountEntryId,
    supplier: row.supplierAccountEntry?.supplier ?? null,
  });
}

export const NOTE_INCLUDE = { user: { select: { id: true, fullName: true } } } as const;
type NoteRow = Prisma.CashSessionNoteGetPayload<{ include: typeof NOTE_INCLUDE }>;

export function toCashSessionNote(row: NoteRow): CashSessionNote {
  return parseResponse(CashSessionNoteSchema, {
    id: row.id,
    cashSessionId: row.cashSessionId,
    note: row.note,
    user: row.user,
    createdAt: row.createdAt.toISOString(),
  });
}
