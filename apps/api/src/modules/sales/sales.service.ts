// Venta (cobrar) y anulación (docs/api/ventas.md, secciones 6 y 7; modelo-datos.md sección 4).
// Todo en UNA transacción: o se guarda todo (venta, pagos, stock, auditoría) o nada (NF-11).
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import {
  calculateSale,
  cashChange,
  CreateSaleResponseSchema,
  ERROR_CODES,
  getBusinessDate,
  isWholeQuantity,
  SaleCalculationError,
  toDecimal,
  VoidSaleResponseSchema,
  type CreateSaleRequest,
  type CreateSaleResponse,
  type Decimal,
  type StockWarning,
  type VoidSaleRequest,
  type VoidSaleResponse,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { Prisma } from '../../generated/client';
import { dateOnlyToDate } from '../../lib/dates';
import { dec, isNumericOverflow, isUniqueViolation, money, qty, type Tx } from '../../lib/db';
import { fieldsError } from '../../lib/owner-fields';
import { getCutoffMinutes } from '../settings/settings.service';
import { SALE_INCLUDE, toSale, toSaleForRole, type SaleRow } from './sales.mapper';

/** Una venta con muchas líneas hace varias consultas: más margen que los 5 s por defecto de Prisma. */
const TX_OPTIONS = { timeout: 20_000, maxWait: 5_000 } as const;
/** Lo más grande que entra en una columna Decimal(14,2) (12 enteros). */
const MAX_AMOUNT = toDecimal('1000000000000');

// --- Huella del pedido (ventas.md 2.4) ------------------------------------------------------------

/**
 * SHA-256 del cuerpo ya validado, con las claves en un orden fijo y los números normalizados
 * ("4500" y "4500.00" son el mismo pedido). Nunca se devuelve en una respuesta.
 */
export function hashSaleRequest(input: CreateSaleRequest): string {
  const canonical = {
    clientRequestId: input.clientRequestId,
    items: input.items.map((i) => ({
      productId: i.productId,
      quantity: qty(i.quantity),
      unitPrice: i.unitPrice === undefined ? null : money(i.unitPrice),
      customDescription: i.customDescription ?? null,
    })),
    discount: input.discount
      ? {
          type: input.discount.type,
          value: money(input.discount.value),
          reason: input.discount.reason ?? null,
        }
      : null,
    payments: input.payments.map((p) => ({
      paymentMethodId: p.paymentMethodId,
      amount: money(p.amount),
    })),
    cashTendered: input.cashTendered == null ? null : money(input.cashTendered),
    expectedTotal: money(input.expectedTotal),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

// --- Lecturas de una venta -------------------------------------------------------------------------

export function loadSale(db: Tx, id: number): Promise<SaleRow | null> {
  return db.sale.findUnique({ where: { id }, include: SALE_INCLUDE });
}

async function loadSaleOrThrow(db: Tx, id: number): Promise<SaleRow> {
  const row = await loadSale(db, id);
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La venta no existe.');
  return row;
}

/** Productos que quedaron por debajo de 0 con ESTA venta (sale de `stockAfter`, así un reintento da lo mismo). */
async function stockWarningsOf(db: Tx, saleId: number): Promise<StockWarning[]> {
  const movements = await db.stockMovement.findMany({
    where: { type: 'SALE', saleItem: { saleId } },
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

async function buildCreateResponse(
  db: Tx,
  row: SaleRow,
  cashTendered: string | null | undefined,
  isReplay: boolean,
): Promise<CreateSaleResponse> {
  const cashAmount = row.payments
    .filter((p) => p.paymentMethod.kind === 'CASH')
    .reduce((acc, p) => acc.plus(dec(p.amount)), dec('0'));
  return parseResponse(CreateSaleResponseSchema, {
    sale: toSale(row),
    isReplay,
    change: cashTendered == null ? null : cashChange(cashTendered, cashAmount).toFixed(2),
    stockWarnings: await stockWarningsOf(db, row.id),
  });
}

// --- Cobrar ------------------------------------------------------------------------------------------

export interface CreateSaleResult {
  status: 200 | 201;
  body: CreateSaleResponse;
}

/** Reintento (mismo id, mismo usuario, mismo pedido) -> la misma venta; si no, 409. */
async function replayOrConflict(
  ctx: AppContext,
  existing: SaleRow & { requestHash: string },
  userId: number,
  requestHash: string,
  cashTendered: string | null | undefined,
): Promise<CreateSaleResult> {
  if (existing.userId === userId && existing.requestHash === requestHash) {
    return {
      status: 200,
      body: await buildCreateResponse(ctx.prisma, existing, cashTendered, true),
    };
  }
  // Solo el número y la hora: ni importes ni pagos (H-40 a).
  throw new AppError(
    409,
    ERROR_CODES.SALE_REQUEST_ID_REUSED,
    `Esa venta ya se había cobrado (venta #${existing.id}). Revisá antes de cobrar de nuevo.`,
    { saleId: existing.id, createdAt: existing.createdAt.toISOString() },
  );
}

const findByClientRequestId = (db: Tx, clientRequestId: string) =>
  db.sale.findUnique({ where: { clientRequestId }, include: SALE_INCLUDE });

export async function createSale(
  ctx: AppContext,
  req: Request,
  input: CreateSaleRequest,
): Promise<CreateSaleResult> {
  const user = req.user!;
  const audit = auditContext(req);

  // Paso 2: el descuento es solo de encargado y dueño (VEN-08, PA-16).
  if (input.discount && user.role === 'EMPLOYEE') {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, 'No tenés permiso para aplicar descuentos.', {
      fields: ['discount'],
    });
  }

  const requestHash = hashSaleRequest(input);

  // Paso 3: reintento.
  const existing = await findByClientRequestId(ctx.prisma, input.clientRequestId);
  if (existing) return replayOrConflict(ctx, existing, user.id, requestHash, input.cashTendered);

  // Para traducir "el número no entra en la columna": en el stock es otro error que en los importes.
  let stage = 'sale' as 'sale' | 'stock';
  try {
    const saleId = await ctx.prisma.$transaction(async (tx) => {
      // Paso 4: caja abierta, leída con FOR SHARE (un cierre espera a que terminen las ventas en curso).
      const open = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
      const cashSession = open[0];
      if (!cashSession) {
        throw new AppError(
          422,
          ERROR_CODES.CASH_SESSION_REQUIRED,
          'No hay ninguna caja abierta. Abrí la caja para seguir.',
        );
      }

      // Paso 5: productos (una consulta). Existen y están activos.
      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          name: true,
          saleUnit: true,
          salePrice: true,
          netCostPrice: true,
          costPrice: true,
          vatRatePercent: true,
          isMiscellaneous: true,
          isActive: true,
        },
      });
      const productById = new Map(products.map((p) => [p.id, p]));
      const missing = input.items.flatMap((i, index) =>
        productById.has(i.productId) ? [] : [{ index, productId: i.productId }],
      );
      if (missing.length > 0) {
        throw new AppError(
          422,
          ERROR_CODES.PRODUCT_NOT_FOUND,
          'Un producto de la venta no existe.',
          { items: missing },
        );
      }
      const inactive = input.items.flatMap((i, index) =>
        productById.get(i.productId)!.isActive ? [] : [{ index, productId: i.productId }],
      );
      if (inactive.length > 0) {
        throw new AppError(
          422,
          ERROR_CODES.PRODUCT_INACTIVE,
          'Un producto de la venta está desactivado. Sacalo para cobrar.',
          { items: inactive },
        );
      }

      // Paso 6: reglas por línea.
      const wholeErrors: { path: string; message: string }[] = [];
      const notAllowed: { path: string; message: string }[] = [];
      const priceRequired: { path: string; message: string }[] = [];
      input.items.forEach((item, index) => {
        const product = productById.get(item.productId)!;
        if (product.saleUnit === 'UNIT' && !isWholeQuantity(item.quantity)) {
          wholeErrors.push({
            path: `items.${index}.quantity`,
            message: 'Este producto se vende por unidad: usá números enteros.',
          });
        }
        if (product.isMiscellaneous) {
          if (item.unitPrice === undefined) {
            priceRequired.push({
              path: `items.${index}.unitPrice`,
              message: 'Escribí el precio de "Varios".',
            });
          }
        } else {
          if (item.unitPrice !== undefined)
            notAllowed.push({
              path: `items.${index}.unitPrice`,
              message: 'El precio solo se escribe en "Varios".',
            });
          if (item.customDescription != null)
            notAllowed.push({
              path: `items.${index}.customDescription`,
              message: 'La descripción solo se escribe en "Varios".',
            });
        }
      });
      if (wholeErrors.length > 0)
        throw fieldsError(400, ERROR_CODES.VALIDATION_ERROR, 'Hay datos inválidos.', wholeErrors);
      if (notAllowed.length > 0)
        throw new AppError(
          422,
          ERROR_CODES.LINE_FIELD_NOT_ALLOWED,
          'El precio y la descripción solo se escriben en "Varios".',
          { fields: notAllowed },
        );
      if (priceRequired.length > 0)
        throw new AppError(422, ERROR_CODES.MISC_PRICE_REQUIRED, 'Escribí el precio de "Varios".', {
          fields: priceRequired,
        });

      // Paso 7: medios de pago. Existen y están activos.
      const methods = await tx.paymentMethod.findMany({
        where: { id: { in: [...new Set(input.payments.map((p) => p.paymentMethodId))] } },
      });
      const methodById = new Map(methods.map((m) => [m.id, m]));
      const unknownMethods = input.payments.flatMap((p, index) =>
        methodById.has(p.paymentMethodId) ? [] : [{ index, paymentMethodId: p.paymentMethodId }],
      );
      if (unknownMethods.length > 0)
        throw new AppError(
          422,
          ERROR_CODES.PAYMENT_METHOD_NOT_FOUND,
          'Ese medio de pago no existe.',
          { payments: unknownMethods },
        );
      const inactiveMethods = input.payments.flatMap((p, index) =>
        methodById.get(p.paymentMethodId)!.isActive
          ? []
          : [{ index, paymentMethodId: p.paymentMethodId }],
      );
      if (inactiveMethods.length > 0)
        throw new AppError(
          422,
          ERROR_CODES.PAYMENT_METHOD_INACTIVE,
          'Ese medio de pago está desactivado.',
          { payments: inactiveMethods },
        );

      // Paso 8: el cálculo, con precios, IVA y recargos DE LA BASE (el precio de la pantalla solo en "Varios").
      const unitPrices = input.items.map((item) => {
        const product = productById.get(item.productId)!;
        return product.isMiscellaneous ? dec(item.unitPrice!) : dec(product.salePrice);
      });
      let calc;
      try {
        calc = calculateSale({
          lines: input.items.map((item, i) => ({
            quantity: item.quantity,
            unitPrice: unitPrices[i]!,
            vatRatePercent: productById.get(item.productId)!.vatRatePercent.toString(),
          })),
          discount: input.discount ?? null,
          payments: input.payments.map((p) => ({
            amount: p.amount,
            surchargePercent: methodById.get(p.paymentMethodId)!.surchargePercent.toString(),
          })),
        });
      } catch (err) {
        if (err instanceof SaleCalculationError) {
          throw new AppError(
            422,
            err.code,
            err.message,
            Object.keys(err.details).length > 0 ? err.details : undefined,
          );
        }
        throw err;
      }
      const tooBig = (v: Decimal) => v.gte(MAX_AMOUNT);
      if (
        tooBig(calc.subtotal) ||
        tooBig(calc.total) ||
        calc.lines.some((l) => tooBig(l.lineSubtotal))
      ) {
        throw new AppError(
          422,
          ERROR_CODES.SALE_AMOUNT_OUT_OF_RANGE,
          'El importe es demasiado grande.',
        );
      }

      // Paso 9: lo que cobra el servidor tiene que ser lo que vio el cajero (H-33). Solo se COMPARA.
      if (!calc.total.eq(dec(input.expectedTotal))) {
        throw new AppError(
          409,
          ERROR_CODES.SALE_TOTAL_CHANGED,
          'El total cambió (precio o recargo actualizado). Revisá el nuevo total y cobrá de nuevo.',
          {
            expectedTotal: money(input.expectedTotal),
            total: calc.total.toFixed(2),
            subtotal: calc.subtotal.toFixed(2),
            discountAmount: calc.discountAmount.toFixed(2),
            items: input.items.map((item, index) => ({
              index,
              productId: item.productId,
              unitPrice: unitPrices[index]!.toFixed(2),
              lineSubtotal: calc.lines[index]!.lineSubtotal.toFixed(2),
            })),
            payments: input.payments.map((p, index) => ({
              index,
              paymentMethodId: p.paymentMethodId,
              surchargePercent: calc.payments[index]!.surchargePercent.toFixed(2),
              surchargeAmount: calc.payments[index]!.surchargeAmount.toFixed(2),
              chargedAmount: calc.payments[index]!.chargedAmount.toFixed(2),
            })),
          },
        );
      }

      // Paso 10: Σ amount = subtotal − descuento (regla 2; H-36, H-37).
      if (!calc.paidAmount.eq(calc.amountDue)) {
        throw new AppError(
          422,
          ERROR_CODES.PAYMENTS_TOTAL_MISMATCH,
          'Los pagos tienen que sumar exactamente el total.',
          { amountDue: calc.amountDue.toFixed(2), paidAmount: calc.paidAmount.toFixed(2) },
        );
      }

      // Paso 11: vuelto. Tiene que haber efectivo y alcanzar para esa parte.
      if (input.cashTendered != null) {
        const cashAmount = input.payments.reduce(
          (acc, p) =>
            methodById.get(p.paymentMethodId)!.kind === 'CASH' ? acc.plus(dec(p.amount)) : acc,
          dec('0'),
        );
        if (cashAmount.isZero()) {
          throw new AppError(
            422,
            ERROR_CODES.CASH_TENDERED_WITHOUT_CASH,
            'Para calcular el vuelto tiene que haber un pago en efectivo.',
          );
        }
        if (cashChange(input.cashTendered, cashAmount).isNegative()) {
          throw new AppError(
            422,
            ERROR_CODES.CASH_TENDERED_TOO_LOW,
            'Lo que entregó el cliente no alcanza para la parte en efectivo.',
            { cashAmount: cashAmount.toFixed(2) },
          );
        }
      }

      // Paso 12: la venta, con la "foto" de nombre, precio, costo e IVA (D5).
      const now = new Date();
      const businessDate = getBusinessDate(now, await getCutoffMinutes(tx));
      const created = await tx.sale.create({
        data: {
          cashSessionId: cashSession.id,
          userId: user.id,
          clientRequestId: input.clientRequestId,
          requestHash,
          businessDate: dateOnlyToDate(businessDate),
          createdAt: now,
          status: 'COMPLETED',
          subtotal: calc.subtotal.toFixed(2),
          discountAmount: calc.discountAmount.toFixed(2),
          discountPercent: calc.discountPercent ? calc.discountPercent.toFixed(2) : null,
          discountReason: input.discount?.reason ?? null,
          surchargeAmount: calc.surchargeAmount.toFixed(2),
          total: calc.total.toFixed(2),
          items: {
            create: input.items.map((item, i) => {
              const product = productById.get(item.productId)!;
              const line = calc.lines[i]!;
              return {
                productId: product.id,
                productName: product.name,
                customDescription: product.isMiscellaneous
                  ? (item.customDescription ?? null)
                  : null,
                saleUnit: product.saleUnit,
                quantity: qty(item.quantity),
                unitPrice: unitPrices[i]!.toFixed(2),
                // "Varios" no tiene costo (H-09).
                unitNetCost: product.isMiscellaneous ? '0.00' : money(product.netCostPrice),
                unitCost: product.isMiscellaneous ? '0.00' : money(product.costPrice),
                vatRatePercent: product.vatRatePercent.toString(),
                lineSubtotal: line.lineSubtotal.toFixed(2),
                discountAmount: line.discountAmount.toFixed(2),
                lineTotal: line.lineTotal.toFixed(2),
                lineNetTotal: line.lineNetTotal.toFixed(2),
              };
            }),
          },
          payments: {
            create: input.payments.map((p, i) => {
              const r = calc.payments[i]!;
              return {
                paymentMethodId: p.paymentMethodId,
                amount: r.amount.toFixed(2),
                surchargeBase: r.surchargeBase.toFixed(2),
                surchargePercent: r.surchargePercent.toFixed(2),
                surchargeAmount: r.surchargeAmount.toFixed(2),
              };
            }),
          },
        },
        include: { items: { orderBy: { id: 'asc' }, select: { id: true } } },
      });

      // Paso 13: stock. Filas bloqueadas EN ORDEN de productId (dos ventas a la vez no se pisan ni
      // se bloquean entre sí). "Varios" no mueve stock. El stock puede quedar negativo (VEN-09).
      stage = 'stock';
      const stockLines = input.items
        .map((item, index) => ({ item, index, product: productById.get(item.productId)! }))
        .filter((l) => !l.product.isMiscellaneous)
        .sort((a, b) => a.product.id - b.product.id || a.index - b.index);
      const lockIds = [...new Set(stockLines.map((l) => l.product.id))];
      if (lockIds.length > 0) {
        // NO KEY UPDATE y no UPDATE: la FK de `sale_items` ya tomó KEY SHARE sobre estas filas en las
        // dos ventas, y FOR UPDATE choca con KEY SHARE (bloqueo cruzado). NO KEY UPDATE no choca con él.
        await tx.$queryRaw`
          SELECT id FROM products WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR NO KEY UPDATE`;
      }
      for (const { item, index, product } of stockLines) {
        const delta = dec(item.quantity).neg().toFixed(3);
        const updated = await tx.$queryRaw<{ stock: string }[]>`
          UPDATE products
          SET stock_quantity = stock_quantity + ${delta}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${product.id}
          RETURNING stock_quantity::text AS stock`;
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: 'SALE',
            quantity: delta,
            stockAfter: qty(updated[0]!.stock),
            unitNetCost: money(product.netCostPrice),
            saleItemId: created.items[index]!.id,
            userId: user.id,
          },
        });
      }
      stage = 'sale';

      // Paso 14: auditoría de descuentos (la venta misma es el registro del resto, VEN-10).
      if (input.discount) {
        await writeAudit(tx, {
          userId: user.id,
          action: 'DISCOUNT_APPLIED',
          entityType: 'Sale',
          entityId: created.id,
          details: {
            subtotal: calc.subtotal.toFixed(2),
            discountType: input.discount.type,
            discountValue: money(input.discount.value),
            discountAmount: calc.discountAmount.toFixed(2),
            reason: input.discount.reason ?? null,
          },
          channel: audit.channel,
          ipAddress: audit.ipAddress,
        });
      }
      return created.id;
    }, TX_OPTIONS);

    const row = await loadSaleOrThrow(ctx.prisma, saleId);
    return {
      status: 201,
      body: await buildCreateResponse(ctx.prisma, row, input.cashTendered, false),
    };
  } catch (err) {
    // Dos pedidos con el mismo id a la vez: el índice único hizo esperar al segundo; la transacción
    // ya se deshizo, así que se responde como un reintento (o 409 si es otro pedido).
    if (isUniqueViolation(err)) {
      const winner = await findByClientRequestId(ctx.prisma, input.clientRequestId);
      if (winner) return replayOrConflict(ctx, winner, user.id, requestHash, input.cashTendered);
    }
    if (isNumericOverflow(err)) {
      if (stage === 'stock')
        throw new AppError(
          422,
          ERROR_CODES.STOCK_OUT_OF_RANGE,
          'La cantidad es demasiado grande para el stock. Revisá el número.',
        );
      throw new AppError(
        422,
        ERROR_CODES.SALE_AMOUNT_OUT_OF_RANGE,
        'El importe es demasiado grande.',
      );
    }
    throw err;
  }
}

// --- Anular ------------------------------------------------------------------------------------------

export async function voidSale(
  ctx: AppContext,
  req: Request,
  saleId: number,
  input: VoidSaleRequest,
): Promise<VoidSaleResponse> {
  const user = req.user!;
  const audit = auditContext(req);
  try {
    await ctx.prisma.$transaction(async (tx) => {
      // 1) La venta, bloqueada: dos anulaciones a la vez se hacen de a una (la segunda choca acá).
      const locked = await tx.$queryRaw<{ id: number; status: string }[]>`
        SELECT id, status::text AS status FROM sales WHERE id = ${saleId} FOR UPDATE`;
      if (!locked[0]) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La venta no existe.');
      if (locked[0].status === 'VOIDED') {
        throw new AppError(409, ERROR_CODES.SALE_ALREADY_VOIDED, 'Esta venta ya está anulada.');
      }

      // 2) Caja abierta AHORA (FOR SHARE), siempre, tenga o no efectivo (H-41 a).
      const open = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
      const cashSession = open[0];
      if (!cashSession) {
        throw new AppError(
          422,
          ERROR_CODES.CASH_SESSION_REQUIRED,
          'No hay ninguna caja abierta. Abrí la caja para seguir.',
        );
      }

      const sale = await tx.sale.findUniqueOrThrow({
        where: { id: saleId },
        include: {
          items: {
            orderBy: { id: 'asc' },
            include: { product: { select: { isMiscellaneous: true } } },
          },
          payments: {
            include: { paymentMethod: { select: { id: true, kind: true, name: true } } },
          },
        },
      });

      // 3) Estado de la venta (regla 6).
      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedById: user.id,
          voidReason: input.reason,
        },
      });

      // 4) Stock: vuelve lo que salió, en orden de productId. Vale también si el producto se desactivó (H-31).
      const stockItems = sale.items
        .filter((it) => !it.product.isMiscellaneous)
        .sort((a, b) => a.productId - b.productId || a.id - b.id);
      const lockIds = [...new Set(stockItems.map((it) => it.productId))];
      if (lockIds.length > 0) {
        await tx.$queryRaw`
          SELECT id FROM products WHERE id IN (${Prisma.join(lockIds)}) ORDER BY id FOR NO KEY UPDATE`;
      }
      for (const item of stockItems) {
        const delta = dec(item.quantity).toFixed(3);
        const updated = await tx.$queryRaw<{ stock: string }[]>`
          UPDATE products
          SET stock_quantity = stock_quantity + ${delta}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${item.productId}
          RETURNING stock_quantity::text AS stock`;
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type: 'SALE_VOID',
            quantity: delta,
            stockAfter: qty(updated[0]!.stock),
            unitNetCost: money(item.unitNetCost),
            saleItemId: item.id,
            userId: user.id,
          },
        });
      }

      // 5) Efectivo: lo cobrado en efectivo (neto del vuelto, PA-17) sale de la caja abierta ahora.
      const charged = (p: (typeof sale.payments)[number]) =>
        dec(p.amount).plus(dec(p.surchargeAmount));
      const cashCharged = sale.payments
        .filter((p) => p.paymentMethod.kind === 'CASH')
        .reduce((acc, p) => acc.plus(charged(p)), dec('0'));
      let cashRefund: { cashMovementId: number; cashSessionId: number; amount: string } | null =
        null;
      if (cashCharged.gt(0)) {
        const movement = await tx.cashMovement.create({
          data: {
            cashSessionId: cashSession.id,
            direction: 'OUT',
            reason: 'SALE_VOID_REFUND',
            description: `Anulación de la venta #${saleId}`,
            amount: cashCharged.toFixed(2),
            saleId,
            userId: user.id,
          },
        });
        cashRefund = {
          cashMovementId: movement.id,
          cashSessionId: cashSession.id,
          amount: cashCharged.toFixed(2),
        };
      }

      // 6) Los otros medios se devuelven por fuera (posnet, Mercado Pago): solo se informan.
      const otherRefunds = sale.payments
        .filter((p) => p.paymentMethod.kind !== 'CASH')
        .map((p) => ({
          paymentMethod: {
            id: p.paymentMethod.id,
            kind: p.paymentMethod.kind,
            name: p.paymentMethod.name,
          },
          chargedAmount: charged(p).toFixed(2),
        }));

      // 7) Auditoría (cubre también la salida de caja, NF-08).
      await writeAudit(tx, {
        userId: user.id,
        action: 'SALE_VOID',
        entityType: 'Sale',
        entityId: saleId,
        details: {
          reason: input.reason,
          total: money(sale.total),
          saleCashSessionId: sale.cashSessionId,
          cashRefund,
          otherRefunds,
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
    }, TX_OPTIONS);
  } catch (err) {
    if (isNumericOverflow(err))
      throw new AppError(
        422,
        ERROR_CODES.STOCK_OUT_OF_RANGE,
        'La cantidad es demasiado grande para el stock. Revisá el número.',
      );
    throw err;
  }

  // Respuesta (ya anulada): el reembolso sale de lo guardado, así coincide con la base.
  const row = await loadSaleOrThrow(ctx.prisma, saleId);
  const refund = row.cashMovements[0];
  return parseResponse(VoidSaleResponseSchema, {
    sale: toSaleForRole(row, user.role),
    cashRefund: refund
      ? {
          cashMovementId: refund.id,
          cashSessionId: refund.cashSessionId,
          amount: money(refund.amount),
        }
      : null,
    otherRefunds: row.payments
      .filter((p) => p.paymentMethod.kind !== 'CASH')
      .map((p) => ({
        paymentMethod: p.paymentMethod,
        chargedAmount: dec(p.amount).plus(dec(p.surchargeAmount)).toFixed(2),
      })),
  });
}
