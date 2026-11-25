// Cadena de margen (PA-22): margen del producto, si no el de la subcategoría, si no el de la categoría.
import { toDecimal, type Decimal, type DecimalInput } from '../decimal';
import type { MarginSource } from '../enums';

export interface EffectiveMargin {
  /** Margen que se usa, en % (por ejemplo, 40 = 40 %). */
  percent: Decimal;
  /** De dónde salió. */
  source: MarginSource;
}

/**
 * Margen que se usa para el precio sugerido: producto → subcategoría → categoría (PA-22).
 * `null` en el producto o la subcategoría significa "hereda". Un margen de 0 es un valor válido
 * (no hereda): por eso se compara contra `null` y no contra "falsy".
 */
export function effectiveMargin(
  productMargin: DecimalInput | null | undefined,
  subcategoryMargin: DecimalInput | null | undefined,
  categoryMargin: DecimalInput,
): EffectiveMargin {
  if (productMargin != null) return { percent: toDecimal(productMargin), source: 'PRODUCT' };
  if (subcategoryMargin != null)
    return { percent: toDecimal(subcategoryMargin), source: 'SUBCATEGORY' };
  return { percent: toDecimal(categoryMargin), source: 'CATEGORY' };
}
