// Arma las respuestas de productos según el rol (docs/api/productos-stock.md, 2.3).
// Ninguna ruta devuelve el objeto de Prisma: todo pasa por `.parse()` del esquema del rol, que
// descarta las claves que el esquema no tiene (red de seguridad contra filtrar el costo).
import {
  effectiveMargin,
  ProductPricingSchema,
  ProductPublicSchema,
  ProductSaleItemSchema,
  ProductWithCostSchema,
  realMargin,
  suggestedPrice,
  type ProductPricing,
  type ProductPublic,
  type ProductSaleItem,
  type ProductWithCost,
  type UserRole,
} from '@kiosco/shared';
import type { Prisma } from '../../generated/client';
import { dec, money, pct, qty } from '../../lib/db';

export const PRODUCT_INCLUDE = { subcategory: { include: { category: true } } } as const;
export type ProductRow = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** Qué pantalla pide el producto: el catálogo (ficha/lista/edición) o las rutas de precios (alta y /pricing). */
export type ProductView = 'catalog' | 'pricing';

/** Precio sugerido y margen real de un producto (PA-21, PA-22, H-15). Solo usa funciones de `shared`. */
export function computePricing(p: ProductRow, roundingStep: string) {
  const margin = effectiveMargin(
    p.marginPercent,
    p.subcategory.marginPercent,
    p.subcategory.category.marginPercent,
  );
  const net = dec(p.netCostPrice);
  // "Varios" no tiene costo ni sugerido; con costo 0 tampoco se puede sugerir nada.
  const hasCost = !p.isMiscellaneous && !net.isZero();
  const suggested = hasCost
    ? suggestedPrice(net, margin.percent, dec(p.vatRatePercent), roundingStep)
    : null;
  const real = hasCost ? realMargin(dec(p.salePrice), net, dec(p.vatRatePercent)) : null;
  return { margin, suggested, real };
}

function needsRestock(p: Pick<ProductRow, 'stockQuantity' | 'minStock' | 'isMiscellaneous'>) {
  return !p.isMiscellaneous && dec(p.stockQuantity).lte(dec(p.minStock));
}

/** Todos los campos posibles (con costo). Los esquemas del rol descartan lo que sobra. */
function fullProduct(p: ProductRow, roundingStep: string) {
  const { margin, suggested, real } = computePricing(p, roundingStep);
  return {
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    saleUnit: p.saleUnit,
    category: { id: p.subcategory.category.id, name: p.subcategory.category.name },
    subcategory: { id: p.subcategory.id, name: p.subcategory.name },
    salePrice: money(p.salePrice),
    vatRatePercent: pct(p.vatRatePercent),
    stockQuantity: qty(p.stockQuantity),
    minStock: qty(p.minStock),
    needsRestock: needsRestock(p),
    unitsPerPack: p.unitsPerPack === null ? null : qty(p.unitsPerPack),
    isMiscellaneous: p.isMiscellaneous,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    // Datos de precio (solo los conservan los esquemas con costo):
    netCostPrice: money(p.netCostPrice),
    costPrice: money(p.costPrice),
    marginPercent: p.marginPercent === null ? null : pct(p.marginPercent),
    effectiveMarginPercent: pct(margin.percent),
    marginSource: margin.source,
    suggestedPrice: suggested ? suggested.toFixed(2) : null,
    realMarginPercent: real ? real.toFixed(2) : null,
  };
}

/**
 * Producto para la ficha, la lista, el alta y la edición.
 * - `catalog`: OWNER con costo; MANAGER y EMPLOYEE sin costo.
 * - `pricing` (alta): OWNER y MANAGER con costo. El empleado nunca llega acá (403 de la ruta).
 */
export function toProductResponse(
  p: ProductRow,
  role: UserRole,
  view: ProductView,
  roundingStep: string,
): ProductPublic | ProductWithCost {
  const full = fullProduct(p, roundingStep);
  if (view === 'pricing') {
    if (role === 'EMPLOYEE')
      throw new Error('El empleado no puede ver los precios de un producto.');
    return ProductWithCostSchema.parse(full);
  }
  return role === 'OWNER' ? ProductWithCostSchema.parse(full) : ProductPublicSchema.parse(full);
}

/** Pantalla de precios (dueño y encargado). */
export function toProductPricing(p: ProductRow, roundingStep: string): ProductPricing {
  const { margin, suggested, real } = computePricing(p, roundingStep);
  return ProductPricingSchema.parse({
    productId: p.id,
    name: p.name,
    saleUnit: p.saleUnit,
    isMiscellaneous: p.isMiscellaneous,
    vatRatePercent: pct(p.vatRatePercent),
    netCostPrice: money(p.netCostPrice),
    costPrice: money(p.costPrice),
    marginPercent: p.marginPercent === null ? null : pct(p.marginPercent),
    subcategoryMarginPercent:
      p.subcategory.marginPercent === null ? null : pct(p.subcategory.marginPercent),
    categoryMarginPercent: pct(p.subcategory.category.marginPercent),
    effectiveMarginPercent: pct(margin.percent),
    marginSource: margin.source,
    priceRoundingStep: money(roundingStep),
    suggestedPrice: suggested ? suggested.toFixed(2) : null,
    salePrice: money(p.salePrice),
    realMarginPercent: real ? real.toFixed(2) : null,
    matchesSuggestedPrice: suggested !== null && suggested.eq(dec(p.salePrice)),
    updatedAt: p.updatedAt.toISOString(),
  });
}

/** Mostrador: lo mínimo para vender. Nunca costo, para ningún rol. */
export function toProductSaleItem(
  p: ProductRow | Prisma.ProductGetPayload<object>,
): ProductSaleItem {
  return ProductSaleItemSchema.parse({
    id: p.id,
    name: p.name,
    barcode: p.barcode,
    saleUnit: p.saleUnit,
    salePrice: money(p.salePrice),
    stockQuantity: qty(p.stockQuantity),
    isMiscellaneous: p.isMiscellaneous,
  });
}

export { needsRestock };
