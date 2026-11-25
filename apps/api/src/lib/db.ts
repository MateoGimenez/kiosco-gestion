// Ayudas para hablar con la base: formato de números, errores de PostgreSQL y bloqueos de filas.
import { toDecimal, type Decimal } from '@kiosco/shared';
import type { Prisma } from '../generated/client';

/** Cualquier valor numérico que venga de Prisma (Decimal), de la base como texto o de shared. */
type NumericLike = string | { toString(): string };

/** Convierte a la clase Decimal de shared (nunca pasa por `number`). */
export function dec(value: NumericLike): Decimal {
  return toDecimal(typeof value === 'string' ? value : value.toString());
}

/** Dinero para la API: string con 2 decimales. */
export const money = (value: NumericLike): string => dec(value).toFixed(2);
/** Cantidad para la API: string con 3 decimales. */
export const qty = (value: NumericLike): string => dec(value).toFixed(3);
/** Porcentaje para la API: string con 2 decimales. */
export const pct = (value: NumericLike): string => dec(value).toFixed(2);

/** Cliente o transacción de Prisma. */
export type Tx = Prisma.TransactionClient;

interface PgLikeError {
  code?: string;
  message?: string;
  meta?: { driverAdapterError?: { cause?: { kind?: string; originalCode?: string } } };
}

/** Violación de un UNIQUE (también de un índice por expresión, como `lower(name)`). */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as PgLikeError | null;
  if (!e) return false;
  if (e.code === 'P2002') return true;
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.kind === 'UniqueConstraintViolation' || cause?.originalCode === '23505') return true;
  return /duplicate key|unique constraint/i.test(e.message ?? '');
}

/** "numeric field overflow": el valor no entra en la columna. */
export function isNumericOverflow(err: unknown): boolean {
  const e = err as PgLikeError | null;
  if (!e) return false;
  const cause = e.meta?.driverAdapterError?.cause;
  if (cause?.originalCode === '22003') return true;
  return /numeric field overflow|out of range/i.test(e.message ?? '');
}

/** Bloquea la fila de una categoría hasta el final de la transacción (siempre ANTES que la subcategoría). */
export async function lockCategory(tx: Tx, id: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id} FOR UPDATE`;
}

export async function lockSubcategory(tx: Tx, id: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM subcategories WHERE id = ${id} FOR UPDATE`;
}

/** Escapa `\`, `%` y `_` del texto que va dentro de un LIKE/ILIKE (se usa con el ESCAPE por defecto, `\`). */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
