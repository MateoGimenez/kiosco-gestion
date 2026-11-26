// Configuración general (docs/api/productos-stock.md, sección 4).
import { z } from 'zod';
import { toDecimal } from '../decimal';
import { MoneyInputSchema } from '../common/schemas';

/** Hora de corte "HH:MM" de 24 h (CFG-07). En la base se guarda en minutos. */
export const BusinessDayCutoffSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM de 24 horas (por ejemplo, 06:00).');

export const SettingsSchema = z.object({
  storeName: z.string(),
  priceRoundingStep: z.string(),
  businessDayCutoff: z.string(),
  /** Tamaño máximo de cada adjunto de compra, en MB (`UPLOAD_MAX_MB` del servidor). Solo lectura. */
  uploadMaxMb: z.number().int().optional(),
  updatedAt: z.string(),
  updatedBy: z.object({ id: z.number().int(), fullName: z.string() }).nullable(),
});
export type Settings = z.infer<typeof SettingsSchema>;

export const UpdateSettingsRequestSchema = z
  .strictObject({
    storeName: z.string().trim().min(1, 'Ingresá el nombre del negocio.').max(80).optional(),
    priceRoundingStep: MoneyInputSchema.refine(
      (v) => toDecimal(v).lte(10000),
      'Tiene que ser como máximo 10000.',
    ).optional(),
    businessDayCutoff: BusinessDayCutoffSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Mandá al menos un campo para cambiar.',
  });
export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;
