// Formato es-AR de dinero y cantidades (ADR 002, punto 8).
// Se arma a mano (punto de miles ".", coma decimal ",") para que dé lo mismo en cualquier
// navegador o Node, sin depender de la configuración regional (es-AR agrupa también los 4 dígitos).
import { Decimal, toDecimal, type DecimalInput } from '../decimal';
import { roundToCents, roundToPeso } from './rounding';

function formatNumber(value: Decimal, decimals: number, minDecimals = decimals): string {
  const fixed = value.abs().toFixed(decimals, Decimal.ROUND_HALF_UP);
  const [intPart = '0', decPart = ''] = fixed.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  // Se recortan los ceros de más, pero se respeta el mínimo de decimales.
  const trimmed = decPart.replace(/0+$/, '').padEnd(minDecimals, '0');
  const sign = value.isNegative() && !value.abs().isZero() ? '-' : '';
  return sign + grouped + (trimmed ? ',' + trimmed : '');
}

/** Lo cobrado, sin centavos: "$ 1.440" (redondea al peso). */
export function formatMoney(value: DecimalInput): string {
  const rounded = roundToPeso(value);
  return (rounded.isNegative() ? '-' : '') + '$ ' + formatNumber(rounded.abs(), 0);
}

/** Costos y netos, con centavos: "$ 1.234,56". */
export function formatMoneyWithCents(value: DecimalInput): string {
  const rounded = roundToCents(value);
  return (rounded.isNegative() ? '-' : '') + '$ ' + formatNumber(rounded.abs(), 2);
}

/** Cantidad: por unidad sin decimales ("2"); por peso con hasta 3 ("0,350 kg" con `unit = 'KG'`). */
export function formatQuantity(value: DecimalInput, unit: 'UNIT' | 'KG' = 'UNIT'): string {
  const qty = toDecimal(value);
  if (unit === 'UNIT') return formatNumber(qty, 0);
  return formatNumber(qty, 3, 3) + ' kg';
}

/** Porcentaje: "21 %" o "10,5 %". */
export function formatPercent(value: DecimalInput): string {
  return formatNumber(toDecimal(value), 2, 0) + ' %';
}
