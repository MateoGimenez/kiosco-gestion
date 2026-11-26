// Proveedores, cuenta corriente, pagos y pedido sugerido (docs/api/proveedores.md, sección 3).
// Requests estrictos (campo desconocido -> 400); respuestas no estrictas.
import { z } from 'zod';
import {
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_STATUSES,
  SALE_UNITS,
  SUPPLIER_ENTRY_TYPES,
  SUPPLIER_PAYMENT_SOURCES,
  WEEKDAYS,
} from '../enums';
import {
  DateOnlySchema,
  PaginationQueryShape,
  QueryBooleanSchema,
  SignedMoneyInputSchema,
} from '../common/schemas';
import { ClientRequestIdSchema, PositiveMoneyInputSchema } from '../sales/schemas';
import { AR_PHONE_MESSAGE, isValidCuit, normalizeArPhone, normalizeCuit } from './phone';

export const WeekdaySchema = z.enum(WEEKDAYS);
export const SupplierEntryTypeSchema = z.enum(SUPPLIER_ENTRY_TYPES);
export const SupplierPaymentSourceSchema = z.enum(SUPPLIER_PAYMENT_SOURCES);

const IdSchema = z.number().int().positive().max(2_147_483_647);
const UserRefSchema = z.object({ id: z.number().int(), fullName: z.string() });

// --- Campos ---------------------------------------------------------------------------------------

export const SupplierNameSchema = z
  .string('Ingresá el nombre.')
  .trim()
  .min(1, 'Ingresá el nombre.')
  .max(80, 'Es demasiado largo (máximo 80 caracteres).');

/** Días de visita: sin repetidos, de 0 a 7; se guardan ordenados de lunes a domingo. */
export const VisitDaysSchema = z
  .array(WeekdaySchema)
  .max(7)
  .refine((v) => new Set(v).size === v.length, 'No repitas los días.')
  .transform((v) => WEEKDAYS.filter((d) => v.includes(d)));

/** Se normaliza a 10 dígitos (proveedores.md 4). "" = sin teléfono. */
export const ArPhoneInputSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(30, 'Es demasiado largo (máximo 30 caracteres).')
  .refine((v) => v === '' || normalizeArPhone(v) !== null, AR_PHONE_MESSAGE)
  .transform((v) => (v === '' ? null : normalizeArPhone(v)));

export const EmailInputSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(120, 'Es demasiado largo (máximo 120 caracteres).')
  .pipe(
    z.union([
      z.literal('').transform(() => null),
      z.email('Escribí un email válido.').transform((v) => v as string | null),
    ]),
  );

/** CUIT con o sin guiones; se guardan los 11 dígitos. "" = sin CUIT. */
export const CuitInputSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .refine((v) => v === '' || isValidCuit(v), 'El CUIT no es válido. Revisá los números.')
  .transform((v) => (v === '' ? null : normalizeCuit(v)));

export const SupplierNotesSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(500, 'Es demasiado largo (máximo 500 caracteres).')
  .transform((v) => (v === '' ? null : v));

export const PaymentReferenceSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(100, 'Es demasiado larga (máximo 100 caracteres).')
  .transform((v) => (v === '' ? null : v));

export const EntryDescriptionSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(200, 'Es demasiado larga (máximo 200 caracteres).')
  .transform((v) => (v === '' ? null : v));

// --- Respuestas ------------------------------------------------------------------------------------

export const SupplierSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  whatsappPhone: z.string().nullable(),
  email: z.string().nullable(),
  taxId: z.string().nullable(),
  visitDays: z.array(WeekdaySchema),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  balance: z.string(),
  hasOpeningBalance: z.boolean(),
  defaultProductCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Supplier = z.infer<typeof SupplierSchema>;

export const SupplierPageSchema = z.object({
  items: z.array(SupplierSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const SupplierAccountEntrySchema = z.object({
  id: z.number().int(),
  supplierId: z.number().int(),
  type: SupplierEntryTypeSchema,
  amount: z.string(),
  entryDate: z.string(),
  balanceAfter: z.string(),
  purchase: z
    .object({
      id: z.number().int(),
      documentType: z.enum(PURCHASE_DOCUMENT_TYPES),
      documentNumber: z.string().nullable(),
      status: z.enum(PURCHASE_STATUSES),
    })
    .nullable(),
  paymentSource: SupplierPaymentSourceSchema.nullable(),
  reference: z.string().nullable(),
  description: z.string().nullable(),
  cashMovement: z.object({ id: z.number().int(), cashSessionId: z.number().int() }).nullable(),
  user: UserRefSchema,
  createdAt: z.string(),
});
export type SupplierAccountEntry = z.infer<typeof SupplierAccountEntrySchema>;

export const SupplierAccountResponseSchema = z.object({
  supplier: z.object({ id: z.number().int(), name: z.string(), isActive: z.boolean() }),
  balance: z.string(),
  items: z.array(SupplierAccountEntrySchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type SupplierAccountResponse = z.infer<typeof SupplierAccountResponseSchema>;

/** La salida de caja de un pago (igual a `CashMovementSchema` de caja.md 2, con el proveedor). */
const PaymentCashMovementSchema = z.object({
  id: z.number().int(),
  cashSessionId: z.number().int(),
  direction: z.enum(['IN', 'OUT']),
  reason: z.string(),
  description: z.string(),
  amount: z.string(),
  user: UserRefSchema,
  createdAt: z.string(),
  sale: z.object({ id: z.number().int(), cashSessionId: z.number().int() }).nullable(),
  supplierAccountEntryId: z.number().int().nullable(),
  supplier: z.object({ id: z.number().int(), name: z.string() }).nullable(),
});

export const SupplierPaymentResponseSchema = z.object({
  entry: SupplierAccountEntrySchema,
  balance: z.string(),
  cashMovement: PaymentCashMovementSchema.nullable(),
  isReplay: z.boolean(),
});
export type SupplierPaymentResponse = z.infer<typeof SupplierPaymentResponseSchema>;

export const SupplierEntryResponseSchema = z.object({
  entry: SupplierAccountEntrySchema,
  balance: z.string(),
});
export type SupplierEntryResponse = z.infer<typeof SupplierEntryResponseSchema>;

export const AssignProductsResponseSchema = z.object({
  supplierId: z.number().int(),
  products: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      previousSupplier: z.object({ id: z.number().int(), name: z.string() }).nullable(),
    }),
  ),
});
export type AssignProductsResponse = z.infer<typeof AssignProductsResponseSchema>;

export const SuggestedOrderItemSchema = z.object({
  productId: z.number().int(),
  name: z.string(),
  barcode: z.string().nullable(),
  saleUnit: z.enum(SALE_UNITS),
  stockQuantity: z.string(),
  minStock: z.string(),
  shortfall: z.string(),
  suggestedQuantity: z.string(),
  unitsPerPack: z.string().nullable(),
});
export const SuggestedOrderResponseSchema = z.object({
  supplier: z.object({
    id: z.number().int(),
    name: z.string(),
    isActive: z.boolean(),
    whatsappPhone: z.string().nullable(),
  }),
  storeName: z.string(),
  items: z.array(SuggestedOrderItemSchema),
  isTruncated: z.boolean(),
  text: z.string(),
  whatsappUrl: z.string().nullable(),
});
export type SuggestedOrderResponse = z.infer<typeof SuggestedOrderResponseSchema>;

// --- Requests (estrictos) ------------------------------------------------------------------------

export const SupplierListQuerySchema = z.strictObject({
  ...PaginationQueryShape,
  search: z.string().trim().min(1).max(80).optional(),
  isActive: QueryBooleanSchema.optional(),
  hasBalance: QueryBooleanSchema.optional(),
  visitDay: WeekdaySchema.optional(),
  sortBy: z.enum(['name', 'balance']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});
export type SupplierListQuery = z.infer<typeof SupplierListQuerySchema>;

export const CreateSupplierRequestSchema = z.strictObject({
  name: SupplierNameSchema,
  phone: ArPhoneInputSchema.nullable().optional(),
  email: EmailInputSchema.nullable().optional(),
  taxId: CuitInputSchema.nullable().optional(),
  visitDays: VisitDaysSchema.optional(),
  notes: SupplierNotesSchema.nullable().optional(),
  /** H-58 b: confirma un CUIT que ya tiene otro proveedor. */
  confirmDuplicateTaxId: z.boolean().optional(),
});
export type CreateSupplierRequest = z.infer<typeof CreateSupplierRequestSchema>;

export const UpdateSupplierRequestSchema = z
  .strictObject({
    name: SupplierNameSchema.optional(),
    phone: ArPhoneInputSchema.nullable().optional(),
    email: EmailInputSchema.nullable().optional(),
    taxId: CuitInputSchema.nullable().optional(),
    visitDays: VisitDaysSchema.optional(),
    notes: SupplierNotesSchema.nullable().optional(),
    isActive: z.boolean().optional(),
    confirmDuplicateTaxId: z.boolean().optional(),
  })
  .refine(
    (v) => Object.entries(v).some(([k, x]) => k !== 'confirmDuplicateTaxId' && x !== undefined),
    { message: 'Mandá al menos un campo para cambiar.' },
  );
export type UpdateSupplierRequest = z.infer<typeof UpdateSupplierRequestSchema>;

export const AssignProductsRequestSchema = z.strictObject({
  productIds: z
    .array(IdSchema)
    .min(1, 'Elegí al menos un producto.')
    .max(200)
    .refine((v) => new Set(v).size === v.length, 'No repitas productos.'),
});
export type AssignProductsRequest = z.infer<typeof AssignProductsRequestSchema>;

export const SupplierAccountQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    from: DateOnlySchema.optional(),
    to: DateOnlySchema.optional(),
    type: SupplierEntryTypeSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type SupplierAccountQuery = z.infer<typeof SupplierAccountQuerySchema>;

export const CreateSupplierPaymentRequestSchema = z.strictObject({
  clientRequestId: ClientRequestIdSchema,
  amount: PositiveMoneyInputSchema,
  source: SupplierPaymentSourceSchema,
  entryDate: DateOnlySchema.nullable().optional(),
  reference: PaymentReferenceSchema.nullable().optional(),
  description: EntryDescriptionSchema.nullable().optional(),
  /** H-56 c: confirma un pago mayor que la deuda. */
  confirmOverpayment: z.boolean().optional(),
});
export type CreateSupplierPaymentRequest = z.infer<typeof CreateSupplierPaymentRequestSchema>;

export const CreateOpeningBalanceRequestSchema = z.strictObject({
  amount: SignedMoneyInputSchema,
  entryDate: DateOnlySchema,
  description: EntryDescriptionSchema.nullable().optional(),
});
export type CreateOpeningBalanceRequest = z.infer<typeof CreateOpeningBalanceRequestSchema>;

export const CreateAccountAdjustmentRequestSchema = z.strictObject({
  amount: SignedMoneyInputSchema,
  reason: z
    .string('Escribí el motivo del ajuste.')
    .trim()
    .min(1, 'Escribí el motivo del ajuste.')
    .max(200, 'Es demasiado largo (máximo 200 caracteres).'),
  entryDate: DateOnlySchema.nullable().optional(),
});
export type CreateAccountAdjustmentRequest = z.infer<typeof CreateAccountAdjustmentRequestSchema>;
