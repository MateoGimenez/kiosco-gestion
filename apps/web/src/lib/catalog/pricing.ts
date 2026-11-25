// Cálculo del precio sugerido en vivo. Usa las mismas funciones de @kiosco/shared que el backend,
// así lo que se ve acá es lo que el servidor va a recalcular (docs/api/productos-stock.md 7.1).
import {
  Decimal,
  effectiveMargin,
  finalFromNet,
  formatMoney,
  formatMoneyWithCents,
  netFromFinal,
  realMargin,
  suggestedPrice,
} from '@kiosco/shared';
import type { MarginSource } from './types';

export interface MarginChoice {
  percent: string;
  source: MarginSource;
}

/** Margen que se usa: producto, si no subcategoría, si no categoría (PA-22). */
export function chooseMargin(
  productMargin: string | null | undefined,
  subcategoryMargin: string | null | undefined,
  categoryMargin: string,
): MarginChoice {
  const chosen = effectiveMargin(
    productMargin === '' ? null : productMargin,
    subcategoryMargin === '' ? null : subcategoryMargin,
    categoryMargin,
  );
  return { percent: chosen.percent.toFixed(), source: chosen.source };
}

/** Precio sugerido, o `null` si el costo es 0 (no hay de dónde calcularlo). */
export function liveSuggestedPrice(
  netCost: Decimal | null,
  marginPercent: string | null,
  vatPercent: string,
  step: string,
): Decimal | null {
  if (netCost === null || netCost.lte(0) || marginPercent === null) return null;
  return suggestedPrice(netCost, marginPercent, vatPercent, step);
}

/** Margen real de un precio puesto a mano (a 2 decimales), o `null` si no se puede calcular. */
export function liveRealMargin(
  price: Decimal | null,
  netCost: Decimal | null,
  vatPercent: string,
): Decimal | null {
  if (price === null || netCost === null) return null;
  return realMargin(price, netCost, vatPercent);
}

export { finalFromNet, netFromFinal };

/** Precio de venta: sin centavos si es redondo, con centavos si no ("$ 1.820" o "$ 1.820,50"). */
export function formatPrice(value: string | Decimal): string {
  const d = new Decimal(typeof value === 'string' ? value : value.toString());
  return d.isInteger() ? formatMoney(d) : formatMoneyWithCents(d);
}
