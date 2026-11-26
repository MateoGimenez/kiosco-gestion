// Caja: abrir, cerrar, movimientos, notas, detalle y lista (docs/api/caja.md, sección 2).
import { z } from 'zod';
import {
  CASH_DIRECTIONS,
  CASH_MOVEMENT_REASONS,
  CASH_SESSION_STATUSES,
  PAYMENT_METHOD_KINDS,
  SHIFTS,
} from '../enums';
import { toDecimal } from '../decimal';
import {
  DateOnlySchema,
  MoneyInputSchema,
  PaginationQueryShape,
  QueryBooleanSchema,
  QueryIdSchema,
} from '../common/schemas';
import { MANUAL_CASH_REASON_DIRECTIONS } from './expected';

export const ShiftSchema = z.enum(SHIFTS);
export const CashSessionStatusSchema = z.enum(CASH_SESSION_STATUSES);

const UserRefSchema = z.object({ id: z.number().int(), fullName: z.string() });

// --- Respuestas (no estrictas) ------------------------------------------------------------------

/** Lo que ve el EMPLEADO: sin efectivo inicial (H-40 a). */
export const CashSessionPublicSchema = z.object({
  id: z.number().int(),
  shift: ShiftSchema,
  businessDate: z.string(),
  status: CashSessionStatusSchema,
  openedAt: z.string(),
  openedBy: UserRefSchema,
});
export type CashSessionPublic = z.infer<typeof CashSessionPublicSchema>;

/** Lo que ven ENCARGADO y DUEÑO. */
export const CashSessionSchema = CashSessionPublicSchema.extend({
  openingCash: z.string(),
  closedAt: z.string().nullable(),
  closedBy: UserRefSchema.nullable(),
});
export type CashSession = z.infer<typeof CashSessionSchema>;

/**
 * Lo contado en el cierre anterior (H-51 c). Solo informativo y solo para encargado y dueño:
 * el empleado siempre recibe `null`. Decisión técnica: el contrato no le puso nombre al campo.
 */
export const PreviousClosingSchema = z.object({
  cashSessionId: z.number().int(),
  shift: ShiftSchema,
  businessDate: z.string(),
  closedAt: z.string(),
  countedCash: z.string(),
});
export type PreviousClosing = z.infer<typeof PreviousClosingSchema>;

export const CurrentCashSessionResponseSchema = z.object({
  cashSession: z.union([CashSessionSchema, CashSessionPublicSchema]).nullable(),
  currentBusinessDate: z.string(),
  /** NF-18: la abierta es de un día de trabajo anterior. */
  isFromPreviousBusinessDay: z.boolean(),
  /** H-04 b: el usuario de la sesión puede cerrar la abierta. */
  canClose: z.boolean(),
  previousClosing: PreviousClosingSchema.nullable(),
});
export type CurrentCashSessionResponse = z.infer<typeof CurrentCashSessionResponseSchema>;

/** Respuesta del cierre para el EMPLEADO: "cerrada", quién, cuándo y lo que él contó (H-46). */
export const CashSessionClosedPublicSchema = CashSessionPublicSchema.extend({
  closedAt: z.string(),
  closedBy: UserRefSchema,
  countedCash: z.string(),
});
export type CashSessionClosedPublic = z.infer<typeof CashSessionClosedPublicSchema>;

/** Dinero con signo en una respuesta: "-100.00". */
const SignedMoneySchema = z.string();

export const CashSessionListItemSchema = CashSessionSchema.extend({
  countedCash: z.string().nullable(),
  expectedCash: SignedMoneySchema.nullable(),
  difference: SignedMoneySchema.nullable(),
  noteCount: z.number().int(),
});
export type CashSessionListItem = z.infer<typeof CashSessionListItemSchema>;

export const CashSessionPageSchema = z.object({
  items: z.array(CashSessionListItemSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

export const CashSummarySchema = z.object({
  openingCash: z.string(),
  cashSales: z.string(),
  cashIn: z.string(),
  cashOut: z.string(),
  voidRefunds: z.string(),
  expectedCash: SignedMoneySchema,
});
export type CashSummary = z.infer<typeof CashSummarySchema>;

export const PaymentMethodSummarySchema = z.object({
  paymentMethod: z.object({
    id: z.number().int(),
    kind: z.enum(PAYMENT_METHOD_KINDS),
    name: z.string(),
  }),
  paymentCount: z.number().int(),
  amount: z.string(),
  surchargeAmount: z.string(),
  chargedAmount: z.string(),
  voidedChargedAmount: z.string(),
});
export type PaymentMethodSummary = z.infer<typeof PaymentMethodSummarySchema>;

export const CashSessionSalesSummarySchema = z.object({
  count: z.number().int(),
  voidedCount: z.number().int(),
  total: z.string(),
  voidedTotal: z.string(),
  surchargeAmount: z.string(),
});
export type CashSessionSalesSummary = z.infer<typeof CashSessionSalesSummarySchema>;

export const CashMovementSchema = z.object({
  id: z.number().int(),
  cashSessionId: z.number().int(),
  direction: z.enum(CASH_DIRECTIONS),
  reason: z.enum(CASH_MOVEMENT_REASONS),
  description: z.string(),
  amount: z.string(),
  user: UserRefSchema,
  createdAt: z.string(),
  sale: z.object({ id: z.number().int(), cashSessionId: z.number().int() }).nullable(),
  supplierAccountEntryId: z.number().int().nullable(),
});
export type CashMovement = z.infer<typeof CashMovementSchema>;

export const CashSessionNoteSchema = z.object({
  id: z.number().int(),
  cashSessionId: z.number().int(),
  note: z.string(),
  user: UserRefSchema,
  createdAt: z.string(),
});
export type CashSessionNote = z.infer<typeof CashSessionNoteSchema>;

/** Detalle y arqueo: solo encargado y dueño. */
export const CashSessionDetailSchema = CashSessionListItemSchema.omit({ noteCount: true }).extend({
  closingNote: z.string().nullable(),
  summary: CashSummarySchema,
  paymentSummary: z.array(PaymentMethodSummarySchema),
  sales: CashSessionSalesSummarySchema,
  movements: z.array(CashMovementSchema),
  notes: z.array(CashSessionNoteSchema),
  /** H-51 c: lo contado en el cierre de la caja anterior (informativo). */
  previousClosing: PreviousClosingSchema.nullable(),
});
export type CashSessionDetail = z.infer<typeof CashSessionDetailSchema>;

// --- Requests (estrictos) -----------------------------------------------------------------------

export const OpenCashSessionRequestSchema = z.strictObject({
  shift: ShiftSchema,
  openingCash: MoneyInputSchema,
});
export type OpenCashSessionRequest = z.infer<typeof OpenCashSessionRequestSchema>;

export const CashSessionListQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    from: DateOnlySchema.optional(),
    to: DateOnlySchema.optional(),
    status: CashSessionStatusSchema.optional(),
    shift: ShiftSchema.optional(),
    openedById: QueryIdSchema.optional(),
    closedById: QueryIdSchema.optional(),
    /** "true": cerradas con diferencia distinta de 0; "false": cerradas con 0. Implica CLOSED. */
    hasDifference: QueryBooleanSchema.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type CashSessionListQuery = z.infer<typeof CashSessionListQuerySchema>;

// --- Cierre, movimientos y notas (requests estrictos) --------------------------------------------

export const CloseCashSessionRequestSchema = z.strictObject({
  /** SOLO el efectivo contado (PA-28): del esperado se ocupa el servidor. */
  countedCash: MoneyInputSchema,
  closingNote: z
    .string()
    .trim()
    .max(500, 'Es demasiado largo (máximo 500 caracteres).')
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type CloseCashSessionRequest = z.infer<typeof CloseCashSessionRequestSchema>;

/** Motivos que se pueden cargar a mano: sin la devolución por anulación ni el pago a proveedor (etapa 5). */
export const ManualCashMovementReasonSchema = z.enum(
  Object.keys(MANUAL_CASH_REASON_DIRECTIONS) as [
    keyof typeof MANUAL_CASH_REASON_DIRECTIONS,
    ...(keyof typeof MANUAL_CASH_REASON_DIRECTIONS)[],
  ],
  { error: 'Elegí un motivo válido.' },
);

const REASON_DIRECTION_MESSAGES = {
  OWNER_WITHDRAWAL: 'Un retiro del dueño siempre es una salida.',
  EXPENSE: 'Un gasto siempre es una salida.',
  CASH_CONTRIBUTION: 'Un aporte de cambio siempre es un ingreso.',
  OTHER: '',
} as const;

const PositiveMoneySchema = MoneyInputSchema.refine((v) => toDecimal(v).gt(0), {
  error: 'Tiene que ser mayor que 0.',
});

export const CreateCashMovementRequestSchema = z
  .strictObject({
    direction: z.enum(CASH_DIRECTIONS, { error: 'Elegí si es un ingreso o una salida.' }),
    reason: ManualCashMovementReasonSchema,
    description: z
      .string('Tiene que ser un texto.')
      .trim()
      .min(1, 'Escribí una descripción.')
      .max(200, 'Es demasiado larga (máximo 200 caracteres).'),
    amount: PositiveMoneySchema,
  })
  .superRefine((v, ctx) => {
    const allowed: readonly string[] = MANUAL_CASH_REASON_DIRECTIONS[v.reason];
    if (!allowed.includes(v.direction)) {
      ctx.addIssue({
        code: 'custom',
        path: ['direction'],
        message: REASON_DIRECTION_MESSAGES[v.reason],
      });
    }
  });
export type CreateCashMovementRequest = z.infer<typeof CreateCashMovementRequestSchema>;

export const CreateCashSessionNoteRequestSchema = z.strictObject({
  note: z
    .string('Tiene que ser un texto.')
    .trim()
    .min(1, 'Escribí la nota.')
    .max(500, 'Es demasiado larga (máximo 500 caracteres).'),
});
export type CreateCashSessionNoteRequest = z.infer<typeof CreateCashSessionNoteRequestSchema>;
