// Lectura de números escritos a mano ("1.234,5" o "12,5") sin pasar nunca por `number`.
import { Decimal } from '@kiosco/shared';

/**
 * Pasa lo que escribió la persona a un texto con punto decimal ("12,5" -> "12.5").
 * Acepta el punto de miles solo si hay coma ("1.234,5"). Devuelve `null` si no es un número.
 */
export function normalizeDecimalInput(raw: string): string | null {
  const text = raw.trim().replace(/\s/g, '');
  if (text === '') return null;
  let normalized = text;
  if (text.includes(',')) normalized = text.replace(/\./g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(normalized) ? normalized : null;
}

/** Decimal de lo escrito, o `null` si está vacío o no es un número. */
export function parseDecimal(raw: string): Decimal | null {
  const normalized = normalizeDecimalInput(raw);
  return normalized === null ? null : new Decimal(normalized);
}

/** ¿Tiene más decimales de los que se permiten? */
export function exceedsDecimals(value: Decimal, places: number): boolean {
  return !value.toDecimalPlaces(places).equals(value);
}

/** Texto para el campo a partir de un valor de la API ("24.000" -> "24"; "1820.00" -> "1820"). */
export function toInputText(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const text = new Decimal(value).toFixed();
  return text.replace('.', ',');
}

/** Valor para mandar a la API con punto decimal y sin ceros de más. */
export function toApiNumber(value: Decimal): string {
  return value.toFixed();
}
