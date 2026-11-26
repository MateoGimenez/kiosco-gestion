// Lecturas de caja: totales del efectivo, detalle y arqueo, y lista (docs/api/caja.md 5, 9 y 13).
// Todo con consultas agrupadas por caja (nunca una por venta).
import {
  CashSessionDetailSchema,
  CashSessionListItemSchema,
  calculateExpectedCash,
  ERROR_CODES,
  type CashSessionDetail,
  type CashSessionListItem,
  type CashSessionListQuery,
  type CashSummary,
  type Paginated,
  type PaymentMethodSummary,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateOnlyToDate } from '../../lib/dates';
import { dec, money, type Tx } from '../../lib/db';
import {
  CASH_INCLUDE,
  findPreviousClosing,
  MOVEMENT_INCLUDE,
  NOTE_INCLUDE,
  toCashMovement,
  toCashSessionNote,
  toCashSessionFull,
} from './cash.mapper';

export interface CashTotals {
  cashSales: ReturnType<typeof dec>;
  cashIn: ReturnType<typeof dec>;
  cashOut: ReturnType<typeof dec>;
  voidRefunds: ReturnType<typeof dec>;
}

/**
 * Dos consultas de suma (nunca se traen las ventas una por una): lo cobrado en efectivo de TODAS las
 * ventas de la caja (también las anuladas después) y los movimientos por sentido y motivo.
 */
export async function cashTotals(db: Tx, cashSessionId: number): Promise<CashTotals> {
  const pay = await db.salePayment.aggregate({
    where: { sale: { cashSessionId }, paymentMethod: { kind: 'CASH' } },
    _sum: { amount: true, surchargeAmount: true },
  });
  const moves = await db.cashMovement.groupBy({
    by: ['direction', 'reason'],
    where: { cashSessionId },
    _sum: { amount: true },
  });
  let cashIn = dec('0');
  let cashOut = dec('0');
  let voidRefunds = dec('0');
  for (const m of moves) {
    const amount = dec(m._sum.amount ?? '0');
    if (m.direction === 'IN') cashIn = cashIn.plus(amount);
    else cashOut = cashOut.plus(amount);
    if (m.reason === 'SALE_VOID_REFUND') voidRefunds = voidRefunds.plus(amount);
  }
  return {
    cashSales: dec(pay._sum.amount ?? '0').plus(dec(pay._sum.surchargeAmount ?? '0')),
    cashIn,
    cashOut,
    voidRefunds,
  };
}

function toSummary(openingCash: string, totals: CashTotals): CashSummary {
  return {
    openingCash: money(openingCash),
    cashSales: totals.cashSales.toFixed(2),
    cashIn: totals.cashIn.toFixed(2),
    cashOut: totals.cashOut.toFixed(2),
    voidRefunds: totals.voidRefunds.toFixed(2),
    expectedCash: calculateExpectedCash({
      openingCash,
      cashSales: totals.cashSales,
      cashIn: totals.cashIn,
      cashOut: totals.cashOut,
    }).toFixed(2),
  };
}

/** Pagos de la caja por medio, y cuánto de eso es de ventas anuladas después. */
async function paymentSummary(db: Tx, cashSessionId: number): Promise<PaymentMethodSummary[]> {
  const where = { sale: { cashSessionId } } as const;
  const [all, voided, methods] = await Promise.all([
    db.salePayment.groupBy({
      by: ['paymentMethodId'],
      where,
      _count: { _all: true },
      _sum: { amount: true, surchargeAmount: true },
    }),
    db.salePayment.groupBy({
      by: ['paymentMethodId'],
      where: { sale: { cashSessionId, status: 'VOIDED' } },
      _sum: { amount: true, surchargeAmount: true },
    }),
    db.paymentMethod.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }),
  ]);
  const voidedBy = new Map(
    voided.map((v) => [
      v.paymentMethodId,
      dec(v._sum.amount ?? '0').plus(dec(v._sum.surchargeAmount ?? '0')),
    ]),
  );
  const used = new Map(all.map((a) => [a.paymentMethodId, a]));
  return methods.flatMap((m) => {
    const a = used.get(m.id);
    if (!a) return [];
    const amount = dec(a._sum.amount ?? '0');
    const surcharge = dec(a._sum.surchargeAmount ?? '0');
    return [
      {
        paymentMethod: { id: m.id, kind: m.kind, name: m.name },
        paymentCount: a._count._all,
        amount: amount.toFixed(2),
        surchargeAmount: surcharge.toFixed(2),
        chargedAmount: amount.plus(surcharge).toFixed(2),
        voidedChargedAmount: (voidedBy.get(m.id) ?? dec('0')).toFixed(2),
      },
    ];
  });
}

async function salesSummary(db: Tx, cashSessionId: number) {
  const groups = await db.sale.groupBy({
    by: ['status'],
    where: { cashSessionId },
    _count: { _all: true },
    _sum: { total: true, surchargeAmount: true },
  });
  let count = 0;
  let voidedCount = 0;
  let total = dec('0');
  let voidedTotal = dec('0');
  let surcharge = dec('0');
  for (const g of groups) {
    count += g._count._all;
    total = total.plus(dec(g._sum.total ?? '0'));
    surcharge = surcharge.plus(dec(g._sum.surchargeAmount ?? '0'));
    if (g.status === 'VOIDED') {
      voidedCount += g._count._all;
      voidedTotal = voidedTotal.plus(dec(g._sum.total ?? '0'));
    }
  }
  return {
    count,
    voidedCount,
    total: total.toFixed(2),
    voidedTotal: voidedTotal.toFixed(2),
    surchargeAmount: surcharge.toFixed(2),
  };
}

/** Detalle y arqueo (solo encargado y dueño). `summary` se arma con los datos de AHORA (9.3). */
export async function buildCashSessionDetail(db: Tx, id: number): Promise<CashSessionDetail> {
  const row = await db.cashSession.findUnique({ where: { id }, include: CASH_INCLUDE });
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La caja no existe.');
  const [totals, payments, sales, movements, notes, previousClosing] = await Promise.all([
    cashTotals(db, id),
    paymentSummary(db, id),
    salesSummary(db, id),
    db.cashMovement.findMany({
      where: { cashSessionId: id },
      include: MOVEMENT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    db.cashSessionNote.findMany({
      where: { cashSessionId: id },
      include: NOTE_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    findPreviousClosing(db, id),
  ]);
  return parseResponse(CashSessionDetailSchema, {
    ...toCashSessionFull(row),
    countedCash: row.countedCash ? money(row.countedCash) : null,
    expectedCash: row.expectedCash ? money(row.expectedCash) : null,
    difference: row.difference ? money(row.difference) : null,
    closingNote: row.closingNote,
    summary: toSummary(row.openingCash.toString(), totals),
    paymentSummary: payments,
    sales,
    movements: movements.map(toCashMovement),
    notes: notes.map(toCashSessionNote),
    previousClosing,
  });
}

export async function listCashSessions(
  ctx: AppContext,
  query: CashSessionListQuery,
): Promise<Paginated<CashSessionListItem>> {
  const where: Prisma.CashSessionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.shift ? { shift: query.shift } : {}),
    ...(query.openedById ? { openedById: query.openedById } : {}),
    ...(query.closedById ? { closedById: query.closedById } : {}),
    ...(query.hasDifference === undefined
      ? {}
      : {
          // Implica CLOSED. `not: 0` deja afuera las abiertas (difference NULL).
          AND: [
            { status: 'CLOSED' as const },
            query.hasDifference ? { difference: { not: 0 } } : { difference: 0 },
          ],
        }),
    ...(query.from || query.to
      ? {
          businessDate: {
            ...(query.from ? { gte: dateOnlyToDate(query.from) } : {}),
            ...(query.to ? { lte: dateOnlyToDate(query.to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.prisma.cashSession.findMany({
      where,
      include: CASH_INCLUDE,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    ctx.prisma.cashSession.count({ where }),
  ]);
  // Una sola consulta agrupada para las notas de toda la página.
  const noteCounts = await ctx.prisma.cashSessionNote.groupBy({
    by: ['cashSessionId'],
    where: { cashSessionId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const countById = new Map(noteCounts.map((n) => [n.cashSessionId, n._count._all]));
  return {
    items: rows.map((row) =>
      parseResponse(CashSessionListItemSchema, {
        ...toCashSessionFull(row),
        countedCash: row.countedCash ? money(row.countedCash) : null,
        expectedCash: row.expectedCash ? money(row.expectedCash) : null,
        difference: row.difference ? money(row.difference) : null,
        noteCount: countById.get(row.id) ?? 0,
      }),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
