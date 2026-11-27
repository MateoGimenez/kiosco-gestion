// Teléfono argentino, CUIT y pedido sugerido (docs/api/proveedores.md, secciones 3, 4 y 11).
// Funciones puras: las usan el formulario de la pantalla y el servidor.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';

/** Mensaje cuando un teléfono no se puede llevar a 10 dígitos (proveedores.md 4). */
export const AR_PHONE_MESSAGE =
  'Escribí el código de área sin el 0 y el número sin el 15 (10 números en total). Ej.: 11 2345-6789 o 351 555-1234.';

/**
 * Lleva lo que escribió la persona a los 10 dígitos nacionales (área sin 0 + número sin 15), o
 * devuelve `null` si no se puede (proveedores.md 4):
 * 1. se sacan espacios, `-`, `.`, `(`, `)` y `+`; si queda algo que no es dígito, no sirve;
 * 2. si empieza con `00`, se saca;
 * 3. si empieza con `54` y tiene 12 o 13 dígitos, se saca el `54` (y un `9` que le siga);
 * 4. si empieza con `0`, se saca;
 * 5. tienen que quedar exactamente 10 dígitos.
 */
export function normalizeArPhone(input: string): string | null {
  let digits = input.replace(/[\s\-.()+]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  return /^\d{10}$/.test(digits) ? digits : null;
}

/** "1123456789" -> "11 2345-6789"; "3515551234" -> "351 555-1234". Solo para mostrar. */
export function formatArPhone(phone: string): string {
  if (!/^\d{10}$/.test(phone)) return phone;
  // Código de área de 2 dígitos (11, 22x...) solo para Buenos Aires (11); el resto, de 3 (heurística de pantalla).
  const areaLength = phone.startsWith('11') ? 2 : 3;
  const area = phone.slice(0, areaLength);
  const rest = phone.slice(areaLength);
  const split = rest.length - 4;
  return `${area} ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Lo que va en `wa.me`: "549" + los 10 dígitos. */
export function toWhatsAppPhone(phone: string): string {
  return `549${phone}`;
}

/**
 * CUIT/CUIL de 11 dígitos con dígito verificador (módulo 11). Acepta "20123456786" o
 * "20-12345678-6". No valida que el prefijo exista.
 */
export function isValidCuit(input: string): boolean {
  const digits = input.trim().replace(/-/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  // El guion solo puede estar en la forma estándar "NN-NNNNNNNN-N".
  if (input.includes('-') && !/^\d{2}-\d{8}-\d$/.test(input.trim())) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

/** Solo los 11 dígitos (sin guiones). */
export function normalizeCuit(input: string): string {
  return input.trim().replace(/-/g, '');
}

// --- Pedido sugerido ----------------------------------------------------------------------------

/** Cantidad sugerida: max(mínimo − stock, 1) (PA-26, H-08 b). Con 3 decimales. */
export function suggestedOrderQuantity(stock: DecimalInput, minStock: DecimalInput): Decimal {
  const missing = toDecimal(minStock).minus(toDecimal(stock));
  return Decimal.max(missing, new Decimal(1));
}

export interface SupplierOrderLine {
  name: string;
  saleUnit: 'UNIT' | 'KG';
  quantity: DecimalInput;
}

/** Cantidad en es-AR: por unidad sin decimales; por peso con hasta 3 decimales sin ceros de más. */
function orderQuantity(quantity: Decimal, saleUnit: 'UNIT' | 'KG'): string {
  if (saleUnit === 'UNIT') return quantity.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0);
  const text = quantity
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP)
    .toFixed(3)
    .replace(/\.?0+$/, '');
  return `${text.replace('.', ',')} kg`;
}

/** Texto del pedido (proveedores.md 11.3). Omite las líneas con cantidad 0. Sin precios ni costos. */
export function buildSupplierOrderText(input: {
  storeName: string;
  supplierName: string;
  lines: SupplierOrderLine[];
}): string {
  const lines = input.lines
    .filter((l) => toDecimal(l.quantity).gt(0))
    .map((l) => `- ${orderQuantity(toDecimal(l.quantity), l.saleUnit)} x ${l.name}`);
  return [`Hola, ${input.supplierName}. Pedido de ${input.storeName}:`, ...lines, 'Gracias.'].join(
    '\n',
  );
}

/** Link de WhatsApp con el texto escrito; `null` si el proveedor no tiene teléfono. */
export function buildWhatsAppUrl(whatsappPhone: string | null, text: string): string | null {
  if (!whatsappPhone) return null;
  return `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`;
}
