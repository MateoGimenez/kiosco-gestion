// Arma las respuestas de ventas según el rol (docs/api/ventas.md, sección 3).
// Ninguna ruta devuelve el objeto de Prisma: todo pasa por `parseResponse` del esquema del rol, que
// descarta las claves que el esquema no tiene (red de seguridad contra filtrar costos o `requestHash`).
import {
  roundToCents,
  SalePosSchema,
  SaleSchema,
  SaleWithCostSchema,
  type Sale,
  type SalePos,
  type SaleWithCost,
  type UserRole,
} from '@kiosco/shared';
import { parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateToDateOnly } from '../../lib/dates';
import { dec, money, pct, qty } from '../../lib/db';

export const SALE_INCLUDE = {
  cashSession: { select: { id: true, shift: true, businessDate: true } },
  user: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { isMiscellaneous: true } } },
  },
  payments: {
    orderBy: { id: 'asc' },
    include: { paymentMethod: { select: { id: true, kind: true, name: true } } },
  },
  cashMovements: {
    where: { reason: 'SALE_VOID_REFUND' },
    select: { id: true, cashSessionId: true, amount: true },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.SaleInclude;

export type SaleRow = Prisma.SaleGetPayload<{ include: typeof SALE_INCLUDE }>;

/** Costo y ganancia de una línea: lineNetTotal − cantidad × costo neto (R-1). `null` en "Varios" (H-09). */
function lineProfit(item: SaleRow['items'][number]): string | null {
  if (item.product.isMiscellaneous) return null;
  return roundToCents(
    dec(item.lineNetTotal).minus(dec(item.quantity).times(dec(item.unitNetCost))),
  ).toFixed(2);
}

/** Todos los campos posibles (con costo). El esquema del rol descarta lo que sobra. */
function fullSale(row: SaleRow) {
  const refund = row.cashMovements[0];
  const profits = row.items.map(lineProfit);
  return {
    id: row.id,
    status: row.status,
    businessDate: dateToDateOnly(row.businessDate),
    createdAt: row.createdAt.toISOString(),
    cashSession: {
      id: row.cashSession.id,
      shift: row.cashSession.shift,
      businessDate: dateToDateOnly(row.cashSession.businessDate),
    },
    user: { id: row.user.id, fullName: row.user.fullName },
    subtotal: money(row.subtotal),
    discountAmount: money(row.discountAmount),
    discountPercent: row.discountPercent === null ? null : pct(row.discountPercent),
    discountReason: row.discountReason,
    amountDue: dec(row.subtotal).minus(dec(row.discountAmount)).toFixed(2),
    surchargeAmount: money(row.surchargeAmount),
    total: money(row.total),
    items: row.items.map((it, i) => ({
      id: it.id,
      productId: it.productId,
      productName: it.productName,
      customDescription: it.customDescription,
      isMiscellaneous: it.product.isMiscellaneous,
      saleUnit: it.saleUnit,
      quantity: qty(it.quantity),
      unitPrice: money(it.unitPrice),
      vatRatePercent: pct(it.vatRatePercent),
      lineSubtotal: money(it.lineSubtotal),
      discountAmount: money(it.discountAmount),
      lineTotal: money(it.lineTotal),
      lineNetTotal: money(it.lineNetTotal),
      // Solo los conserva el esquema del dueño:
      unitNetCost: money(it.unitNetCost),
      unitCost: money(it.unitCost),
      lineProfit: profits[i] ?? null,
    })),
    payments: row.payments.map((p) => ({
      id: p.id,
      paymentMethod: {
        id: p.paymentMethod.id,
        kind: p.paymentMethod.kind,
        name: p.paymentMethod.name,
      },
      amount: money(p.amount),
      surchargeBase: money(p.surchargeBase),
      surchargePercent: pct(p.surchargePercent),
      surchargeAmount: money(p.surchargeAmount),
      chargedAmount: dec(p.amount).plus(dec(p.surchargeAmount)).toFixed(2),
    })),
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidedBy: row.voidedBy ? { id: row.voidedBy.id, fullName: row.voidedBy.fullName } : null,
    voidReason: row.voidReason,
    voidRefund: refund
      ? {
          cashMovementId: refund.id,
          cashSessionId: refund.cashSessionId,
          amount: money(refund.amount),
        }
      : null,
    // Solo dueño: Σ lineProfit sin "Varios" y sin recargo (PA-31).
    grossProfit: profits
      .reduce((acc, p) => (p === null ? acc : acc.plus(dec(p))), dec('0'))
      .toFixed(2),
  };
}

/** Venta SIN costos: mostrador (respuesta del cobro) y encargado. */
export function toSale(row: SaleRow): Sale {
  return parseResponse(SaleSchema, fullSale(row));
}

/** Venta para el EMPLEADO en el cobro: sin quién anuló, el motivo ni la devolución (deuda de la etapa 4). */
export function toSalePos(row: SaleRow): SalePos {
  return parseResponse(SalePosSchema, fullSale(row));
}

/** Venta con costos y ganancia: solo el dueño. */
export function toSaleWithCost(row: SaleRow): SaleWithCost {
  return parseResponse(SaleWithCostSchema, fullSale(row));
}

/** Según el rol: solo OWNER recibe costos. */
export function toSaleForRole(row: SaleRow, role: UserRole): Sale | SaleWithCost {
  return role === 'OWNER' ? toSaleWithCost(row) : toSale(row);
}
