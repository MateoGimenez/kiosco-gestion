// Caja: abrir, cerrar a ciegas, ver la abierta, movimientos a mano y notas (docs/api/caja.md).
// Detalle y lista: cash.queries.ts.
import type { Request } from 'express';
import type { Logger } from 'pino';
import {
  calculateExpectedCash,
  CashSessionClosedPublicSchema,
  cashDifference,
  CurrentCashSessionResponseSchema,
  ERROR_CODES,
  getBusinessDate,
  type CashMovement,
  type CashSession,
  type CashSessionClosedPublic,
  type CashSessionDetail,
  type CashSessionNote,
  type CashSessionPublic,
  type CloseCashSessionRequest,
  type CreateCashMovementRequest,
  type CreateCashSessionNoteRequest,
  type CurrentCashSessionResponse,
  type OpenCashSessionRequest,
  type UserRole,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { dateOnlyToDate, dateToDateOnly } from '../../lib/dates';
import { isUniqueViolation, money, type Tx } from '../../lib/db';
import { getCutoffMinutes } from '../settings/settings.service';
import { buildCashSessionDetail, cashTotals } from './cash.queries';
import {
  CASH_INCLUDE,
  findPreviousClosing,
  MOVEMENT_INCLUDE,
  NOTE_INCLUDE,
  toCashMovement,
  toCashSessionForRole,
  toCashSessionNote,
  toCashSessionPublic,
} from './cash.mapper';

/** Día de trabajo de "ahora" según el reloj del servidor y la hora de corte. */
export async function currentBusinessDate(db: Tx, now = new Date()): Promise<string> {
  return getBusinessDate(now, await getCutoffMinutes(db));
}

/** H-04 b: el empleado solo cierra la caja que abrió él. */
const canUserClose = (user: { id: number; role: UserRole }, openedById: number) =>
  user.role !== 'EMPLOYEE' || openedById === user.id;

export async function getCurrent(
  ctx: AppContext,
  user: { id: number; role: UserRole },
  /** Solo para los tests con reloj simulado. */
  now = new Date(),
): Promise<CurrentCashSessionResponse> {
  const [row, businessDate] = await Promise.all([
    ctx.prisma.cashSession.findFirst({ where: { status: 'OPEN' }, include: CASH_INCLUDE }),
    currentBusinessDate(ctx.prisma, now),
  ]);
  const previousClosing =
    user.role === 'EMPLOYEE' ? null : await findPreviousClosing(ctx.prisma, row?.id);
  return parseResponse(CurrentCashSessionResponseSchema, {
    cashSession: row ? toCashSessionForRole(row, user.role) : null,
    currentBusinessDate: businessDate,
    isFromPreviousBusinessDay: row ? dateToDateOnly(row.businessDate) < businessDate : false,
    canClose: row ? canUserClose(user, row.openedById) : false,
    previousClosing,
  });
}

/** NF-18: al arrancar, deja en el log (warn) las cajas abiertas de un día de trabajo anterior. Solo informa. */
export async function warnStaleCashSessions(
  db: Tx,
  logger: Logger,
  now = new Date(),
): Promise<number> {
  const today = await currentBusinessDate(db, now);
  const stale = await db.cashSession.findMany({
    where: { status: 'OPEN', businessDate: { lt: dateOnlyToDate(today) } },
    include: CASH_INCLUDE,
  });
  for (const row of stale) {
    logger.warn(
      {
        cashSessionId: row.id,
        shift: row.shift,
        businessDate: dateToDateOnly(row.businessDate),
        openedBy: row.openedBy.fullName,
      },
      'Hay una caja abierta de un día anterior: hay que cerrarla (contando el efectivo).',
    );
  }
  return stale.length;
}

export async function openCashSession(
  ctx: AppContext,
  req: Request,
  input: OpenCashSessionRequest,
): Promise<CashSession | CashSessionPublic> {
  const user = req.user!;
  const audit = auditContext(req);
  try {
    // NO se consulta primero y se inserta después: eso deja pasar a dos pedidos a la vez. Lo
    // decide el índice único parcial `cash_sessions_single_open` (PA-02, CAJ-02).
    const row = await ctx.prisma.$transaction(async (tx) => {
      const now = new Date();
      const businessDate = getBusinessDate(now, await getCutoffMinutes(tx));
      const created = await tx.cashSession.create({
        data: {
          shift: input.shift,
          businessDate: dateOnlyToDate(businessDate),
          openedById: user.id,
          openedAt: now,
          openingCash: input.openingCash,
          status: 'OPEN',
        },
        include: CASH_INCLUDE,
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'CASH_SESSION_OPEN',
        entityType: 'CashSession',
        entityId: created.id,
        details: {
          shift: input.shift,
          businessDate,
          openingCash: money(input.openingCash),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return created;
    });
    return toCashSessionForRole(row, user.role);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // La transacción ya se deshizo: se lee la caja que ganó (sin efectivo inicial, sea cual sea el rol).
    const open = await ctx.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: CASH_INCLUDE,
    });
    throw new AppError(
      409,
      ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
      'Ya hay una caja abierta. Para abrir otra, primero hay que cerrar esa.',
      open ? { cashSession: toCashSessionPublic(open) } : undefined,
    );
  }
}

// --- Cerrar a ciegas (sección 10) ---------------------------------------------------------------------

/**
 * ORDEN DE BLOQUEO: el cierre toma SOLO la fila de la caja con FOR UPDATE (y nada más). Venta, anulación
 * y movimiento la leen con FOR SHARE (la venta y la anulación antes tomaron otros bloqueos, pero ninguno
 * espera algo que tenga el cierre), así que no hay ciclos: el cierre espera a los que están en curso y los
 * que llegan después ven la caja cerrada (422 CASH_SESSION_REQUIRED). Dos cierres: el segundo espera acá
 * y choca con el 409.
 */
export async function closeCashSession(
  ctx: AppContext,
  req: Request,
  id: number,
  input: CloseCashSessionRequest,
): Promise<CashSessionClosedPublic | CashSessionDetail> {
  const user = req.user!;
  const audit = auditContext(req);
  await ctx.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: number; status: string; opened_by_id: number }[]>`
      SELECT id, status::text AS status, opened_by_id FROM cash_sessions WHERE id = ${id} FOR UPDATE`;
    const current = locked[0];
    if (!current) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La caja no existe.');
    if (!canUserClose(user, current.opened_by_id)) {
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        'Esta caja la abrió otra persona. La puede cerrar quien la abrió, un encargado o el dueño.',
      );
    }
    if (current.status === 'CLOSED') {
      const closed = await tx.cashSession.findUniqueOrThrow({
        where: { id },
        select: { closedAt: true, closedBy: { select: { id: true, fullName: true } } },
      });
      throw new AppError(
        409,
        ERROR_CODES.CASH_SESSION_ALREADY_CLOSED,
        'Esta caja ya está cerrada.',
        {
          closedAt: closed.closedAt?.toISOString() ?? null,
          closedBy: closed.closedBy,
        },
      );
    }

    const row = await tx.cashSession.findUniqueOrThrow({ where: { id } });
    const totals = await cashTotals(tx, id);
    const expected = calculateExpectedCash({
      openingCash: row.openingCash.toString(),
      cashSales: totals.cashSales,
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
    });
    const difference = cashDifference(input.countedCash, expected);
    await tx.cashSession.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: user.id,
        countedCash: input.countedCash,
        expectedCash: expected.toFixed(2),
        difference: difference.toFixed(2),
        closingNote: input.closingNote,
      },
    });
    await writeAudit(tx, {
      userId: user.id,
      action: 'CASH_SESSION_CLOSE',
      entityType: 'CashSession',
      entityId: id,
      details: {
        shift: row.shift,
        businessDate: dateToDateOnly(row.businessDate),
        openedById: row.openedById,
        countedCash: money(input.countedCash),
        expectedCash: expected.toFixed(2),
        difference: difference.toFixed(2),
        closingNote: input.closingNote,
        summary: {
          openingCash: money(row.openingCash),
          cashSales: totals.cashSales.toFixed(2),
          cashIn: totals.cashIn.toFixed(2),
          cashOut: totals.cashOut.toFixed(2),
        },
      },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
  });

  // Etapa 8: acá va la copia de seguridad (fuera de la transacción; si falla, el cierre queda hecho).
  const row = await ctx.prisma.cashSession.findUniqueOrThrow({
    where: { id },
    include: CASH_INCLUDE,
  });
  if (user.role === 'EMPLOYEE') {
    // Se arma SOLO con los campos públicos del cierre: nunca el detalle recortado (caja.md 2.1).
    return parseResponse(CashSessionClosedPublicSchema, {
      ...toCashSessionPublic(row),
      closedAt: row.closedAt!.toISOString(),
      closedBy: { id: row.closedBy!.id, fullName: row.closedBy!.fullName },
      countedCash: money(row.countedCash!),
    });
  }
  return buildCashSessionDetail(ctx.prisma, id);
}

// --- Movimientos a mano (sección 11) -----------------------------------------------------------------

export async function createCashMovement(
  ctx: AppContext,
  req: Request,
  input: CreateCashMovementRequest,
): Promise<CashMovement> {
  const user = req.user!;
  const audit = auditContext(req);
  const created = await ctx.prisma.$transaction(async (tx) => {
    // Caja abierta con FOR SHARE: un cierre en curso espera y después este pedido ve la caja cerrada.
    const open = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
    if (!open[0]) {
      throw new AppError(
        422,
        ERROR_CODES.CASH_SESSION_REQUIRED,
        'No hay ninguna caja abierta. Abrí la caja para seguir.',
      );
    }
    const movement = await tx.cashMovement.create({
      data: {
        cashSessionId: open[0].id,
        direction: input.direction,
        reason: input.reason,
        description: input.description,
        amount: input.amount,
        userId: user.id,
      },
      include: MOVEMENT_INCLUDE,
    });
    await writeAudit(tx, {
      userId: user.id,
      action: input.direction === 'IN' ? 'CASH_MOVEMENT_IN' : 'CASH_MOVEMENT_OUT',
      entityType: 'CashMovement',
      entityId: movement.id,
      details: {
        cashSessionId: open[0].id,
        reason: input.reason,
        description: input.description,
        amount: money(input.amount),
      },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return movement;
  });
  return toCashMovement(created);
}

// --- Notas (sección 12) -----------------------------------------------------------------------------------

export async function addCashSessionNote(
  ctx: AppContext,
  req: Request,
  id: number,
  input: CreateCashSessionNoteRequest,
): Promise<CashSessionNote> {
  const user = req.user!;
  const audit = auditContext(req);
  const created = await ctx.prisma.$transaction(async (tx) => {
    // FOR SHARE: una caja cerrada nunca vuelve a abrirse, pero así el estado no cambia a mitad de camino.
    const rows = await tx.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM cash_sessions WHERE id = ${id} FOR SHARE`;
    if (!rows[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La caja no existe.');
    if (rows[0].status !== 'CLOSED') {
      throw new AppError(
        409,
        ERROR_CODES.CASH_SESSION_NOT_CLOSED,
        'Las notas se agregan a una caja cerrada.',
      );
    }
    const note = await tx.cashSessionNote.create({
      data: { cashSessionId: id, note: input.note, userId: user.id },
      include: NOTE_INCLUDE,
    });
    await writeAudit(tx, {
      userId: user.id,
      action: 'CASH_SESSION_NOTE',
      entityType: 'CashSession',
      entityId: id,
      details: { cashSessionNoteId: note.id, note: input.note },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return note;
  });
  return toCashSessionNote(created);
}
