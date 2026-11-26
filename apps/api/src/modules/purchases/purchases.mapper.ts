// Arma las respuestas de compras (docs/api/compras.md, sección 3.3). Encargado y dueño reciben el
// mismo esquema. Nada sale de la base tal cual: `storedFileName` y `requestHash` nunca viajan.
import {
  CostChangeSchema,
  netCostChangePercent,
  PurchaseSchema,
  type CostChange,
  type Purchase,
} from '@kiosco/shared';
import { parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateToDateOnly } from '../../lib/dates';
import { dec, money, pct, qty } from '../../lib/db';

export const PURCHASE_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  user: { select: { id: true, fullName: true } },
  voidedBy: { select: { id: true, fullName: true } },
  items: {
    orderBy: { id: 'asc' },
    include: { product: { select: { name: true, saleUnit: true, salePrice: true } } },
  },
  attachments: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    include: { uploadedBy: { select: { id: true, fullName: true } } },
  },
  accountEntries: {
    where: { type: 'PAYMENT' },
    orderBy: { id: 'asc' },
    include: { cashMovement: { select: { id: true, cashSessionId: true } } },
  },
} satisfies Prisma.PurchaseInclude;

export type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof PURCHASE_INCLUDE }>;

export const attachmentUrl = (purchaseId: number, attachmentId: number) =>
  `/api/purchases/${purchaseId}/attachments/${attachmentId}`;

/** IVA por alícuota, de la más alta a la más baja, sobre lo guardado (las líneas). */
function vatBreakdownOf(row: PurchaseRow) {
  const byRate = new Map<string, ReturnType<typeof dec>>();
  for (const it of row.items) {
    const key = pct(it.vatRatePercent);
    byRate.set(key, (byRate.get(key) ?? dec('0')).plus(dec(it.lineNetTotal)));
  }
  return [...byRate.entries()]
    .sort((a, b) => dec(b[0]).comparedTo(dec(a[0])))
    .map(([rate, net]) => ({
      vatRatePercent: rate,
      netAmount: net.toFixed(2),
      vatAmount: net.times(dec(rate)).div(100).toDecimalPlaces(2).toFixed(2),
    }));
}

export function toPurchase(row: PurchaseRow): Purchase {
  return parseResponse(PurchaseSchema, {
    id: row.id,
    status: row.status,
    supplier: { id: row.supplier.id, name: row.supplier.name },
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    documentDate: dateToDateOnly(row.documentDate),
    netTotal: money(row.netTotal),
    vatTotal: money(row.vatTotal),
    vatBreakdown: vatBreakdownOf(row),
    otherChargesAmount: money(row.otherChargesAmount),
    total: money(row.total),
    notes: row.notes,
    user: { id: row.user.id, fullName: row.user.fullName },
    createdAt: row.createdAt.toISOString(),
    voidedAt: row.voidedAt ? row.voidedAt.toISOString() : null,
    voidedBy: row.voidedBy ? { id: row.voidedBy.id, fullName: row.voidedBy.fullName } : null,
    voidReason: row.voidReason,
    items: row.items.map((it) => ({
      id: it.id,
      productId: it.productId,
      productName: it.product.name,
      saleUnit: it.product.saleUnit,
      quantityMode: it.quantityMode,
      packCount: it.packCount === null ? null : qty(it.packCount),
      unitsPerPack: it.unitsPerPack === null ? null : qty(it.unitsPerPack),
      packNetCost: it.packNetCost === null ? null : money(it.packNetCost),
      quantity: qty(it.quantity),
      unitNetCost: money(it.unitNetCost),
      vatRatePercent: pct(it.vatRatePercent),
      unitCost: money(it.unitCost),
      lineNetTotal: money(it.lineNetTotal),
      lineTotal: money(it.lineTotal),
      previousNetCostPrice: money(it.previousNetCostPrice),
      previousCostPrice: money(it.previousCostPrice),
    })),
    attachments: row.attachments.map((a) => ({
      id: a.id,
      purchaseId: a.purchaseId,
      originalFileName: a.originalFileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedBy: { id: a.uploadedBy.id, fullName: a.uploadedBy.fullName },
      createdAt: a.createdAt.toISOString(),
      url: attachmentUrl(a.purchaseId, a.id),
    })),
    payNowPayments: row.accountEntries.map((e) => ({
      entryId: e.id,
      // Positivo: lo pagado (en la cuenta corriente se guarda negativo).
      amount: dec(e.amount).neg().toFixed(2),
      source: e.paymentSource,
      reference: e.reference,
      entryDate: dateToDateOnly(e.entryDate),
      cashMovement: e.cashMovement
        ? { id: e.cashMovement.id, cashSessionId: e.cashMovement.cashSessionId }
        : null,
    })),
  });
}

/**
 * Cambios de costo de la compra, armados desde lo guardado (así un reintento da lo mismo): el costo
 * que tenía el producto ANTES (`previous*` de sus líneas) contra el que quedó (la última línea con
 * costo > 0, H-63 y H-64). Solo los productos cuyo costo neto o final cambió.
 */
export function costChangesOf(row: PurchaseRow): CostChange[] {
  const byProduct = new Map<number, PurchaseRow['items']>();
  for (const it of row.items) byProduct.set(it.productId, [...(byProduct.get(it.productId) ?? []), it]);
  const changes: CostChange[] = [];
  for (const [productId, items] of byProduct) {
    const first = items[0]!;
    const last = [...items].reverse().find((it) => dec(it.unitNetCost).gt(0));
    if (!last) continue;
    const sameNet = dec(last.unitNetCost).eq(dec(first.previousNetCostPrice));
    const sameFinal = dec(last.unitCost).eq(dec(first.previousCostPrice));
    if (sameNet && sameFinal) continue;
    const percent = netCostChangePercent(first.previousNetCostPrice.toString(), last.unitNetCost.toString());
    changes.push(
      parseResponse(CostChangeSchema, {
        productId,
        productName: first.product.name,
        previousNetCostPrice: money(first.previousNetCostPrice),
        newNetCostPrice: money(last.unitNetCost),
        previousCostPrice: money(first.previousCostPrice),
        newCostPrice: money(last.unitCost),
        netCostChangePercent: percent ? percent.toFixed(2) : null,
        salePrice: money(first.product.salePrice),
      }),
    );
  }
  return changes;
}
