// Venta a pérdida (docs/api/productos-stock.md 7.4): se permite, pero con confirmación explícita.
import type { Decimal } from '@kiosco/shared';
import { ApiError } from '../api';
import { liveRealMargin } from './pricing';

export interface BelowCostDetails {
  salePrice: string;
  costPrice: string;
  realMarginPercent: string;
}

/** Detalles del `422 PRICE_BELOW_COST`, o `null` si el error es otro. */
export function belowCostDetails(error: unknown): BelowCostDetails | null {
  if (!(error instanceof ApiError) || error.code !== 'PRICE_BELOW_COST') return null;
  const d = error.details;
  if (
    d &&
    typeof d.salePrice === 'string' &&
    typeof d.costPrice === 'string' &&
    typeof d.realMarginPercent === 'string'
  ) {
    return {
      salePrice: d.salePrice,
      costPrice: d.costPrice,
      realMarginPercent: d.realMarginPercent,
    };
  }
  return null;
}

/** ¿Con este precio y este costo se vende a pérdida? (margen real negativo, calculado con shared). */
export function sellsBelowCost(
  price: Decimal | null,
  netCost: Decimal | null,
  vatPercent: string,
): boolean {
  const margin = liveRealMargin(price, netCost, vatPercent);
  return margin !== null && margin.isNegative() && !margin.isZero();
}
