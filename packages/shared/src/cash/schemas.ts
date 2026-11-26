// Caja: abrir, ver la abierta y listar (docs/api/caja.md, sección 2).
import { z } from 'zod';
import { CASH_SESSION_STATUSES, SHIFTS } from '../enums';
import { DateOnlySchema, MoneyInputSchema, PaginationQueryShape } from '../common/schemas';

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

export const CurrentCashSessionResponseSchema = z.object({
  cashSession: z.union([CashSessionSchema, CashSessionPublicSchema]).nullable(),
  currentBusinessDate: z.string(),
});
export type CurrentCashSessionResponse = z.infer<typeof CurrentCashSessionResponseSchema>;

export const CashSessionPageSchema = z.object({
  items: z.array(CashSessionSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

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
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    path: ['to'],
    message: 'La fecha final no puede ser anterior a la inicial.',
  });
export type CashSessionListQuery = z.infer<typeof CashSessionListQuerySchema>;
