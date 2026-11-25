// Campos que solo puede mandar el dueño (docs/api/productos-stock.md, 2.4).
import type { Request } from 'express';
import { ERROR_CODES } from '@kiosco/shared';
import { AppError } from '../errors';

/**
 * Si el usuario no es dueño y mandó alguno de estos campos (aunque el valor sea igual al actual),
 * responde 403 FORBIDDEN con `details.fields`. Va DESPUÉS de la validación de formato (400).
 */
export function assertOwnerFields(
  req: Request,
  body: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (req.user?.role === 'OWNER') return;
  const sent = fields.filter((f) => body[f] !== undefined);
  if (sent.length === 0) return;
  throw new AppError(403, ERROR_CODES.FORBIDDEN, 'Solo el dueño puede cambiar los márgenes.', {
    fields: sent,
  });
}

/** Error 400 con campos (para validaciones que necesitan mirar la base, como "enteros en productos por unidad"). */
export function fieldsError(
  status: 400 | 422,
  code: string,
  message: string,
  fields: { path: string; message: string }[],
): AppError {
  return new AppError(status, code, message, { fields });
}
