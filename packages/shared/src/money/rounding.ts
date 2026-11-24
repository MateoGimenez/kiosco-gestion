// Los tres redondeos del sistema (ADR 002, punto 5). Cada uno vive en UNA sola función.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';

/** R-1: redondeo técnico a centavos (2 decimales, mitad hacia arriba). Para cálculos intermedios. */
export function roundToCents(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * R-2: redondeo al cobrar, al peso entero más cercano; $ 0,50 sube (H-06 a).
 * Se usa en el importe de cada línea, el descuento y el recargo.
 */
export function roundToPeso(value: DecimalInput): Decimal {
  return toDecimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * R-3: redondeo comercial de precios, SIEMPRE hacia arriba al múltiplo de `step` (PA-19).
 * Si ya es múltiplo, queda igual. Con `step = 0` no hay redondeo comercial: solo R-1.
 */
export function roundPriceUp(value: DecimalInput, step: DecimalInput = '10'): Decimal {
  const stepValue = toDecimal(step);
  if (stepValue.isNegative()) throw new RangeError('El paso de redondeo no puede ser negativo.');
  if (stepValue.isZero()) return roundToCents(value);
  return toDecimal(value).div(stepValue).ceil().times(stepValue);
}
