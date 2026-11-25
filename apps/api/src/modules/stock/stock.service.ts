// Stock: historial, ajustes, "Para reponer" y stock negativo (docs/api/productos-stock.md, sección 8).
// Regla de oro: `Product.stockQuantity` solo cambia junto con un `StockMovement`, en la misma transacción.
import type { Request } from 'express';
import {
  ERROR_CODES,
  isWholeQuantity,
  StockAdjustmentResponseSchema,
  StockListItemSchema,
  StockMovementSchema,
  StockMovementWithCostSchema,
  type CreateStockAdjustmentRequest,
  type Paginated,
  type StockAdjustmentResponse,
  type StockListItem,
  type StockListQuery,
  type StockMovement,
  type StockMovementListQuery,
  type StockMovementWithCost,
  type UserRole,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { Prisma } from '../../generated/client';
import { dec, isNumericOverflow, money, qty } from '../../lib/db';
import { fieldsError } from '../../lib/owner-fields';
import { PRODUCT_INCLUDE } from '../products/products.mapper';
import { pageProductIds, productConditions } from '../products/products.queries';

const BUENOS_AIRES_OFFSET = '-03:00'; // Argentina no usa horario de verano.

/** Día calendario de Buenos Aires -> instante de inicio (UTC). */
function startOfDay(date: string): Date {
  return new Date(`${date}T00:00:00.000${BUENOS_AIRES_OFFSET}`);
}

type MovementRow = Prisma.StockMovementGetPayload<{
  include: { user: { select: { id: true; fullName: true } } };
}>;

/** Arma el movimiento según el rol: solo el dueño ve `unitNetCost` (es un costo). */
function toMovement(m: MovementRow, role: UserRole): StockMovement | StockMovementWithCost {
  const full = {
    id: m.id,
    productId: m.productId,
    type: m.type,
    quantity: qty(m.quantity),
    stockAfter: qty(m.stockAfter),
    adjustmentReason: m.adjustmentReason,
    note: m.note,
    user: { id: m.user.id, fullName: m.user.fullName },
    // Las ventas y compras llegan en las etapas 3 y 5.
    saleId: null,
    purchaseId: null,
    createdAt: m.createdAt.toISOString(),
    unitNetCost: m.unitNetCost === null ? null : money(m.unitNetCost),
  };
  return role === 'OWNER'
    ? parseResponse(StockMovementWithCostSchema, full)
    : parseResponse(StockMovementSchema, full);
}

const USER_SELECT = { select: { id: true, fullName: true } } as const;

export async function listMovements(
  ctx: AppContext,
  role: UserRole,
  productId: number,
  query: StockMovementListQuery,
): Promise<Paginated<StockMovement | StockMovementWithCost>> {
  const product = await ctx.prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'El producto no existe.');

  const where: Prisma.StockMovementWhereInput = {
    productId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { gte: startOfDay(query.from) } : {}),
            // "to" incluido: hasta el inicio del día siguiente (sin incluirlo).
            ...(query.to ? { lt: new Date(startOfDay(query.to).getTime() + 86_400_000) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.prisma.stockMovement.findMany({
      where,
      include: { user: USER_SELECT },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    ctx.prisma.stockMovement.count({ where }),
  ]);
  return {
    items: rows.map((m) => toMovement(m, role)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

interface LockedProduct {
  id: number;
  sale_unit: 'UNIT' | 'KG';
  is_miscellaneous: boolean;
  is_active: boolean;
  stock: string;
  min_stock: string;
  net_cost: string;
}

export async function createAdjustment(
  ctx: AppContext,
  req: Request,
  productId: number,
  input: CreateStockAdjustmentRequest,
): Promise<StockAdjustmentResponse> {
  const role = req.user!.role;
  const audit = auditContext(req);

  try {
    return await ctx.prisma.$transaction(async (tx) => {
      // Fila del producto bloqueada: dos ajustes (o un ajuste y una venta) al mismo tiempo se
      // hacen de a uno, así `stockAfter` de cada movimiento es exacto.
      const locked = await tx.$queryRaw<LockedProduct[]>`
        SELECT id, sale_unit, is_miscellaneous, is_active,
               stock_quantity::text AS stock, min_stock::text AS min_stock, net_cost_price::text AS net_cost
        FROM products WHERE id = ${productId} FOR UPDATE`;
      const product = locked[0];
      if (!product) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'El producto no existe.');
      if (product.is_miscellaneous)
        throw new AppError(422, ERROR_CODES.MISC_PRODUCT_NO_STOCK, '"Varios" no lleva stock.');

      // Productos por unidad: cantidades enteras (400, con el campo).
      if (product.sale_unit === 'UNIT') {
        const field = input.reason === 'COUNT_CORRECTION' ? 'countedQuantity' : 'quantity';
        const value = input.reason === 'COUNT_CORRECTION' ? input.countedQuantity : input.quantity;
        if (!isWholeQuantity(value))
          throw fieldsError(400, ERROR_CODES.VALIDATION_ERROR, 'Hay datos inválidos.', [
            { path: field, message: 'Este producto se vende por unidad: usá números enteros.' },
          ]);
      }

      const stockBefore = dec(product.stock);
      let quantity: string;
      let stockAfter: string;

      if (input.reason === 'COUNT_CORRECTION') {
        // H-28: se manda lo contado; el servidor calcula la diferencia con el stock actual.
        const counted = dec(input.countedQuantity);
        const diff = counted.minus(stockBefore);
        if (diff.isZero())
          throw new AppError(
            422,
            ERROR_CODES.STOCK_COUNT_UNCHANGED,
            'Lo contado es igual al stock actual: no hay nada que corregir.',
            { stockQuantity: qty(stockBefore) },
          );
        if (diff.abs().gte(1_000_000_000))
          throw new AppError(
            422,
            ERROR_CODES.STOCK_OUT_OF_RANGE,
            'La diferencia entre lo contado y el stock actual es demasiado grande. Revisá la cantidad.',
          );
        quantity = diff.toFixed(3);
        await tx.$executeRaw`
          UPDATE products SET stock_quantity = ${counted.toFixed(3)}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${productId}`;
        stockAfter = counted.toFixed(3);
      } else {
        // Se suma en la MISMA sentencia (UPDATE ... RETURNING): nada pisa el valor de otro.
        quantity = dec(input.quantity).toFixed(3);
        const updated = await tx.$queryRaw<{ stock: string }[]>`
          UPDATE products
          SET stock_quantity = stock_quantity + ${quantity}::numeric, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${productId}
          RETURNING stock_quantity::text AS stock`;
        stockAfter = qty(updated[0]!.stock);
      }

      const note = input.note ?? null;
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          type: 'ADJUSTMENT',
          quantity,
          stockAfter,
          // Costo neto actual: sirve para valorizar roturas, faltantes y consumo propio.
          unitNetCost: money(product.net_cost),
          adjustmentReason: input.reason,
          note,
          userId: req.user!.id,
        },
        include: { user: USER_SELECT },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'STOCK_ADJUST',
        entityType: 'Product',
        entityId: productId,
        details: {
          movementId: movement.id,
          reason: input.reason,
          quantity,
          stockBefore: qty(stockBefore),
          stockAfter,
          note,
          ...(input.reason === 'COUNT_CORRECTION'
            ? { countedQuantity: qty(input.countedQuantity) }
            : {}),
          ...(product.is_active ? {} : { isActive: false }),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });

      const stockAfterDec = dec(stockAfter);
      return parseResponse(StockAdjustmentResponseSchema, {
        movement: toMovement(movement, role),
        product: {
          id: productId,
          stockQuantity: qty(stockAfter),
          minStock: qty(product.min_stock),
          needsRestock: stockAfterDec.lte(dec(product.min_stock)),
        },
      });
    });
  } catch (err) {
    // El resultado no entra en la columna (9 enteros): se avisa en vez de dar 500.
    if (isNumericOverflow(err))
      throw new AppError(
        422,
        ERROR_CODES.STOCK_OUT_OF_RANGE,
        'La cantidad es demasiado grande para el stock. Revisá el número.',
      );
    throw err;
  }
}

// --- Listas -------------------------------------------------------------------------------------

async function stockList(
  ctx: AppContext,
  query: StockListQuery,
  extra: Prisma.Sql,
  orderBy: Prisma.Sql,
): Promise<Paginated<StockListItem>> {
  const where = productConditions({
    search: query.search,
    categoryId: query.categoryId,
    subcategoryId: query.subcategoryId,
    extra: [extra],
  });
  const { ids, total } = await pageProductIds(
    ctx.prisma,
    where,
    orderBy,
    query.page,
    query.pageSize,
  );
  const rows = ids.length
    ? await ctx.prisma.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const items = ids.flatMap((id) => {
    const p = byId.get(id);
    if (!p) return [];
    const shortfall = dec(p.minStock).minus(dec(p.stockQuantity));
    return [
      parseResponse(StockListItemSchema, {
        id: p.id,
        name: p.name,
        barcode: p.barcode,
        saleUnit: p.saleUnit,
        categoryName: p.subcategory.category.name,
        subcategoryName: p.subcategory.name,
        stockQuantity: qty(p.stockQuantity),
        minStock: qty(p.minStock),
        shortfall: (shortfall.isNegative() ? dec('0') : shortfall).toFixed(3),
        isActive: p.isActive,
      }),
    ];
  });
  return { items, page: query.page, pageSize: query.pageSize, total };
}

/** "Para reponer" (PA-26, H-30): activos, no "Varios", stock <= mínimo (también con mínimo 0). */
export async function listRestock(ctx: AppContext, query: StockListQuery) {
  return stockList(
    ctx,
    query,
    Prisma.sql`(p.is_active AND NOT p.is_miscellaneous AND p.stock_quantity <= p.min_stock)`,
    Prisma.sql`GREATEST(0, p.min_stock - p.stock_quantity) DESC, lower(p.name) ASC, p.id ASC`,
  );
}

/** Stock negativo (STK-07): activos y desactivados, no "Varios". El más negativo primero. */
export async function listNegative(ctx: AppContext, query: StockListQuery) {
  return stockList(
    ctx,
    query,
    Prisma.sql`(NOT p.is_miscellaneous AND p.stock_quantity < 0)`,
    Prisma.sql`p.stock_quantity ASC, lower(p.name) ASC, p.id ASC`,
  );
}
