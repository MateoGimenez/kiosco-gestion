// Productos y precios (docs/api/productos-stock.md, secciones 6 y 7).
import type { Request } from 'express';
import {
  ERROR_CODES,
  finalFromNet,
  realMargin,
  isWholeQuantity,
  toDecimal,
  type CreateProductRequest,
  type Paginated,
  type ProductBackoffice,
  type ProductListQuery,
  type ProductPricing,
  type ProductPublic,
  type ProductSaleItem,
  type ProductSearchQuery,
  type ProductSearchResponse,
  type ProductWithCost,
  type UpdateProductPricingRequest,
  type UpdateProductRequest,
  type UserRole,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import type { Product } from '../../generated/client';
import {
  dec,
  isUniqueViolation,
  lockCategory,
  lockSubcategory,
  money,
  pct,
  qty,
  type Tx,
} from '../../lib/db';
import { fieldsError } from '../../lib/owner-fields';
import { getRoundingStep } from '../settings/settings.service';
import {
  PRODUCT_INCLUDE,
  toProductPricing,
  toProductResponse,
  toProductSaleItem,
  type ProductRow,
} from './products.mapper';
import {
  pageProductIds,
  productConditions,
  productOrderBy,
  searchActiveProductIdsByName,
} from './products.queries';

/** Lo más grande que entra en una columna Decimal(14,2) (12 enteros). */
const MAX_MONEY = toDecimal('1000000000000');

// --- Lecturas ------------------------------------------------------------------------------------

async function findRowOrThrow(db: Tx, id: number): Promise<ProductRow> {
  const row = await db.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'El producto no existe.');
  return row;
}

/** Trae las filas por id y las deja en el orden de `ids`. */
async function rowsInOrder(db: Tx, ids: number[]): Promise<ProductRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({ where: { id: { in: ids } }, include: PRODUCT_INCLUDE });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** Búsqueda del mostrador (6.1). Siempre `ProductSaleItem`, también para el dueño. */
export async function searchProducts(
  ctx: AppContext,
  query: ProductSearchQuery,
): Promise<ProductSearchResponse> {
  const q = query.q;
  // 1) Código de barras exacto (índice único).
  const byBarcode = await ctx.prisma.product.findUnique({ where: { barcode: q } });
  if (byBarcode?.isActive) {
    return {
      matchedBy: 'BARCODE',
      items: [toProductSaleItem(byBarcode)],
      isInactiveBarcode: false,
    };
  }
  // 2) Por nombre, solo activos.
  const ids = await searchActiveProductIdsByName(ctx.prisma, q, query.limit);
  const rows = await rowsInOrder(ctx.prisma, ids);
  return {
    matchedBy: 'NAME',
    items: rows.map(toProductSaleItem),
    isInactiveBarcode: byBarcode !== null && !byBarcode.isActive,
  };
}

/** El producto "Varios" para el atajo del mostrador (ventas.md 9). Como la búsqueda: sin costo, para cualquier rol. */
export async function getMiscellaneousProduct(ctx: AppContext): Promise<ProductSaleItem> {
  const row = await ctx.prisma.product.findFirst({ where: { isMiscellaneous: true } });
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'No existe el producto "Varios".');
  return toProductSaleItem(row);
}

export async function listProducts(
  ctx: AppContext,
  role: UserRole,
  query: ProductListQuery,
): Promise<Paginated<ProductPublic | ProductBackoffice | ProductWithCost>> {
  // El proveedor habitual no es del empleado (etapa 5): ni el campo ni los filtros.
  if (role === 'EMPLOYEE') {
    const sent = (['supplierId', 'withoutSupplier'] as const).filter((k) => query[k] !== undefined);
    if (sent.length > 0)
      throw new AppError(
        403,
        ERROR_CODES.FORBIDDEN,
        'No tenés permiso para filtrar por proveedor.',
        {
          fields: sent,
        },
      );
  }
  const where = productConditions({
    supplierId: query.supplierId,
    withoutSupplier: query.withoutSupplier === 'true',
    search: query.search,
    categoryId: query.categoryId,
    subcategoryId: query.subcategoryId,
    isActive: query.isActive,
    saleUnit: query.saleUnit,
    needsRestock: query.needsRestock,
  });
  const { ids, total } = await pageProductIds(
    ctx.prisma,
    where,
    productOrderBy(query.sortBy, query.sortOrder),
    query.page,
    query.pageSize,
  );
  const [rows, step] = await Promise.all([
    rowsInOrder(ctx.prisma, ids),
    getRoundingStep(ctx.prisma),
  ]);
  return {
    items: rows.map((r) => toProductResponse(r, role, 'catalog', step)),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getProduct(
  ctx: AppContext,
  role: UserRole,
  id: number,
): Promise<ProductPublic | ProductBackoffice | ProductWithCost> {
  const row = await findRowOrThrow(ctx.prisma, id);
  return toProductResponse(row, role, 'catalog', await getRoundingStep(ctx.prisma));
}

export async function getPricing(ctx: AppContext, id: number): Promise<ProductPricing> {
  const row = await findRowOrThrow(ctx.prisma, id);
  return toProductPricing(row, await getRoundingStep(ctx.prisma));
}

// --- Reglas comunes ------------------------------------------------------------------------------

const WHOLE_MESSAGE = 'Este producto se vende por unidad: usá números enteros.';

/** STK regla 2: en un producto por unidad, las cantidades son enteras (400, con el campo). */
function assertWholeForUnit(
  unit: 'UNIT' | 'KG',
  fields: Record<string, string | null | undefined>,
) {
  if (unit !== 'UNIT') return;
  const bad = Object.entries(fields).filter(([, v]) => v != null && !isWholeQuantity(v));
  if (bad.length > 0) {
    throw fieldsError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Hay datos inválidos.',
      bad.map(([path]) => ({ path, message: WHOLE_MESSAGE })),
    );
  }
}

function barcodeTaken(other: { id: number; name: string }): AppError {
  return new AppError(
    409,
    ERROR_CODES.BARCODE_TAKEN,
    'Ese código de barras ya es de otro producto.',
    { field: 'barcode', productId: other.id, productName: other.name },
  );
}

/** El código es único entre TODOS los productos, activos o no. */
async function assertBarcodeFree(db: Tx, barcode: string | null, exceptId?: number) {
  if (barcode === null) return;
  const other = await db.product.findUnique({
    where: { barcode },
    select: { id: true, name: true },
  });
  if (other && other.id !== exceptId) throw barcodeTaken(other);
}

/**
 * Bloquea categoría y subcategoría (en ese orden) y exige que las dos estén activas.
 * Evita que una desactivación de la categoría y el alta/reactivación de un producto, al mismo
 * tiempo, dejen un producto activo dentro de una categoría desactivada (H-27).
 */
async function lockActiveSubcategory(tx: Tx, subcategoryId: number): Promise<void> {
  const found = await tx.subcategory.findUnique({
    where: { id: subcategoryId },
    select: { categoryId: true },
  });
  if (!found)
    throw new AppError(422, ERROR_CODES.SUBCATEGORY_NOT_FOUND, 'La subcategoría no existe.', {
      field: 'subcategoryId',
    });
  await lockCategory(tx, found.categoryId);
  await lockSubcategory(tx, subcategoryId);
  const sub = await tx.subcategory.findUnique({
    where: { id: subcategoryId },
    include: { category: true },
  });
  if (!sub)
    throw new AppError(422, ERROR_CODES.SUBCATEGORY_NOT_FOUND, 'La subcategoría no existe.', {
      field: 'subcategoryId',
    });
  if (!sub.isActive || !sub.category.isActive)
    throw new AppError(
      422,
      ERROR_CODES.SUBCATEGORY_INACTIVE,
      'La subcategoría (o su categoría) está desactivada.',
      { field: 'subcategoryId' },
    );
}

/** `costPrice` = R-1(neto × (1 + IVA)) con el IVA del producto (H-25). Falla si no entra en la columna. */
function finalCost(net: string, vat: string): string {
  const cost = finalFromNet(net, vat);
  if (cost.gte(MAX_MONEY))
    throw fieldsError(400, ERROR_CODES.VALIDATION_ERROR, 'Hay datos inválidos.', [
      { path: 'netCostPrice', message: 'El importe es demasiado grande.' },
    ]);
  return cost.toFixed(2);
}

/**
 * Venta a pérdida: el precio queda por debajo del costo final (o el margen real es negativo).
 * Sin `confirmBelowCost: true` → 422 PRICE_BELOW_COST con los datos para el aviso. Solo se llama en
 * las rutas donde el encargado y el dueño ya ven costos (alta y /pricing).
 */
function assertNotBelowCost(
  net: string,
  cost: string,
  vat: string,
  price: string,
  confirmed: boolean | undefined,
): boolean {
  if (dec(net).isZero()) return false;
  const margin = realMargin(price, net, vat);
  const below = dec(price).lt(dec(cost)) || (margin !== null && margin.isNegative());
  if (!below) return false;
  if (!confirmed)
    throw new AppError(
      422,
      ERROR_CODES.PRICE_BELOW_COST,
      'El precio de venta queda por debajo del costo. Confirmá si querés guardarlo igual.',
      {
        salePrice: money(price),
        costPrice: money(cost),
        realMarginPercent: margin ? margin.toFixed(2) : null,
      },
    );
  return true;
}

// --- Alta ----------------------------------------------------------------------------------------

export async function createProduct(
  ctx: AppContext,
  req: Request,
  input: CreateProductRequest,
): Promise<ProductWithCost> {
  const role = req.user!.role;
  const audit = auditContext(req);
  assertWholeForUnit(input.saleUnit, {
    minStock: input.minStock,
    unitsPerPack: input.unitsPerPack,
    initialStock: input.initialStock,
  });
  const vat = input.vatRatePercent ? dec(input.vatRatePercent).toFixed(2) : '21.00';
  const net = dec(input.netCostPrice ?? '0').toFixed(2);
  const costPrice = finalCost(net, vat);
  const barcode = input.barcode ?? null;
  const initialStock = input.initialStock ? dec(input.initialStock) : null;
  const soldAtLoss = assertNotBelowCost(
    net,
    costPrice,
    vat,
    input.salePrice,
    input.confirmBelowCost,
  );

  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      await lockActiveSubcategory(tx, input.subcategoryId);
      await assertBarcodeFree(tx, barcode);
      if (input.defaultSupplierId != null)
        await assertSupplierAssignable(tx, input.defaultSupplierId, null);

      const created = await tx.product.create({
        data: {
          name: input.name,
          barcode,
          saleUnit: input.saleUnit,
          subcategoryId: input.subcategoryId,
          netCostPrice: net,
          costPrice,
          vatRatePercent: vat,
          marginPercent: input.marginPercent ?? null,
          salePrice: input.salePrice,
          // El stock inicial entra como movimiento (abajo): acá siempre arranca en 0.
          stockQuantity: '0',
          minStock: input.minStock ?? '0',
          unitsPerPack: input.unitsPerPack ?? null,
          defaultSupplierId: input.defaultSupplierId ?? null,
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'PRODUCT_CREATE',
        entityType: 'Product',
        entityId: created.id,
        details: {
          after: {
            name: created.name,
            barcode: created.barcode,
            saleUnit: created.saleUnit,
            subcategoryId: created.subcategoryId,
            vatRatePercent: pct(created.vatRatePercent),
            netCostPrice: money(created.netCostPrice),
            costPrice: money(created.costPrice),
            marginPercent: created.marginPercent === null ? null : pct(created.marginPercent),
            salePrice: money(created.salePrice),
            minStock: qty(created.minStock),
            defaultSupplierId: created.defaultSupplierId,
            unitsPerPack: created.unitsPerPack === null ? null : qty(created.unitsPerPack),
          },
          ...(soldAtLoss ? { confirmedBelowCost: true } : {}),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });

      // Stock inicial = un ajuste "carga inicial" (el stock solo cambia con movimientos).
      if (initialStock && initialStock.gt(0)) {
        const stock = initialStock.toFixed(3);
        await tx.product.update({ where: { id: created.id }, data: { stockQuantity: stock } });
        const movement = await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: 'ADJUSTMENT',
            quantity: stock,
            stockAfter: stock,
            unitNetCost: net,
            adjustmentReason: 'INITIAL_LOAD',
            userId: req.user!.id,
          },
        });
        await writeAudit(tx, {
          userId: req.user?.id ?? null,
          action: 'STOCK_ADJUST',
          entityType: 'Product',
          entityId: created.id,
          details: {
            movementId: movement.id,
            reason: 'INITIAL_LOAD',
            quantity: stock,
            stockBefore: '0.000',
            stockAfter: stock,
            note: null,
          },
          channel: audit.channel,
          ipAddress: audit.ipAddress,
        });
      }
      return created.id;
    });
    const row = await findRowOrThrow(ctx.prisma, id);
    return toProductResponse(
      row,
      role,
      'pricing',
      await getRoundingStep(ctx.prisma),
    ) as ProductWithCost;
  } catch (err) {
    if (isUniqueViolation(err) && barcode !== null) {
      const other = await ctx.prisma.product.findUnique({
        where: { barcode },
        select: { id: true, name: true },
      });
      if (other) throw barcodeTaken(other);
    }
    throw err;
  }
}

// --- Edición -------------------------------------------------------------------------------------

/** Campos que se pueden editar de "Varios" (H-32). */
const MISC_EDITABLE = new Set(['name', 'vatRatePercent']);

/** El proveedor habitual tiene que existir y, si es nuevo para el producto, estar activo (etapa 5). */
async function assertSupplierAssignable(tx: Tx, supplierId: number, currentId: number | null) {
  // FOR SHARE: mientras se guarda el producto, nadie desactiva al proveedor.
  const rows = await tx.$queryRaw<{ is_active: boolean }[]>`
    SELECT is_active FROM suppliers WHERE id = ${supplierId} FOR SHARE`;
  const supplier = rows[0] ? { isActive: rows[0].is_active } : null;
  if (!supplier) throw new AppError(422, ERROR_CODES.SUPPLIER_NOT_FOUND, 'El proveedor no existe.');
  if (!supplier.isActive && supplierId !== currentId)
    throw new AppError(422, ERROR_CODES.SUPPLIER_INACTIVE, 'El proveedor está desactivado.');
}

type Snapshot = {
  name: string;
  barcode: string | null;
  saleUnit: string;
  subcategoryId: number;
  vatRatePercent: string;
  minStock: string;
  unitsPerPack: string | null;
  defaultSupplierId: number | null;
  isActive: boolean;
};

function snapshot(p: Product): Snapshot {
  return {
    name: p.name,
    barcode: p.barcode,
    saleUnit: p.saleUnit,
    subcategoryId: p.subcategoryId,
    vatRatePercent: pct(p.vatRatePercent),
    minStock: qty(p.minStock),
    unitsPerPack: p.unitsPerPack === null ? null : qty(p.unitsPerPack),
    defaultSupplierId: p.defaultSupplierId,
    isActive: p.isActive,
  };
}

export async function updateProduct(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateProductRequest,
): Promise<ProductPublic | ProductBackoffice | ProductWithCost> {
  const role = req.user!.role;
  const audit = auditContext(req);

  try {
    const updatedId = await ctx.prisma.$transaction(async (tx) => {
      // Se bloquea la fila: el "antes" de la auditoría y los controles de abajo son exactos.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
      const current = await findRowOrThrow(tx, id);

      // H-32: de "Varios" solo se editan nombre e IVA (cualquier otro campo, aunque no cambie, es 422).
      if (current.isMiscellaneous) {
        const locked = Object.keys(input).filter(
          (k) => input[k as keyof UpdateProductRequest] !== undefined && !MISC_EDITABLE.has(k),
        );
        if (locked.length > 0)
          throw fieldsError(
            422,
            ERROR_CODES.MISC_PRODUCT_LOCKED,
            'Del producto "Varios" solo se pueden cambiar el nombre y el IVA.',
            locked.map((path) => ({
              path,
              message: 'Este campo no se puede cambiar en "Varios".',
            })),
          );
      }

      const unit = input.saleUnit ?? current.saleUnit;
      // Lo que llega en el pedido se mira con la unidad FINAL (400, como un error de formato).
      assertWholeForUnit(unit, { minStock: input.minStock, unitsPerPack: input.unitsPerPack });
      // Pasar a "por unidad" con stock, mínimo o bulto decimales: primero se corrige (422).
      if (unit === 'UNIT' && current.saleUnit !== 'UNIT') {
        const stored: Record<string, string | null> = {
          stockQuantity: qty(current.stockQuantity),
          ...(input.minStock === undefined ? { minStock: qty(current.minStock) } : {}),
          ...(input.unitsPerPack === undefined && current.unitsPerPack !== null
            ? { unitsPerPack: qty(current.unitsPerPack) }
            : {}),
        };
        const bad = Object.entries(stored).filter(([, v]) => v !== null && !isWholeQuantity(v));
        if (bad.length > 0)
          throw fieldsError(
            422,
            ERROR_CODES.SALE_UNIT_NOT_WHOLE,
            'Para venderlo por unidad, el stock y el mínimo tienen que ser enteros.',
            bad.map(([path]) => ({ path, message: WHOLE_MESSAGE })),
          );
      }

      // Qué cambia de verdad.
      const before = snapshot(current);
      const next: Snapshot = { ...before };
      if (input.name !== undefined) next.name = input.name;
      if (input.barcode !== undefined) next.barcode = input.barcode;
      if (input.saleUnit !== undefined) next.saleUnit = input.saleUnit;
      if (input.subcategoryId !== undefined) next.subcategoryId = input.subcategoryId;
      if (input.vatRatePercent !== undefined) next.vatRatePercent = pct(input.vatRatePercent);
      if (input.minStock !== undefined) next.minStock = qty(input.minStock);
      if (input.unitsPerPack !== undefined)
        next.unitsPerPack = input.unitsPerPack === null ? null : qty(input.unitsPerPack);
      if (input.defaultSupplierId !== undefined) next.defaultSupplierId = input.defaultSupplierId;
      if (input.isActive !== undefined) next.isActive = input.isActive;

      const changed = (Object.keys(next) as (keyof Snapshot)[]).filter(
        (k) => next[k] !== before[k],
      );
      if (changed.length === 0) return id; // 200 sin auditar

      // H-26: al reactivar, o al cambiar de subcategoría, la subcategoría y su categoría tienen que estar activas.
      if ((!before.isActive && next.isActive) || next.subcategoryId !== before.subcategoryId)
        await lockActiveSubcategory(tx, next.subcategoryId);
      if (next.barcode !== before.barcode) await assertBarcodeFree(tx, next.barcode, id);
      if (next.defaultSupplierId !== before.defaultSupplierId && next.defaultSupplierId !== null)
        await assertSupplierAssignable(tx, next.defaultSupplierId, before.defaultSupplierId);

      await tx.product.update({
        where: { id },
        data: {
          name: next.name,
          barcode: next.barcode,
          saleUnit: next.saleUnit as 'UNIT' | 'KG',
          subcategoryId: next.subcategoryId,
          vatRatePercent: next.vatRatePercent,
          minStock: next.minStock,
          unitsPerPack: next.unitsPerPack,
          defaultSupplierId: next.defaultSupplierId,
          isActive: next.isActive,
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'PRODUCT_UPDATE',
        entityType: 'Product',
        entityId: id,
        details: {
          before: Object.fromEntries(changed.map((k) => [k, before[k]])),
          after: Object.fromEntries(changed.map((k) => [k, next[k]])),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return id;
    });
    const row = await findRowOrThrow(ctx.prisma, updatedId);
    return toProductResponse(row, role, 'catalog', await getRoundingStep(ctx.prisma));
  } catch (err) {
    if (isUniqueViolation(err) && input.barcode) {
      const other = await ctx.prisma.product.findUnique({
        where: { barcode: input.barcode },
        select: { id: true, name: true },
      });
      if (other && other.id !== id) throw barcodeTaken(other);
    }
    throw err;
  }
}

// --- Cambio manual de precio, costo o margen -------------------------------------------------------

export async function updatePricing(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateProductPricingRequest,
): Promise<ProductPricing> {
  const audit = auditContext(req);

  const updatedId = await ctx.prisma.$transaction(async (tx) => {
    // Fila bloqueada: el "antes" del PriceChange es exacto aunque dos personas cambien a la vez.
    await tx.$queryRaw`SELECT id FROM products WHERE id = ${id} FOR UPDATE`;
    const current = await findRowOrThrow(tx, id);
    if (current.isMiscellaneous)
      throw new AppError(
        422,
        ERROR_CODES.MISC_PRODUCT_LOCKED,
        'El producto "Varios" no tiene costo ni precio guardado: el precio se escribe al vender.',
      );

    const before: Record<string, string | null> = {};
    const after: Record<string, string | null> = {};
    const data: {
      salePrice?: string;
      netCostPrice?: string;
      costPrice?: string;
      marginPercent?: string | null;
    } = {};

    if (input.salePrice !== undefined && !dec(input.salePrice).eq(dec(current.salePrice))) {
      before.salePrice = money(current.salePrice);
      after.salePrice = money(input.salePrice);
      data.salePrice = after.salePrice;
    }
    if (
      input.netCostPrice !== undefined &&
      !dec(input.netCostPrice).eq(dec(current.netCostPrice))
    ) {
      // H-25: el costo final se calcula con el IVA del producto.
      const newCost = finalCost(money(input.netCostPrice), pct(current.vatRatePercent));
      before.netCostPrice = money(current.netCostPrice);
      after.netCostPrice = money(input.netCostPrice);
      before.costPrice = money(current.costPrice);
      after.costPrice = newCost;
      data.netCostPrice = after.netCostPrice;
      data.costPrice = newCost;
    }
    if (input.marginPercent !== undefined) {
      const same =
        input.marginPercent === null || current.marginPercent === null
          ? input.marginPercent === null && current.marginPercent === null
          : dec(input.marginPercent).eq(dec(current.marginPercent));
      if (!same) {
        before.marginPercent = current.marginPercent === null ? null : pct(current.marginPercent);
        after.marginPercent = input.marginPercent === null ? null : pct(input.marginPercent);
        data.marginPercent = after.marginPercent;
      }
    }

    // Si no cambió nada: 200 sin PriceChange ni auditoría.
    if (Object.keys(after).length === 0) return id;

    // Venta a pérdida: solo se controla si cambia el precio o el costo (no un margen).
    let soldAtLoss = false;
    if (data.salePrice !== undefined || data.netCostPrice !== undefined) {
      soldAtLoss = assertNotBelowCost(
        data.netCostPrice ?? money(current.netCostPrice),
        data.costPrice ?? money(current.costPrice),
        pct(current.vatRatePercent),
        data.salePrice ?? money(current.salePrice),
        input.confirmBelowCost,
      );
    }

    await tx.product.update({ where: { id }, data });
    const change = await tx.priceChange.create({
      data: {
        productId: id,
        source: 'MANUAL',
        oldNetCostPrice: current.netCostPrice,
        newNetCostPrice: data.netCostPrice ?? current.netCostPrice,
        oldCostPrice: current.costPrice,
        newCostPrice: data.costPrice ?? current.costPrice,
        oldSalePrice: current.salePrice,
        newSalePrice: data.salePrice ?? current.salePrice,
        oldMarginPercent: current.marginPercent,
        newMarginPercent:
          'marginPercent' in data ? (data.marginPercent ?? null) : current.marginPercent,
        userId: req.user!.id,
      },
    });
    await writeAudit(tx, {
      userId: req.user?.id ?? null,
      action: 'PRICE_CHANGE',
      entityType: 'Product',
      entityId: id,
      details: {
        priceChangeId: change.id,
        before,
        after,
        ...(soldAtLoss ? { confirmedBelowCost: true } : {}),
      },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return id;
  });
  return toProductPricing(
    await findRowOrThrow(ctx.prisma, updatedId),
    await getRoundingStep(ctx.prisma),
  );
}
