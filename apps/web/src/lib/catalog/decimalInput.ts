// Lectura de números escritos a mano ("1.234,5" o "12,5") sin pasar nunca por `number`.
import { Decimal } from '@kiosco/shared';

/** Mensaje cuando el punto está mal usado (por ejemplo "1.5"): en es-AR el decimal es la coma. */
export const BAD_DOT_MESSAGE = 'Usá coma para los decimales (ej.: 1.500,50)';

// Enteros con punto de miles en grupos de 3 ("1.500", "12.345.678") o sin puntos ("1500").
const INTEGER_PART = /^([1-9]\d{0,2}(\.\d{3})+|\d+)$/;

/**
 * Pasa lo que escribió la persona a un texto con punto decimal ("12,5" -> "12.5").
 * Formato es-AR: la coma es el decimal; el punto solo vale como separador de miles, en grupos
 * de 3 ("1.500", "12.345,67"). Cualquier otro punto ("1.5", "1.5000") es inválido.
 * Devuelve `null` si no es un número válido.
 */
export function normalizeDecimalInput(raw: string): string | null {
  const text = raw.trim().replace(/\s/g, '');
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const [intPart = '', decPart, ...rest] = body.split(',');
  if (rest.length > 0 || !INTEGER_PART.test(intPart)) return null;
  if (decPart !== undefined && !/^\d+$/.test(decPart)) return null;
  const digits = intPart.replace(/\./g, '');
  return `${negative ? '-' : ''}${digits}${decPart === undefined ? '' : `.${decPart}`}`;
}

/** ¿Lo escrito tiene un punto que no es de miles (por ejemplo "1.5")? Sirve para dar el aviso justo. */
export function hasMisplacedDot(raw: string): boolean {
  const text = raw.trim();
  return text.includes('.') && /^-?[\d.,]+$/.test(text) && normalizeDecimalInput(text) === null;
}

/** Mensaje de error para un texto que no es un número: el del punto, o el genérico que se pasa. */
export function numberFormatError(raw: string, generic: string): string {
  return hasMisplacedDot(raw) ? BAD_DOT_MESSAGE : generic;
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
