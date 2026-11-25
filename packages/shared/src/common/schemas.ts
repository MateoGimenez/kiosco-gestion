// Esquemas comunes de la API (docs/api/README.md y docs/api/productos-stock.md, sección 3.1).
// Dinero, cantidades y porcentajes viajan SIEMPRE como string (ADR 002): un número de JSON es 400.
import { z } from 'zod';
import { toDecimal } from '../decimal';
import { VAT_RATES } from '../enums';

/** `:id` de la ruta: entero positivo que entra en un Int de PostgreSQL. */
export const IdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Tiene que ser un número entero positivo.')
    .transform(Number)
    .refine((n) => n <= 2_147_483_647, 'Tiene que ser un número entero positivo.'),
});
export type IdParam = z.infer<typeof IdParamSchema>;

/** Decimal de un texto, o `null` si no es un número (los controles de abajo nunca lanzan). */
function decimalOrNull(value: string): ReturnType<typeof toDecimal> | null {
  try {
    return toDecimal(value);
  } catch {
    return null;
  }
}

// --- Entradas numéricas (requests) ----------------------------------------------

/** Dinero ≥ 0, hasta 2 decimales. */
export const MoneyInputSchema = z
  .string('Tiene que ser un texto con el importe.')
  .regex(/^\d{1,12}(\.\d{1,2})?$/, {
    error: 'Ingresá un importe válido (hasta 2 decimales).',
    abort: true,
  });

/** Cantidad ≥ 0, hasta 3 decimales. */
export const QuantityInputSchema = z
  .string('Tiene que ser un texto con la cantidad.')
  .regex(/^\d{1,9}(\.\d{1,3})?$/, {
    error: 'Ingresá una cantidad válida (hasta 3 decimales).',
    abort: true,
  });

/** Cantidad con signo y distinta de 0 (solo en el ajuste de stock). */
export const SignedQuantityInputSchema = z
  .string('Tiene que ser un texto con la cantidad.')
  .regex(/^-?\d{1,9}(\.\d{1,3})?$/, {
    error: 'Ingresá una cantidad válida (hasta 3 decimales).',
    abort: true,
  })
  .refine((v) => decimalOrNull(v)?.isZero() === false, 'La cantidad no puede ser 0.');

/** Porcentaje (margen) de 0 a 9999,99. */
export const PercentInputSchema = z
  .string('Tiene que ser un texto con el porcentaje.')
  .regex(/^\d{1,4}(\.\d{1,2})?$/, {
    error: 'Ingresá un porcentaje válido (hasta 2 decimales).',
    abort: true,
  });

/** Alícuota de IVA: acepta "21", "21.00", "10.5", "10.50". */
export const VatRateInputSchema = z
  .string('Tiene que ser un texto con el porcentaje.')
  .regex(/^\d{1,2}(\.\d{1,2})?$/, { error: 'Elegí una alícuota de IVA válida.', abort: true })
  .refine(
    (v) => VAT_RATES.some((r) => decimalOrNull(v)?.eq(toDecimal(r)) === true),
    'Elegí una alícuota de IVA válida (0, 2,5, 5, 10,5, 21 o 27).',
  );

// --- Listas ----------------------------------------------------------------------

const PAGE_MESSAGE = 'Tiene que ser un número entero positivo.';

export const PageSchema = z
  .string()
  .regex(/^[1-9]\d{0,6}$/, PAGE_MESSAGE)
  .transform(Number);

export const PageSizeSchema = z
  .string()
  .regex(/^\d{1,3}$/, 'Tiene que ser un número entre 1 y 200.')
  .transform(Number)
  .refine((n) => n >= 1 && n <= 200, 'Tiene que ser un número entre 1 y 200.');

/** Parámetros de paginación de una query string (README 5), con sus valores por defecto. */
export const PaginationQueryShape = {
  page: PageSchema.default(1),
  pageSize: PageSizeSchema.default(50),
};

/** Respuesta paginada (README 5). */
export function PaginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });
}
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Booleano de una query string. */
export const QueryBooleanSchema = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Entero positivo de una query string (ids de filtro). */
export const QueryIdSchema = z
  .string()
  .regex(/^[1-9]\d{0,9}$/, PAGE_MESSAGE)
  .transform(Number)
  .refine((n) => n <= 2_147_483_647, PAGE_MESSAGE);

/** Fecha sin hora `YYYY-MM-DD` que existe en el calendario. */
export const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00.000Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'La fecha no existe.');
