// Stock: historial, ajustes y listas (docs/api/productos-stock.md, sección 8).
import { z } from 'zod';
import { STOCK_ADJUSTMENT_REASONS, STOCK_MOVEMENT_TYPES } from '../enums';
import { toDecimal } from '../decimal';
import {
  DateOnlySchema,
  PaginationQueryShape,
  QuantityInputSchema,
  QueryIdSchema,
  SignedQuantityInputSchema,
} from '../common/schemas';

export const StockMovementTypeSchema = z.enum(STOCK_MOVEMENT_TYPES);
export const StockAdjustmentReasonSchema = z.enum(STOCK_ADJUSTMENT_REASONS);

// --- Respuestas (no estrictas) ------------------------------------------------------------------

/** Movimiento sin costo (encargado). */
export const StockMovementSchema = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  type: StockMovementTypeSchema,
  quantity: z.string(),
  stockAfter: z.string(),
  adjustmentReason: StockAdjustmentReasonSchema.nullable(),
  note: z.string().nullable(),
  user: z.object({ id: z.number().int(), fullName: z.string() }),
  /** Etapa 3: en los movimientos SALE y SALE_VOID es el id de la venta (por la línea); en el resto, null. */
  saleId: z.number().int().nullable(),
  /** Etapa 5; en esta etapa siempre null. */
  purchaseId: z.number().int().nullable(),
  createdAt: z.string(),
});
export type StockMovement = z.infer<typeof StockMovementSchema>;

/** Solo dueño: con el costo neto del movimiento. */
export const StockMovementWithCostSchema = StockMovementSchema.extend({
  unitNetCost: z.string().nullable(),
});
export type StockMovementWithCost = z.infer<typeof StockMovementWithCostSchema>;

export const StockAdjustmentProductSchema = z.object({
  id: z.number().int(),
  stockQuantity: z.string(),
  minStock: z.string(),
  needsRestock: z.boolean(),
});

export const StockAdjustmentResponseSchema = z.object({
  movement: z.union([StockMovementWithCostSchema, StockMovementSchema]),
  product: StockAdjustmentProductSchema,
});
export type StockAdjustmentResponse = z.infer<typeof StockAdjustmentResponseSchema>;

export const StockListItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  barcode: z.string().nullable(),
  saleUnit: z.enum(['UNIT', 'KG']),
  categoryName: z.string(),
  subcategoryName: z.string(),
  stockQuantity: z.string(),
  minStock: z.string(),
  shortfall: z.string(),
  isActive: z.boolean(),
  defaultSupplier: z.object({ id: z.number().int(), name: z.string() }).nullable(),
});
export type StockListItem = z.infer<typeof StockListItemSchema>;

// --- Requests (estrictos) -----------------------------------------------------------------------

export const StockMovementListQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    type: StockMovementTypeSchema.optional(),
    from: DateOnlySchema.optional(),
    to: DateOnlySchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type StockMovementListQuery = z.infer<typeof StockMovementListQuerySchema>;

export const StockListQuerySchema = z.strictObject({
  ...PaginationQueryShape,
  search: z.string().trim().min(1).max(100).optional(),
  categoryId: QueryIdSchema.optional(),
  subcategoryId: QueryIdSchema.optional(),
  /** REP-07: para reponer de un proveedor. */
  supplierId: QueryIdSchema.optional(),
});
export type StockListQuery = z.infer<typeof StockListQuerySchema>;

/** Nota: sin espacios en los extremos, hasta 500 caracteres; vacía = sin nota. */
const OptionalNoteSchema = z
  .string()
  .trim()
  .max(500, 'Es demasiado larga (máximo 500 caracteres).')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const isNegative = (v: string) => v.startsWith('-');

const negativeQuantity = (label: string) =>
  SignedQuantityInputSchema.refine(isNegative, `${label} resta stock: usá un número negativo.`);
const PositiveQuantitySchema = SignedQuantityInputSchema.refine(
  (v) => !isNegative(v),
  'La carga inicial suma stock: usá un número positivo.',
);

/**
 * Ajuste de stock: unión por `reason` (H-28, H-29). El conteo manda lo CONTADO; el resto, cuánto
 * sumar o restar con el signo que corresponde al motivo. Mandar `quantity` en un conteo o
 * `countedQuantity` en otro motivo es un campo desconocido (400).
 */
export const CreateStockAdjustmentRequestSchema = z.discriminatedUnion('reason', [
  z.strictObject({
    reason: z.literal('COUNT_CORRECTION'),
    countedQuantity: QuantityInputSchema,
    note: OptionalNoteSchema,
  }),
  z.strictObject({
    reason: z.literal('BREAKAGE'),
    quantity: negativeQuantity('La rotura'),
    note: OptionalNoteSchema,
  }),
  z.strictObject({
    reason: z.literal('MISSING'),
    quantity: negativeQuantity('El faltante'),
    note: OptionalNoteSchema,
  }),
  z.strictObject({
    reason: z.literal('OWN_CONSUMPTION'),
    quantity: negativeQuantity('El consumo propio'),
    note: OptionalNoteSchema,
  }),
  z.strictObject({
    reason: z.literal('INITIAL_LOAD'),
    quantity: PositiveQuantitySchema,
    note: OptionalNoteSchema,
  }),
  z.strictObject({
    reason: z.literal('OTHER'),
    quantity: SignedQuantityInputSchema,
    note: z
      .string('Escribí una nota para el motivo "otro".')
      .trim()
      .min(1, 'Escribí una nota para el motivo "otro".')
      .max(500, 'Es demasiado larga (máximo 500 caracteres).'),
  }),
]);
export type CreateStockAdjustmentRequest = z.infer<typeof CreateStockAdjustmentRequestSchema>;

/** Enteros de una cantidad como string: sirve para chequear "entero" en productos por unidad. */
export function isWholeQuantity(value: string): boolean {
  return toDecimal(value).isInteger();
}
