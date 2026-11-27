// Ventas, anulaciones y medios de pago (docs/api/ventas.md, sección 4).
// Requests estrictos (campo desconocido -> 400); respuestas no estrictas.
// Dinero, cantidades y porcentajes viajan como string (ADR 002).
import { z } from 'zod';
import { DISCOUNT_TYPES, PAYMENT_METHOD_KINDS, SALE_STATUSES, SALE_UNITS } from '../enums';
import { toDecimal } from '../decimal';
import {
  DateOnlySchema,
  MAX_MONEY_INTEGER_DIGITS,
  MONEY_TOO_BIG_MESSAGE,
  MoneyInputSchema,
  PaginationQueryShape,
  PercentInputSchema,
  QuantityInputSchema,
  QueryIdSchema,
} from '../common/schemas';
import { ShiftSchema } from '../cash/schemas';

export const PaymentMethodKindSchema = z.enum(PAYMENT_METHOD_KINDS);
export const SaleStatusSchema = z.enum(SALE_STATUSES);

const isPositive = (v: string) => {
  try {
    return toDecimal(v).gt(0);
  } catch {
    return false;
  }
};

/** UUID del carrito. Se guarda en minúsculas. */
export const ClientRequestIdSchema = z
  .uuid('Tiene que ser un UUID.')
  .transform((v) => v.toLowerCase());

/** Pesos enteros > 0 ("4500", "4500.00"; no "4500.50"). Lo cobrado es en pesos enteros (PA-20). */
export const WholePesosInputSchema = z
  .string('Tiene que ser un texto con el importe.')
  .regex(/^\d+(\.0{1,2})?$/, {
    error: 'Ingresá un importe en pesos enteros.',
    abort: true,
  })
  .regex(new RegExp(`^\\d{1,${MAX_MONEY_INTEGER_DIGITS}}(\\.|$)`), {
    error: MONEY_TOO_BIG_MESSAGE,
    abort: true,
  })
  .refine(isPositive, 'Tiene que ser mayor que 0.');

export const PositiveQuantityInputSchema = QuantityInputSchema.refine(
  isPositive,
  'Tiene que ser mayor que 0.',
);
export const PositiveMoneyInputSchema = MoneyInputSchema.refine(
  isPositive,
  'Tiene que ser mayor que 0.',
);
const PositivePercentInputSchema = PercentInputSchema.refine(
  isPositive,
  'Tiene que ser mayor que 0.',
);

/** Motivo opcional de un descuento: `trim`, hasta 200; "" = sin motivo. */
const DiscountReasonSchema = z
  .string()
  .trim()
  .max(200, 'Es demasiado largo (máximo 200 caracteres).')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

export const SaleDiscountInputSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('AMOUNT'),
    value: PositiveMoneyInputSchema,
    reason: DiscountReasonSchema,
  }),
  z.strictObject({
    type: z.literal('PERCENT'),
    value: PositivePercentInputSchema,
    reason: DiscountReasonSchema,
  }),
]);
export type SaleDiscountInput = z.infer<typeof SaleDiscountInputSchema>;
export const DiscountTypeSchema = z.enum(DISCOUNT_TYPES);

export const VoidReasonSchema = z
  .string('Escribí el motivo de la anulación.')
  .trim()
  .min(1, 'Escribí el motivo de la anulación.')
  .max(200, 'Es demasiado largo (máximo 200 caracteres).');

// --- Requests ----------------------------------------------------------------------------------

const IdSchema = z.number().int().positive().max(2_147_483_647);

export const SaleLineInputSchema = z.strictObject({
  productId: IdSchema,
  quantity: PositiveQuantityInputSchema,
  /** SOLO "Varios" (obligatorio ahí). En otro producto: 422 LINE_FIELD_NOT_ALLOWED. */
  unitPrice: PositiveMoneyInputSchema.optional(),
  /** SOLO "Varios", opcional (H-09). */
  customDescription: z
    .string()
    .trim()
    .max(120, 'Es demasiado larga (máximo 120 caracteres).')
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional(),
});
export type SaleLineInput = z.infer<typeof SaleLineInputSchema>;

export const SalePaymentInputSchema = z.strictObject({
  paymentMethodId: IdSchema,
  /** SIN recargo (ventas.md 2.2). */
  amount: WholePesosInputSchema,
});
export type SalePaymentInput = z.infer<typeof SalePaymentInputSchema>;

export const CreateSaleRequestSchema = z.strictObject({
  clientRequestId: ClientRequestIdSchema,
  items: z.array(SaleLineInputSchema).min(1, 'Agregá al menos un producto.').max(200),
  discount: SaleDiscountInputSchema.nullable().optional(),
  payments: z.array(SalePaymentInputSchema).min(1, 'Agregá al menos un pago.').max(10),
  cashTendered: MoneyInputSchema.nullable().optional(),
  /** Total CON recargo que mostró la pantalla. Solo se compara (H-33). */
  expectedTotal: WholePesosInputSchema,
});
export type CreateSaleRequest = z.infer<typeof CreateSaleRequestSchema>;

export const VoidSaleRequestSchema = z.strictObject({ reason: VoidReasonSchema });
export type VoidSaleRequest = z.infer<typeof VoidSaleRequestSchema>;

export const SaleListQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    from: DateOnlySchema.optional(),
    to: DateOnlySchema.optional(),
    cashSessionId: QueryIdSchema.optional(),
    status: SaleStatusSchema.optional(),
    userId: QueryIdSchema.optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type SaleListQuery = z.infer<typeof SaleListQuerySchema>;

export const UpdatePaymentMethodRequestSchema = z
  .strictObject({
    surchargePercent: PercentInputSchema.refine(
      (v) => toDecimal(v).lte(100),
      'Tiene que estar entre 0 y 100.',
    ).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Mandá al menos un campo para cambiar.',
  });
export type UpdatePaymentMethodRequest = z.infer<typeof UpdatePaymentMethodRequestSchema>;

// --- Respuestas --------------------------------------------------------------------------------

export const PaymentMethodSchema = z.object({
  id: z.number().int(),
  kind: PaymentMethodKindSchema,
  name: z.string(),
  surchargePercent: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  updatedAt: z.string(),
});
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const PaymentMethodListResponseSchema = z.object({ items: z.array(PaymentMethodSchema) });
export type PaymentMethodListResponse = z.infer<typeof PaymentMethodListResponseSchema>;

const UserRefSchema = z.object({ id: z.number().int(), fullName: z.string() });
const PaymentMethodRefSchema = z.object({
  id: z.number().int(),
  kind: PaymentMethodKindSchema,
  name: z.string(),
});

export const SaleItemSchema = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  customDescription: z.string().nullable(),
  isMiscellaneous: z.boolean(),
  saleUnit: z.enum(SALE_UNITS),
  quantity: z.string(),
  unitPrice: z.string(),
  vatRatePercent: z.string(),
  lineSubtotal: z.string(),
  discountAmount: z.string(),
  lineTotal: z.string(),
  lineNetTotal: z.string(),
});
export type SaleItem = z.infer<typeof SaleItemSchema>;

/** Solo dueño. */
export const SaleItemWithCostSchema = SaleItemSchema.extend({
  unitNetCost: z.string(),
  unitCost: z.string(),
  lineProfit: z.string().nullable(),
});
export type SaleItemWithCost = z.infer<typeof SaleItemWithCostSchema>;

export const SalePaymentSchema = z.object({
  id: z.number().int(),
  paymentMethod: PaymentMethodRefSchema,
  amount: z.string(),
  surchargeBase: z.string(),
  surchargePercent: z.string(),
  surchargeAmount: z.string(),
  chargedAmount: z.string(),
});
export type SalePayment = z.infer<typeof SalePaymentSchema>;

export const SaleSchema = z.object({
  id: z.number().int(),
  status: SaleStatusSchema,
  businessDate: z.string(),
  createdAt: z.string(),
  cashSession: z.object({ id: z.number().int(), shift: ShiftSchema, businessDate: z.string() }),
  user: UserRefSchema,
  subtotal: z.string(),
  discountAmount: z.string(),
  discountPercent: z.string().nullable(),
  discountReason: z.string().nullable(),
  amountDue: z.string(),
  surchargeAmount: z.string(),
  total: z.string(),
  items: z.array(SaleItemSchema),
  payments: z.array(SalePaymentSchema),
  voidedAt: z.string().nullable(),
  voidedBy: UserRefSchema.nullable(),
  voidReason: z.string().nullable(),
  voidRefund: z
    .object({
      cashMovementId: z.number().int(),
      cashSessionId: z.number().int(),
      amount: z.string(),
    })
    .nullable(),
});
export type Sale = z.infer<typeof SaleSchema>;

/** Solo dueño, solo en GET /api/sales/:id y en la anulación. */
export const SaleWithCostSchema = SaleSchema.extend({
  items: z.array(SaleItemWithCostSchema),
  grossProfit: z.string(),
});
export type SaleWithCost = z.infer<typeof SaleWithCostSchema>;

export const StockWarningSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
  stockAfter: z.string(),
});
export type StockWarning = z.infer<typeof StockWarningSchema>;

/**
 * Etapa 5 (deuda de seguridad de la etapa 4): la venta que recibe el EMPLEADO en el cobro, sin los
 * datos de la anulación (quién anuló, el motivo y la devolución). También en el reintento de una
 * venta que ya se anuló.
 */
export const SalePosSchema = SaleSchema.omit({
  voidedBy: true,
  voidReason: true,
  voidRefund: true,
});
export type SalePos = z.infer<typeof SalePosSchema>;

export const CreateSaleResponseSchema = z.object({
  /** Siempre SIN costos (mostrador). Para el empleado, sin los datos de la anulación (`SalePos`). */
  sale: z.union([SaleSchema, SalePosSchema]),
  isReplay: z.boolean(),
  change: z.string().nullable(),
  stockWarnings: z.array(StockWarningSchema),
});
export type CreateSaleResponse = z.infer<typeof CreateSaleResponseSchema>;

export const VoidSaleResponseSchema = z.object({
  sale: z.union([SaleWithCostSchema, SaleSchema]),
  cashRefund: z
    .object({
      cashMovementId: z.number().int(),
      cashSessionId: z.number().int(),
      amount: z.string(),
    })
    .nullable(),
  otherRefunds: z.array(
    z.object({ paymentMethod: PaymentMethodRefSchema, chargedAmount: z.string() }),
  ),
});
export type VoidSaleResponse = z.infer<typeof VoidSaleResponseSchema>;

export const SaleListItemSchema = z.object({
  id: z.number().int(),
  status: SaleStatusSchema,
  businessDate: z.string(),
  createdAt: z.string(),
  cashSession: z.object({ id: z.number().int(), shift: ShiftSchema }),
  user: UserRefSchema,
  itemCount: z.number().int(),
  hasMiscellaneous: z.boolean(),
  subtotal: z.string(),
  discountAmount: z.string(),
  surchargeAmount: z.string(),
  total: z.string(),
  payments: z.array(
    z.object({ kind: PaymentMethodKindSchema, name: z.string(), chargedAmount: z.string() }),
  ),
  voidedAt: z.string().nullable(),
});
export type SaleListItem = z.infer<typeof SaleListItemSchema>;

export const SaleListResponseSchema = z.object({
  items: z.array(SaleListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
