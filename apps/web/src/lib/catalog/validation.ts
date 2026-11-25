// Controles de formato de los formularios (los mismos que hace el servidor, para avisar antes).
import type { Decimal } from '@kiosco/shared';
import { exceedsDecimals, numberFormatError, parseDecimal } from './decimalInput';
import type { SaleUnit } from './types';

export interface DecimalCheck {
  value: Decimal | null;
  error?: string;
}

/** Dinero o costo: número, 0 o más, hasta 2 decimales. Vacío = `value: null` sin error. */
export function checkMoney(text: string, label: string): DecimalCheck {
  if (text.trim() === '') return { value: null };
  const value = parseDecimal(text);
  if (value === null)
    return {
      value: null,
      error: numberFormatError(
        text,
        `${label}: escribí solo números. Por ejemplo: 1500 o 1500,50.`,
      ),
    };
  if (value.isNegative()) return { value: null, error: `${label} no puede ser negativo.` };
  if (exceedsDecimals(value, 2)) return { value: null, error: `${label}: usá hasta 2 decimales.` };
  if (value.gte('1000000000000')) return { value: null, error: `${label} es demasiado grande.` };
  return { value };
}

/** Porcentaje: 0 a 9999,99 con hasta 2 decimales. */
export function checkPercent(text: string, label: string): DecimalCheck {
  if (text.trim() === '') return { value: null };
  const value = parseDecimal(text);
  if (value === null)
    return {
      value: null,
      error: numberFormatError(text, `${label}: escribí solo números. Por ejemplo: 40 o 12,5.`),
    };
  if (value.isNegative()) return { value: null, error: `${label} no puede ser negativo.` };
  if (exceedsDecimals(value, 2)) return { value: null, error: `${label}: usá hasta 2 decimales.` };
  if (value.gt('9999.99')) return { value: null, error: `${label} es demasiado grande.` };
  return { value };
}

/** Cantidad: entera si el producto es por unidad, hasta 3 decimales si es por kg. */
export function checkQuantity(text: string, unit: SaleUnit, label: string): DecimalCheck {
  if (text.trim() === '') return { value: null };
  const value = parseDecimal(text);
  if (value === null)
    return { value: null, error: numberFormatError(text, `${label}: escribí solo números.`) };
  if (value.isNegative()) return { value: null, error: `${label} no puede ser negativo.` };
  if (unit === 'UNIT' && !value.isInteger()) {
    return { value: null, error: 'Este producto se vende por unidad: usá números enteros.' };
  }
  if (exceedsDecimals(value, 3)) return { value: null, error: `${label}: usá hasta 3 decimales.` };
  if (value.gte('1000000000')) return { value: null, error: `${label} es demasiado grande.` };
  return { value };
}
