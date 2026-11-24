// Clase Decimal propia de @kiosco/shared (ADR 002, punto 1.3).
// Se clona la librería para no depender de la configuración global de nadie más.
// 40 dígitos significativos alcanzan de sobra para importes de 14 dígitos con divisiones intermedias.
import DecimalBase from 'decimal.js';

export const Decimal = DecimalBase.clone({
  precision: 40,
  // "Mitad hacia arriba" (alejándose de cero): es simétrico, así redondear(-x) = -redondear(x).
  rounding: DecimalBase.ROUND_HALF_UP,
});
export type Decimal = DecimalBase;

/**
 * Valor de dinero, cantidad o porcentaje que aceptan las funciones.
 * Nunca `number`: los números de coma flotante no son exactos (ADR 002).
 */
export type DecimalInput = string | Decimal;

/** Convierte un string o Decimal a la clase Decimal de shared. Lanza error si no es un número válido. */
export function toDecimal(value: DecimalInput): Decimal {
  // Se convierte por string para no mezclar copias de la librería (por ejemplo, Prisma.Decimal).
  return new Decimal(typeof value === 'string' ? value : value.toString());
}
