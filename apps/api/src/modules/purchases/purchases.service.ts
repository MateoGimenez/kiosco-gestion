// Compras: cargar (docs/api/compras.md 5), anular (7), listar y ver (6).
// Cargar y anular van en UNA transacción (NF-11). Orden de bloqueos: proveedor -> caja (FOR SHARE)
// -> productos por id. Es el mismo orden caja -> productos del cobro.
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import {
  calculatePurchase,
  CreatePurchaseResponseSchema,
  ERROR_CODES,
  isWholeQuantity,
  PurchasePageSchema,
  toDecimal,
  VoidPurchaseResponseSchema,
  type CreatePurchaseRequest,
  type CreatePurchaseResponse,
  type Paginated,
  type PurchaseListItem,
  type PurchaseListQuery,
  type Purchase,
  type StockWarning,
  type VoidPurchaseRequest,
  type VoidPurchaseResponse,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { Prisma } from '../../generated/client';
import { dateOnlyToDate, dateToDateOnly, todayInBuenosAires } from '../../lib/dates';
import { dec, isNumericOverflow, isUniqueViolation, money, qty, type Tx } from '../../lib/db';
import { fieldsError } from '../../lib/owner-fields';
import { denyRemote } from '../../middleware/route';
import { lockSupplier, assertPaymentWithinBalance, supplierBalance } from '../suppliers/account';
import { costChangesOf, PURCHASE_INCLUDE, toPurchase, type PurchaseRow } from './purchases.mapper';

/** Una compra con muchas líneas hace varias consultas: más margen que los 5 s por defecto de Prisma. */
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;
/** Lo que entra en una columna Decimal(14,2) (12 enteros) y en una Decimal(12,3) (9 enteros). */
const MAX_AMOUNT = toDecimal('1000000000000');
const MAX_QUANTITY = toDecimal('1000000000');

// --- Huella del pedido (compras.md 5.3) ---------------------------------------------------------

/**
 * SHA-256 del cuerpo ya validado, con claves en orden fijo y números normalizados ("10000" y
 * "10000.00" son el mismo pedido). No incluye las confirmaciones (`confirm*`): son del trámite, no de
 * la compra. Nunca se devuelve en una respuesta.
 */
export function hashPurchaseRequest(input: CreatePurchaseRequest): string {
  const canonical = {
    clientRequestId: input.clientRequestId,
    supplierId: input.supplierId,
    documentType: input.documentType,
    documentNumber: input.documentNumber ?? null,
    documentDate: input.documentDate,
    items: input.items.map((i) =>
      i.quantityMode === 'UNIT'
        ? {
            productId: i.productId,
            quantityMode: 'UNIT',
            quantity: qty(i.quantity),
            unitNetCost: money(i.unitNetCost),
            vatRatePercent: money(i.vatRatePercent),
          }
        : {
            productId: i.productId,
            quantityMode: 'PACK',
            packCount: qty(i.packCount),
            unitsPerPack: qty(i.unitsPerPack),
            packNetCost: money(i.packNetCost),
            vatRatePercent: money(i.vatRatePercent),
          },
    ),
    otherChargesAmount: money(input.otherChargesAmount ?? '0'),
    notes: input.notes ?? null,
    payNow: input.payNow
      ? {
          source: input.payNow.source,
          amount: money(input.payNow.amount),
          reference: input.payNow.reference ?? null,
        }
      : null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// --- Lecturas -----------------------------------------------------------------------------------------

export const findPurchase = (db: Tx, id: number) =>
  db.purchase.findUnique({ where: { id }, include: PURCHASE_INCLUDE });

async function findPurchaseOrThrow(db: Tx, id: number): Promise<PurchaseRow> {
  const row = await findPurchase(db, id);
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La compra no existe.');
  return row;
}

export async function getPurchase(ctx: AppContext, id: number): Promise<Purchase> {
  return toPurchase(await findPurchaseOrThrow(ctx.prisma, id));
}

export async function listPurchases(
  ctx: AppContext,
  query: PurchaseListQuery,
): Promise<Paginated<PurchaseListItem>> {
  const where: Prisma.PurchaseWhereInput = {
    ...(query.supplierId !== undefined ? { supplierId: query.supplierId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.documentNumber ? { documentNumber: query.documentNumber } : {}),
    ...(query.from || query.to
      ? {
          documentDate: {
            ...(query.from ? { gte: dateOnlyToDate(query.from) } : {}),
            ...(query.to ? { lte: dateOnlyToDate(query.to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.prisma.purchase.findMany({
      where,
      orderBy: [{ documentDate: query.sortOrder }, { id: query.sortOrder }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        supplier: { select: { id: true, name: true } },
        user: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
    }),
    ctx.prisma.purchase.count({ where }),
  ]);
  const ids = rows.map((r) => r.id);
  // Consultas agrupadas (no una por compra).
  const [paid, attachments] = await Promise.all([
    ctx.prisma.supplierAccountEntry.groupBy({
      by: ['purchaseId'],
      where: { purchaseId: { in: ids }, type: 'PAYMENT' },
      _sum: { amount: true },
    }),
    ctx.prisma.purchaseAttachment.groupBy({
      by: ['purchaseId'],
      where: { purchaseId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    }),
  ]);
  const paidBy = new Map(paid.map((p) => [p.purchaseId, dec(p._sum.amount ?? '0').neg()]));
  const attachmentsBy = new Map(attachments.map((a) => [a.purchaseId, a._count._all]));
  return parseResponse(PurchasePageSchema, {
    items: rows.map((r) => ({
      id: r.id,
      status: r.status,
      supplier: { id: r.supplier.id, name: r.supplier.name },
      documentType: r.documentType,
      documentNumber: r.documentNumber,
      documentDate: dateToDateOnly(r.documentDate),
      netTotal: money(r.netTotal),
      vatTotal: money(r.vatTotal),
      otherChargesAmount: money(r.otherChargesAmount),
      total: money(r.total),
      paidNowAmount: (paidBy.get(r.id) ?? dec('0')).toFixed(2),
      itemCount: r._count.items,
      attachmentCount: attachmentsBy.get(r.id) ?? 0,
      user: { id: r.user.id, fullName: r.user.fullName },
      createdAt: r.createdAt.toISOString(),
      voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  });
}

// --- Cargar una compra ----------------------------------------------------------------------------------

export interface CreatePurchaseResult {
  status: 200 | 201;
  body: CreatePurchaseResponse;
}

async function buildCreateResponse(
  db: Tx,
  row: PurchaseRow,
  isReplay: boolean,
  balance?: string,
): Promise<CreatePurchaseResponse> {
  return parseResponse(CreatePurchaseResponseSchema, {
    purchase: toPurchase(row),
    isReplay,
    costChanges: costChangesOf(row),
    supplierBalance: balance ?? (await supplierBalance(db, row.supplierId)).toFixed(2),
  });
}

/** Reintento (mismo id, mismo usuario, mismo pedido) -> la misma compra; si no, 409. */
async function replayOrConflict(
  ctx: AppContext,
  existing: PurchaseRow & { requestHash: string },
  userId: number,
  requestHash: string,
): Promise<CreatePurchaseResult> {
  if (existing.userId === userId && existing.requestHash === requestHash) {
    return { status: 200, body: await buildCreateResponse(ctx.prisma, existing, true) };
  }
  throw new AppError(
    409,
    ERROR_CODES.PURCHASE_REQUEST_ID_REUSED,
    `Esa compra ya se había guardado (compra #${existing.id}). Revisá antes de cargarla de nuevo.`,
    { purchaseId: existing.id, createdAt: existing.createdAt.toISOString() },
  );
}

interface LockedProduct {
  id: number;
  name: string;
  saleUnit: 'UNIT' | 'KG';
  salePrice: string;
  netCostPrice: string;
  costPrice: string;
  unitsPerPack: string | null;
  marginPercent: string | null;
  isMiscellaneous: boolean;
  isActive: boolean;
}

/** Lee y BLOQUEA los productos de la compra, en orden de id (dos compras o ventas no se traban entre sí). */
async function lockProducts(tx: Tx, ids: number[]): Promise<Map<number, LockedProduct>> {
  const rows = await tx.$queryRaw<
    {
      id: number;
      name: string;
      sale_unit: 'UNIT' | 'KG';
      sale_price: string;
      net_cost_price: string;
      cost_price: string;
      units_per_pack: string | null;
      margin_percent: string | null;
      is_miscellaneous: boolean;
      is_active: boolean;
    }[]
  >`
    SELECT id, name, sale_unit::text AS sale_unit, sale_price::text AS sale_price,
           net_cost_price::text AS net_cost_price, cost_price::text AS cost_price,
           units_per_pack::text AS units_per_pack, margin_percent::text AS margin_percent,
           is_miscellaneous, is_active
    FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`;
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: r.name,
        saleUnit: r.sale_unit,
        salePrice: r.sale_price,
        netCostPrice: r.net_cost_price,
        costPrice: r.cost_price,
        unitsPerPack: r.units_per_pack,
        marginPercent: r.margin_percent,
        isMiscellaneous: r.is_miscellaneous,
        isActive: r.is_active,
      },
    ]),
  );
}

const findByClientRequestId = (db: Tx, clientRequestId: string) =>
  db.purchase.findUnique({ where: { clientRequestId }, include: PURCHASE_INCLUDE });

export async function createPurchase(
  ctx: AppContext,
  req: Request,
  input: CreatePurchaseRequest,
): Promise<CreatePurchaseResult> {
  const user = req.user!;
  const audit = auditContext(req);

  // Paso 2: "pagar ahora" con efectivo de la caja solo en el local (ADR 003, punto 6).
  if (input.payNow?.source === 'CASH_REGISTER' && req.access === 'remote') {
    await denyRemote(ctx, req, 'Los pagos con efectivo de la caja se hacen desde el local.');
  }

  const requestHash = hashPurchaseRequest(input);

  // Paso 3: reintento.
  const existing = await findByClientRequestId(ctx.prisma, input.clientRequestId);
  if (existing) return replayOrConflict(ctx, existing, user.id, requestHash);

  // Para traducir "el número no entra en la columna": en el stock es otro error que en los importes.
  let stage = 'amount' as 'amount' | 'stock';
  try {
    const created = await ctx.prisma.$transaction(async (tx) => {
      // Paso 4: proveedor (primer bloqueo). Existe y está activo (H-59).
      const supplier = await lockSupplier(tx, input.supplierId);
      if (!supplier) {
        throw new AppError(422, ERROR_CODES.SUPPLIER_NOT_FOUND, 'El proveedor no existe.');
      }
      if (!supplier.isActive) {
        throw new AppError(
          422,
          ERROR_CODES.SUPPLIER_INACTIVE,
          'El proveedor está desactivado. Reactivalo para cargarle compras.',
        );
      }

      // Paso 5: la fecha del comprobante no puede ser posterior a hoy (día calendario de Buenos Aires, H-61).
      if (input.documentDate > todayInBuenosAires()) {
        throw new AppError(
          422,
          ERROR_CODES.DATE_IN_FUTURE,
          'La fecha del comprobante no puede ser posterior a hoy.',
        );
      }

      // Paso 6: comprobante repetido (solo se avisa; con confirmDuplicateDocument se guarda igual).
      if (input.documentNumber && !input.confirmDuplicateDocument) {
        const duplicate = await tx.purchase.findFirst({
          where: {
            supplierId: input.supplierId,
            documentType: input.documentType,
            documentNumber: input.documentNumber,
            status: 'CONFIRMED',
          },
          orderBy: { id: 'desc' },
          select: { id: true, documentDate: true, total: true },
        });
        if (duplicate) {
          throw new AppError(
            422,
            ERROR_CODES.DUPLICATE_DOCUMENT,
            `Ya cargaste un comprobante con ese número para este proveedor (compra #${duplicate.id}). Confirmá si es otro.`,
            {
              purchaseId: duplicate.id,
              documentDate: dateToDateOnly(duplicate.documentDate),
              total: money(duplicate.total),
            },
          );
        }
      }

      // Paso 7: efectivo de la caja -> caja abierta, leída con FOR SHARE (un cierre espera).
      let cashSessionId: number | null = null;
      if (input.payNow?.source === 'CASH_REGISTER') {
        const open = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
        if (!open[0]) {
          throw new AppError(
            422,
            ERROR_CODES.CASH_SESSION_REQUIRED,
            'No hay ninguna caja abierta. Abrí la caja para pagar con efectivo de la caja.',
          );
        }
        cashSessionId = open[0].id;
      }

      // Paso 8: productos, bloqueados en orden de id. Existen, están activos y no son "Varios".
      const productIds = [...new Set(input.items.map((i) => i.productId))].sort((a, b) => a - b);
      const products = await lockProducts(tx, productIds);
      const problem = (pick: (p: LockedProduct | undefined) => boolean) =>
        input.items.flatMap((item, index) =>
          pick(products.get(item.productId)) ? [{ index, productId: item.productId }] : [],
        );
      const missing = problem((p) => p === undefined);
      if (missing.length > 0) {
        throw new AppError(
          422,
          ERROR_CODES.PRODUCT_NOT_FOUND,
          'Un producto de la compra no existe.',
          { items: missing },
        );
      }
      const inactive = problem((p) => !p!.isActive);
      if (inactive.length > 0) {
        throw new AppError(
          422,
          ERROR_CODES.PRODUCT_INACTIVE,
          'Un producto de la compra está desactivado. Reactivalo o sacalo para seguir.',
          { items: inactive },
        );
      }
      const misc = problem((p) => p!.isMiscellaneous);
      if (misc.length > 0) {
        throw new AppError(
          422,
          ERROR_CODES.MISC_PRODUCT_NO_STOCK,
          '"Varios" no lleva stock: no se puede comprar.',
          { items: misc },
        );
      }
      // Producto por unidad: la cantidad (o las unidades por bulto) tiene que ser entera.
      const wholeErrors: { path: string; message: string }[] = [];
      input.items.forEach((item, index) => {
        if (products.get(item.productId)!.saleUnit !== 'UNIT') return;
        if (item.quantityMode === 'UNIT' && !isWholeQuantity(item.quantity)) {
          wholeErrors.push({
            path: `items.${index}.quantity`,
            message: 'Este producto se vende por unidad: usá números enteros.',
          });
        }
        if (item.quantityMode === 'PACK' && !isWholeQuantity(item.unitsPerPack)) {
          wholeErrors.push({
            path: `items.${index}.unitsPerPack`,
            message:
              'Este producto se vende por unidad: las unidades por bulto son un número entero.',
          });
        }
      });
      if (wholeErrors.length > 0) {
        throw fieldsError(400, ERROR_CODES.VALIDATION_ERROR, 'Hay datos inválidos.', wholeErrors);
      }

      // Paso 9: el cálculo (la misma función que usa la pantalla). Total 0 no se permite (H-63).
      const calc = calculatePurchase({
        lines: input.items.map((item) =>
          item.quantityMode === 'UNIT'
            ? {
                quantityMode: 'UNIT' as const,
                quantity: item.quantity,
                unitNetCost: item.unitNetCost,
                vatRatePercent: item.vatRatePercent,
              }
            : {
                quantityMode: 'PACK' as const,
                packCount: item.packCount,
                unitsPerPack: item.unitsPerPack,
                packNetCost: item.packNetCost,
                vatRatePercent: item.vatRatePercent,
              },
        ),
        otherChargesAmount: input.otherChargesAmount ?? '0',
      });
      // Nada de lo que se guarda puede salirse de numeric(14,2) / numeric(12,3): 422 claro, no un 500.
      const amountTooBig = [
        calc.netTotal,
        calc.vatTotal,
        calc.total,
        ...calc.lines.flatMap((l) => [l.lineNetTotal, l.lineTotal, l.unitCost]),
      ].some((v) => v.gte(MAX_AMOUNT));
      if (amountTooBig) {
        throw new AppError(
          422,
          ERROR_CODES.PURCHASE_AMOUNT_OUT_OF_RANGE,
          'El importe es demasiado grande. Revisá los ceros.',
        );
      }
      if (calc.lines.some((l) => l.quantity.gte(MAX_QUANTITY))) {
        throw new AppError(
          422,
          ERROR_CODES.STOCK_OUT_OF_RANGE,
          'La cantidad es demasiado grande para el stock. Revisá el número.',
        );
      }
      if (calc.total.isZero()) {
        throw new AppError(422, ERROR_CODES.PURCHASE_TOTAL_ZERO, 'La compra no puede dar $ 0.');
      }

      // Paso 10: "pagar ahora" mayor que la deuda (el saldo ya incluye esta compra).
      if (input.payNow) {
        const balance = (await supplierBalance(tx, input.supplierId)).plus(calc.total);
        assertPaymentWithinBalance(balance, dec(input.payNow.amount), input.confirmOverpayment);
      }

      // Paso 11: la compra y sus líneas, con el costo que tenía cada producto ANTES.
      const now = new Date();
      const row = await tx.purchase.create({
        data: {
          supplierId: input.supplierId,
          clientRequestId: input.clientRequestId,
          requestHash,
          documentType: input.documentType,
          documentNumber: input.documentNumber ?? null,
          documentDate: dateOnlyToDate(input.documentDate),
          netTotal: calc.netTotal.toFixed(2),
          vatTotal: calc.vatTotal.toFixed(2),
          otherChargesAmount: calc.otherChargesAmount.toFixed(2),
          total: calc.total.toFixed(2),
          notes: input.notes ?? null,
          status: 'CONFIRMED',
          userId: user.id,
          createdAt: now,
          items: {
            create: calc.lines.map((line, i) => {
              const product = products.get(input.items[i]!.productId)!;
              return {
                productId: product.id,
                quantityMode: line.quantityMode,
                packCount: line.packCount ? line.packCount.toFixed(3) : null,
                unitsPerPack: line.unitsPerPack ? line.unitsPerPack.toFixed(3) : null,
                packNetCost: line.packNetCost ? line.packNetCost.toFixed(2) : null,
                quantity: line.quantity.toFixed(3),
                unitNetCost: line.unitNetCost.toFixed(2),
                vatRatePercent: line.vatRatePercent.toFixed(2),
                unitCost: line.unitCost.toFixed(2),
                lineNetTotal: line.lineNetTotal.toFixed(2),
                lineTotal: line.lineTotal.toFixed(2),
                previousNetCostPrice: money(product.netCostPrice),
                previousCostPrice: money(product.costPrice),
              };
            }),
          },
        },
        include: { items: { orderBy: { id: 'asc' }, select: { id: true } } },
      });

      // Paso 12: stock, último costo y unidades por bulto, línea por línea en el orden cargado (H-63, H-64, H-07).
      stage = 'stock';
      const state = new Map(
        [...products.values()].map((p) => [
          p.id,
          { net: p.netCostPrice, cost: p.costPrice, unitsPerPack: p.unitsPerPack },
        ]),
      );
      for (const [i, line] of calc.lines.entries()) {
        const item = input.items[i]!;
        const current = state.get(item.productId)!;
        // Una línea con costo 0 suma stock pero NO pisa el costo (H-63); las demás dejan el último.
        if (line.unitNetCost.gt(0)) {
          current.net = line.unitNetCost.toFixed(2);
          current.cost = line.unitCost.toFixed(2);
        }
        // Por bulto: queda la última cantidad de unidades por bulto usada (H-07).
        if (line.unitsPerPack) current.unitsPerPack = line.unitsPerPack.toFixed(3);
        const updated = await tx.$queryRaw<{ stock: string }[]>`
          UPDATE products
          SET stock_quantity = stock_quantity + ${line.quantity.toFixed(3)}::numeric,
              net_cost_price = ${current.net}::numeric,
              cost_price = ${current.cost}::numeric,
              units_per_pack = ${current.unitsPerPack}::numeric,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.productId}
          RETURNING stock_quantity::text AS stock`;
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE',
            quantity: line.quantity.toFixed(3),
            stockAfter: qty(updated[0]!.stock),
            unitNetCost: line.unitNetCost.toFixed(2),
            purchaseItemId: row.items[i]!.id,
            userId: user.id,
          },
        });
      }
      stage = 'amount';

      // Paso 13: un PriceChange por producto cuyo costo cambió (el precio y el margen quedan iguales).
      const costChanges: {
        productId: number;
        previousNetCostPrice: string;
        newNetCostPrice: string;
      }[] = [];
      const unitsPerPackChanges: {
        productId: number;
        before: string | null;
        after: string | null;
      }[] = [];
      for (const product of products.values()) {
        const final = state.get(product.id)!;
        if (
          !dec(final.net).eq(dec(product.netCostPrice)) ||
          !dec(final.cost).eq(dec(product.costPrice))
        ) {
          await tx.priceChange.create({
            data: {
              productId: product.id,
              source: 'PURCHASE',
              oldNetCostPrice: money(product.netCostPrice),
              newNetCostPrice: money(final.net),
              oldCostPrice: money(product.costPrice),
              newCostPrice: money(final.cost),
              oldSalePrice: money(product.salePrice),
              newSalePrice: money(product.salePrice),
              oldMarginPercent: product.marginPercent,
              newMarginPercent: product.marginPercent,
              purchaseId: row.id,
              userId: user.id,
            },
          });
          costChanges.push({
            productId: product.id,
            previousNetCostPrice: money(product.netCostPrice),
            newNetCostPrice: money(final.net),
          });
        }
        const before = product.unitsPerPack === null ? null : qty(product.unitsPerPack);
        const after = final.unitsPerPack === null ? null : qty(final.unitsPerPack);
        if (before !== after) unitsPerPackChanges.push({ productId: product.id, before, after });
      }

      // Paso 14: la deuda por el total, aunque se pague en el acto (PA-07). Con la fecha del comprobante.
      await tx.supplierAccountEntry.create({
        data: {
          supplierId: input.supplierId,
          type: 'PURCHASE',
          amount: calc.total.toFixed(2),
          entryDate: dateOnlyToDate(input.documentDate),
          purchaseId: row.id,
          userId: user.id,
        },
      });

      // Paso 15: "pagar ahora" (opcional y parcial). Con efectivo de la caja, además, la salida de caja.
      let payment: { entryId: number; cashMovementId: number | null } | null = null;
      if (input.payNow) {
        const amount = dec(input.payNow.amount);
        const entry = await tx.supplierAccountEntry.create({
          data: {
            supplierId: input.supplierId,
            type: 'PAYMENT',
            amount: amount.neg().toFixed(2),
            entryDate: dateOnlyToDate(todayInBuenosAires(now)),
            purchaseId: row.id,
            paymentSource: input.payNow.source,
            reference: input.payNow.reference ?? null,
            userId: user.id,
          },
        });
        let cashMovementId: number | null = null;
        if (cashSessionId !== null) {
          const movement = await tx.cashMovement.create({
            data: {
              cashSessionId,
              direction: 'OUT',
              reason: 'SUPPLIER_PAYMENT',
              description: `Pago a proveedor: ${supplier.name} (compra #${row.id})`,
              amount: amount.toFixed(2),
              supplierAccountEntryId: entry.id,
              userId: user.id,
            },
          });
          cashMovementId = movement.id;
        }
        payment = { entryId: entry.id, cashMovementId };
      }
      const balanceAfter = await supplierBalance(tx, input.supplierId);

      // Paso 16: auditoría (la compra y sus líneas son el registro completo; acá, el resumen y los costos).
      await writeAudit(tx, {
        userId: user.id,
        action: 'PURCHASE_CREATE',
        entityType: 'Purchase',
        entityId: row.id,
        details: {
          supplierId: input.supplierId,
          documentType: input.documentType,
          documentNumber: input.documentNumber ?? null,
          documentDate: input.documentDate,
          netTotal: calc.netTotal.toFixed(2),
          vatTotal: calc.vatTotal.toFixed(2),
          otherChargesAmount: calc.otherChargesAmount.toFixed(2),
          total: calc.total.toFixed(2),
          itemCount: input.items.length,
          costChanges,
          unitsPerPackChanges,
          confirmedDuplicateDocument: input.confirmDuplicateDocument === true,
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      if (input.payNow && payment) {
        await writeAudit(tx, {
          userId: user.id,
          action: 'SUPPLIER_PAYMENT',
          entityType: 'Supplier',
          entityId: input.supplierId,
          details: {
            entryId: payment.entryId,
            amount: dec(input.payNow.amount).toFixed(2),
            source: input.payNow.source,
            entryDate: todayInBuenosAires(now),
            reference: input.payNow.reference ?? null,
            purchaseId: row.id,
            cashMovementId: payment.cashMovementId,
            cashSessionId,
            balanceBefore: balanceAfter.plus(dec(input.payNow.amount)).toFixed(2),
            balanceAfter: balanceAfter.toFixed(2),
            confirmedOverpayment: input.confirmOverpayment === true,
          },
          channel: audit.channel,
          ipAddress: audit.ipAddress,
        });
      }
      return { id: row.id, balance: balanceAfter.toFixed(2) };
    }, TX_OPTIONS);

    const row = await findPurchaseOrThrow(ctx.prisma, created.id);
    return {
      status: 201,
      body: await buildCreateResponse(ctx.prisma, row, false, created.balance),
    };
  } catch (err) {
    // Dos pedidos con el mismo id a la vez: el índice único hizo esperar al segundo; la transacción
    // ya se deshizo, así que se responde como un reintento (o 409 si es otro pedido).
    if (isUniqueViolation(err)) {
      const winner = await findByClientRequestId(ctx.prisma, input.clientRequestId);
      if (winner) return replayOrConflict(ctx, winner, user.id, requestHash);
    }
    if (isNumericOverflow(err)) {
      if (stage === 'stock') {
        throw new AppError(
          422,
          ERROR_CODES.STOCK_OUT_OF_RANGE,
          'La cantidad es demasiado grande para el stock. Revisá el número.',
        );
      }
      throw new AppError(
        422,
        ERROR_CODES.PURCHASE_AMOUNT_OUT_OF_RANGE,
        'El importe es demasiado grande. Revisá los ceros.',
      );
    }
    throw err;
  }
}

// --- Anular --------------------------------------------------------------------------------------------

export async function voidPurchase(
  ctx: AppContext,
  req: Request,
  purchaseId: number,
  input: VoidPurchaseRequest,
): Promise<VoidPurchaseResponse> {
  const user = req.user!;
  const audit = auditContext(req);
  try {
    await ctx.prisma.$transaction(async (tx) => {
      // 1) La compra, bloqueada: dos anulaciones a la vez se hacen de a una (la segunda choca acá).
      const locked = await tx.$queryRaw<{ id: number; status: string; supplier_id: number }[]>`
        SELECT id, status::text AS status, supplier_id FROM purchases WHERE id = ${purchaseId} FOR UPDATE`;
      if (!locked[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La compra no existe.');
      if (locked[0].status === 'VOIDED') {
        throw new AppError(
          409,
          ERROR_CODES.PURCHASE_ALREADY_VOIDED,
          'Esta compra ya está anulada.',
        );
      }
      const supplierId = locked[0].supplier_id;

      // 2) El proveedor y los productos de las líneas (en orden de id).
      await lockSupplier(tx, supplierId);
      const purchase = await tx.purchase.findUniqueOrThrow({
        where: { id: purchaseId },
        include: { items: { orderBy: { id: 'asc' } } },
      });
      const lockIds = [...new Set(purchase.items.map((it) => it.productId))].sort((a, b) => a - b);
      await tx.$queryRaw`
        SELECT id FROM products WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR NO KEY UPDATE`;

      // 3) Estado de la compra.
      await tx.purchase.update({
        where: { id: purchaseId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: input.reason,
        },
      });

      // 4) Stock: baja lo que sumó la compra (puede quedar negativo: no es un error, R2). Vale aunque
      //    el producto se haya desactivado después (H-31).
      const stockAfter: { productId: number; quantity: string; stockAfter: string }[] = [];
      for (const item of purchase.items) {
        const delta = dec(item.quantity).neg().toFixed(3);
        const updated = await tx.$queryRaw<{ stock: string }[]>`
          UPDATE products
          SET stock_quantity = stock_quantity + ${delta}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.productId}
          RETURNING stock_quantity::text AS stock`;
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'PURCHASE_VOID',
            quantity: delta,
            stockAfter: qty(updated[0]!.stock),
            unitNetCost: money(item.unitNetCost),
            purchaseItemId: item.id,
            userId: user.id,
          },
        });
        stockAfter.push({
          productId: item.productId,
          quantity: qty(item.quantity),
          stockAfter: qty(updated[0]!.stock),
        });
      }

      // 5) Deuda: se devuelve el total. Los pagos (de "pagar ahora" o sueltos) NO cambian (H-55 a).
      const balanceBefore = await supplierBalance(tx, supplierId);
      await tx.supplierAccountEntry.create({
        data: {
          supplierId,
          type: 'PURCHASE_VOID',
          amount: dec(purchase.total).neg().toFixed(2),
          entryDate: dateOnlyToDate(todayInBuenosAires()),
          purchaseId,
          userId: user.id,
        },
      });
      const payNowEntries = await tx.supplierAccountEntry.findMany({
        where: { purchaseId, type: 'PAYMENT' },
        select: { id: true },
        orderBy: { id: 'asc' },
      });

      // 6) Los costos, precios y unidades por bulto NO se revierten (COM-09, PA-25): no se crea PriceChange.
      // 7) Auditoría.
      await writeAudit(tx, {
        userId: user.id,
        action: 'PURCHASE_VOID',
        entityType: 'Purchase',
        entityId: purchaseId,
        details: {
          reason: input.reason,
          supplierId,
          total: money(purchase.total),
          items: stockAfter,
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceBefore.minus(dec(purchase.total)).toFixed(2),
          payNowEntryIds: payNowEntries.map((e) => e.id),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
    }, TX_OPTIONS);
  } catch (err) {
    if (isNumericOverflow(err)) {
      throw new AppError(
        422,
        ERROR_CODES.STOCK_OUT_OF_RANGE,
        'La cantidad es demasiado grande para el stock. Revisá el número.',
      );
    }
    throw err;
  }

  const row = await findPurchaseOrThrow(ctx.prisma, purchaseId);
  return parseResponse(VoidPurchaseResponseSchema, {
    purchase: toPurchase(row),
    stockWarnings: await voidStockWarnings(ctx.prisma, purchaseId),
    supplierBalance: (await supplierBalance(ctx.prisma, row.supplierId)).toFixed(2),
  });
}

/** Productos que quedaron por debajo de 0 con ESTA anulación (sale de `stockAfter`, así es lo guardado). */
async function voidStockWarnings(db: Tx, purchaseId: number): Promise<StockWarning[]> {
  const movements = await db.stockMovement.findMany({
    where: { type: 'PURCHASE_VOID', purchaseItem: { purchaseId } },
    include: { product: { select: { name: true, saleUnit: true } } },
    orderBy: { id: 'asc' },
  });
  // Si el mismo producto está en dos líneas, vale el último movimiento (el stock final).
  const lastByProduct = new Map<number, (typeof movements)[number]>();
  for (const m of movements) lastByProduct.set(m.productId, m);
  return [...lastByProduct.values()]
    .filter((m) => dec(m.stockAfter).isNegative())
    .map((m) => ({
      productId: m.productId,
      productName: m.product.name,
      saleUnit: m.product.saleUnit,
      stockAfter: qty(m.stockAfter),
    }));
}
