// Fórmulas de dinero (ADR 002, punto 6). `%` se escribe como número: "40" = 40 %.
// Todo recibe y devuelve string o Decimal; nunca number.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';
import { roundPriceUp, roundToCents, roundToPeso } from './rounding';

/** Factor `1 + porcentaje/100` (por ejemplo, IVA 21 → 1,21). */
function factor(percent: DecimalInput): Decimal {
  return toDecimal(percent).div(100).plus(1);
}

/** Costo final desde el neto (compras): R-1( neto × (1 + IVA/100) ). */
export function finalFromNet(net: DecimalInput, vatPercent: DecimalInput): Decimal {
  return roundToCents(toDecimal(net).times(factor(vatPercent)));
}

/** Neto sin IVA desde un importe final (por ejemplo, una línea de venta): R-1( final ÷ (1 + IVA/100) ). */
export function netFromFinal(final: DecimalInput, vatPercent: DecimalInput): Decimal {
  return roundToCents(toDecimal(final).div(factor(vatPercent)));
}

/**
 * Precio sugerido (H-15 a + PA-19):
 * R-3( costoNeto × (1 + margen/100) × (1 + IVA venta/100) ).
 * El margen se aplica al costo NETO y después se suma el IVA.
 */
export function suggestedPrice(
  netCost: DecimalInput,
  marginPercent: DecimalInput,
  vatPercent: DecimalInput,
  step: DecimalInput = '10',
): Decimal {
  const raw = toDecimal(netCost).times(factor(marginPercent)).times(factor(vatPercent));
  return roundPriceUp(raw, step);
}

/**
 * Margen real (en %) de un precio de venta final (con IVA) sobre el costo neto:
 * ((precio ÷ (1 + IVA/100)) − costoNeto) ÷ costoNeto × 100, a 2 decimales.
 * Es la inversa de `suggestedPrice` (sin el redondeo comercial). Devuelve `null` si el costo es 0.
 */
export function realMargin(
  price: DecimalInput,
  netCost: DecimalInput,
  vatPercent: DecimalInput,
): Decimal | null {
  const cost = toDecimal(netCost);
  if (cost.isZero()) return null;
  const netPrice = toDecimal(price).div(factor(vatPercent));
  return roundToCents(netPrice.minus(cost).div(cost).times(100));
}

/** Importe de una línea de venta: R-2( cantidad × precio unitario ). Ej.: 0,350 × 4.990 → 1.747. */
export function lineSubtotal(quantity: DecimalInput, unitPrice: DecimalInput): Decimal {
  return roundToPeso(toDecimal(quantity).times(toDecimal(unitPrice)));
}

/** Descuento en %: R-2( subtotal × porcentaje/100 ). */
export function discountFromPercent(subtotal: DecimalInput, percent: DecimalInput): Decimal {
  return roundToPeso(toDecimal(subtotal).times(toDecimal(percent)).div(100));
}

/**
 * Reparto del descuento entre las líneas (modelo D6): proporcional al subtotal de cada línea,
 * a centavos (R-1). La diferencia de redondeo va a la ÚLTIMA línea, así la suma da exacto.
 */
export function allocateDiscount(lineSubtotals: DecimalInput[], discount: DecimalInput): Decimal[] {
  const subtotals = lineSubtotals.map(toDecimal);
  const total = subtotals.reduce((acc, s) => acc.plus(s), new Decimal(0));
  const totalDiscount = toDecimal(discount);
  if (subtotals.length === 0) return [];
  if (total.lte(0)) throw new RangeError('El subtotal tiene que ser mayor que 0.');
  const shares: Decimal[] = [];
  let allocated = new Decimal(0);
  subtotals.forEach((s, i) => {
    const isLast = i === subtotals.length - 1;
    const share = isLast
      ? totalDiscount.minus(allocated)
      : roundToCents(totalDiscount.times(s).div(total));
    allocated = allocated.plus(share);
    shares.push(share);
  });
  return shares;
}

export interface CreditSurcharge {
  /** Lo que valía la parte pagada con crédito ANTES del descuento (a centavos). */
  surchargeBase: Decimal;
  /** Recargo en pesos enteros. */
  surchargeAmount: Decimal;
}

/**
 * Recargo de crédito (PA-14 + H-11 a): antes del descuento y solo sobre la parte pagada con crédito.
 * surchargeBase   = R-1( amount × subtotal ÷ (subtotal − descuento) )
 * surchargeAmount = R-2( surchargeBase × % ÷ 100 )
 * `amount` es lo pagado con crédito, SIN recargo y después del descuento.
 * El descuento tiene que ser menor que el subtotal (H-10 b: no hay ventas de $ 0).
 */
export function creditSurcharge(
  amount: DecimalInput,
  subtotal: DecimalInput,
  discount: DecimalInput,
  surchargePercent: DecimalInput,
): CreditSurcharge {
  const sub = toDecimal(subtotal);
  const disc = toDecimal(discount);
  const afterDiscount = sub.minus(disc);
  if (disc.isNegative() || afterDiscount.lte(0)) {
    throw new RangeError('El descuento tiene que ser menor que el subtotal.');
  }
  const surchargeBase = roundToCents(toDecimal(amount).times(sub).div(afterDiscount));
  const surchargeAmount = roundToPeso(surchargeBase.times(toDecimal(surchargePercent)).div(100));
  return { surchargeBase, surchargeAmount };
}
