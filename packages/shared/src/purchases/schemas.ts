// Compras y adjuntos (docs/api/compras.md, sección 3).
// Requests estrictos (campo desconocido -> 400); respuestas no estrictas. Dinero, cantidades y
// porcentajes viajan como string (ADR 002).
import { z } from 'zod';
import {
  ATTACHMENT_MIME_TYPES,
  PURCHASE_DOCUMENT_TYPES,
  PURCHASE_QUANTITY_MODES,
  PURCHASE_STATUSES,
  SALE_UNITS,
} from '../enums';
import {
  DateOnlySchema,
  MoneyInputSchema,
  PaginationQueryShape,
  QueryIdSchema,
  VatRateInputSchema,
} from '../common/schemas';
import {
  ClientRequestIdSchema,
  PositiveMoneyInputSchema,
  PositiveQuantityInputSchema,
  StockWarningSchema,
  VoidReasonSchema,
} from '../sales/schemas';
import { PaymentReferenceSchema, SupplierPaymentSourceSchema } from '../suppliers/schemas';

export const PurchaseDocumentTypeSchema = z.enum(PURCHASE_DOCUMENT_TYPES);
export const PurchaseStatusSchema = z.enum(PURCHASE_STATUSES);
export const PurchaseQuantityModeSchema = z.enum(PURCHASE_QUANTITY_MODES);
export const AttachmentMimeTypeSchema = z.enum(ATTACHMENT_MIME_TYPES);

const IdSchema = z.number().int().positive().max(2_147_483_647);
const UserRefSchema = z.object({ id: z.number().int(), fullName: z.string() });

/** Máximo de líneas por compra y de adjuntos por compra (tope técnico). */
export const MAX_PURCHASE_ITEMS = 200;
export const MAX_ATTACHMENTS_PER_PURCHASE = 10;

// --- Campos --------------------------------------------------------------------------------------

/** Número del comprobante, 1 a 30. "" o null = sin número (COM-01). */
export const DocumentNumberSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(30, 'Es demasiado largo (máximo 30 caracteres).')
  .transform((v) => (v === '' ? null : v));

/** Bultos: entero >= 1 (hasta 999.999). Un bulto se cuenta entero. */
export const PackCountInputSchema = z
  .string('Tiene que ser un texto con la cantidad de bultos.')
  .regex(/^[1-9]\d{0,5}$/, 'Los bultos son un número entero mayor que 0.');

export const PurchaseNotesSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .max(500, 'Es demasiado largo (máximo 500 caracteres).')
  .transform((v) => (v === '' ? null : v));

// --- Requests --------------------------------------------------------------------------------------

export const PurchaseLineInputSchema = z.discriminatedUnion('quantityMode', [
  z.strictObject({
    productId: IdSchema,
    quantityMode: z.literal('UNIT'),
    quantity: PositiveQuantityInputSchema,
    unitNetCost: MoneyInputSchema,
    vatRatePercent: VatRateInputSchema,
  }),
  z.strictObject({
    productId: IdSchema,
    quantityMode: z.literal('PACK'),
    packCount: PackCountInputSchema,
    unitsPerPack: PositiveQuantityInputSchema,
    packNetCost: MoneyInputSchema,
    vatRatePercent: VatRateInputSchema,
  }),
]);
export type PurchaseLineInput = z.infer<typeof PurchaseLineInputSchema>;

export const PayNowInputSchema = z.strictObject({
  source: SupplierPaymentSourceSchema,
  amount: PositiveMoneyInputSchema,
  reference: PaymentReferenceSchema.nullable().optional(),
});
export type PayNowInput = z.infer<typeof PayNowInputSchema>;

export const CreatePurchaseRequestSchema = z.strictObject({
  clientRequestId: ClientRequestIdSchema,
  supplierId: IdSchema,
  documentType: PurchaseDocumentTypeSchema,
  documentNumber: DocumentNumberSchema.nullable().optional(),
  documentDate: DateOnlySchema,
  items: z
    .array(PurchaseLineInputSchema)
    .min(1, 'Agregá al menos un producto.')
    .max(MAX_PURCHASE_ITEMS),
  otherChargesAmount: MoneyInputSchema.optional(),
  notes: PurchaseNotesSchema.nullable().optional(),
  payNow: PayNowInputSchema.nullable().optional(),
  confirmDuplicateDocument: z.boolean().optional(),
  confirmOverpayment: z.boolean().optional(),
});
export type CreatePurchaseRequest = z.infer<typeof CreatePurchaseRequestSchema>;

export const PurchaseListQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    from: DateOnlySchema.optional(),
    to: DateOnlySchema.optional(),
    supplierId: QueryIdSchema.optional(),
    status: PurchaseStatusSchema.optional(),
    documentNumber: z.string().trim().min(1).max(30).optional(),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type PurchaseListQuery = z.infer<typeof PurchaseListQuerySchema>;

export const VoidPurchaseRequestSchema = z.strictObject({ reason: VoidReasonSchema });
export type VoidPurchaseRequest = z.infer<typeof VoidPurchaseRequestSchema>;

/** `:id` y `:attachmentId` de las rutas de adjuntos. */
export const AttachmentParamsSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Tiene que ser un número entero positivo.')
    .transform(Number)
    .refine((n) => n <= 2_147_483_647, 'Tiene que ser un número entero positivo.'),
  attachmentId: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Tiene que ser un número entero positivo.')
    .transform(Number)
    .refine((n) => n <= 2_147_483_647, 'Tiene que ser un número entero positivo.'),
});

export const AttachmentDownloadQuerySchema = z.strictObject({
  download: z.enum(['true']).optional(),
});

// --- Respuestas ------------------------------------------------------------------------------------

export const PurchaseItemSchema = z.object({
  id: z.number().int(),
  productId: z.number().int(),
  productName: z.string(),
  saleUnit: z.enum(SALE_UNITS),
  quantityMode: PurchaseQuantityModeSchema,
  packCount: z.string().nullable(),
  unitsPerPack: z.string().nullable(),
  packNetCost: z.string().nullable(),
  quantity: z.string(),
  unitNetCost: z.string(),
  vatRatePercent: z.string(),
  unitCost: z.string(),
  lineNetTotal: z.string(),
  lineTotal: z.string(),
  previousNetCostPrice: z.string(),
  previousCostPrice: z.string(),
});
export type PurchaseItem = z.infer<typeof PurchaseItemSchema>;

export const VatBreakdownSchema = z.object({
  vatRatePercent: z.string(),
  netAmount: z.string(),
  vatAmount: z.string(),
});

export const PurchaseAttachmentSchema = z.object({
  id: z.number().int(),
  purchaseId: z.number().int(),
  originalFileName: z.string(),
  mimeType: AttachmentMimeTypeSchema,
  sizeBytes: z.number().int(),
  uploadedBy: UserRefSchema,
  createdAt: z.string(),
  url: z.string(),
});
export type PurchaseAttachment = z.infer<typeof PurchaseAttachmentSchema>;

export const PurchasePayNowSchema = z.object({
  entryId: z.number().int(),
  amount: z.string(),
  source: SupplierPaymentSourceSchema,
  reference: z.string().nullable(),
  entryDate: z.string(),
  cashMovement: z.object({ id: z.number().int(), cashSessionId: z.number().int() }).nullable(),
});
export type PurchasePayNow = z.infer<typeof PurchasePayNowSchema>;

export const PurchaseSchema = z.object({
  id: z.number().int(),
  status: PurchaseStatusSchema,
  supplier: z.object({ id: z.number().int(), name: z.string() }),
  documentType: PurchaseDocumentTypeSchema,
  documentNumber: z.string().nullable(),
  documentDate: z.string(),
  netTotal: z.string(),
  vatTotal: z.string(),
  vatBreakdown: z.array(VatBreakdownSchema),
  otherChargesAmount: z.string(),
  total: z.string(),
  notes: z.string().nullable(),
  user: UserRefSchema,
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
  voidedBy: UserRefSchema.nullable(),
  voidReason: z.string().nullable(),
  items: z.array(PurchaseItemSchema),
  attachments: z.array(PurchaseAttachmentSchema),
  payNowPayments: z.array(PurchasePayNowSchema),
});
export type Purchase = z.infer<typeof PurchaseSchema>;

export const CostChangeSchema = z.object({
  productId: z.number().int(),
  productName: z.string(),
  previousNetCostPrice: z.string(),
  newNetCostPrice: z.string(),
  previousCostPrice: z.string(),
  newCostPrice: z.string(),
  netCostChangePercent: z.string().nullable(),
  salePrice: z.string(),
});
export type CostChange = z.infer<typeof CostChangeSchema>;

export const CreatePurchaseResponseSchema = z.object({
  purchase: PurchaseSchema,
  isReplay: z.boolean(),
  costChanges: z.array(CostChangeSchema),
  supplierBalance: z.string(),
});
export type CreatePurchaseResponse = z.infer<typeof CreatePurchaseResponseSchema>;

export const PurchaseListItemSchema = z.object({
  id: z.number().int(),
  status: PurchaseStatusSchema,
  supplier: z.object({ id: z.number().int(), name: z.string() }),
  documentType: PurchaseDocumentTypeSchema,
  documentNumber: z.string().nullable(),
  documentDate: z.string(),
  netTotal: z.string(),
  vatTotal: z.string(),
  otherChargesAmount: z.string(),
  total: z.string(),
  paidNowAmount: z.string(),
  itemCount: z.number().int(),
  attachmentCount: z.number().int(),
  user: UserRefSchema,
  createdAt: z.string(),
  voidedAt: z.string().nullable(),
});
export type PurchaseListItem = z.infer<typeof PurchaseListItemSchema>;

export const PurchasePageSchema = z.object({
  items: z.array(PurchaseListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const VoidPurchaseResponseSchema = z.object({
  purchase: PurchaseSchema,
  stockWarnings: z.array(StockWarningSchema),
  supplierBalance: z.string(),
});
export type VoidPurchaseResponse = z.infer<typeof VoidPurchaseResponseSchema>;
