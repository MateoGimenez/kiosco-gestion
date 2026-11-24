// Pasa errores de validación (Zod o del servidor) a mensajes por campo.
import { ApiError } from './api';
import { friendlyMessage } from './apiMessages';

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

interface IssueLike {
  path: readonly PropertyKey[];
  code: string;
  message: string;
}

/** Errores de Zod de los esquemas de shared, ya con texto en español. */
export function issuesToFieldErrors<K extends string>(
  issues: readonly IssueLike[],
  fields: readonly K[],
  overrides: Partial<Record<K, string>> = {},
): { fields: FieldErrors<K>; other?: string } {
  const result: FieldErrors<K> = {};
  let other: string | undefined;
  for (const issue of issues) {
    const key = fields.find((f) => f === String(issue.path[0]));
    if (!key) {
      other ??= issue.message;
    } else if (!result[key]) {
      result[key] =
        issue.code === 'too_big' ? 'Es demasiado largo.' : (overrides[key] ?? issue.message);
    }
  }
  return other === undefined ? { fields: result } : { fields: result, other };
}

/** Errores que devuelve el servidor, repartidos por campo. Lo que no es de un campo va a `form`. */
export function serverErrorToFields<K extends string>(
  error: unknown,
  fields: readonly K[],
): { fields: FieldErrors<K>; form?: string } {
  if (!(error instanceof ApiError)) {
    return { fields: {}, form: 'Ocurrió un error inesperado. Probá de nuevo en un momento.' };
  }
  const result: FieldErrors<K> = {};
  if (error.code === 'USERNAME_TAKEN') {
    result['username' as K] =
      'Ese nombre de usuario ya existe (puede ser de alguien desactivado). Elegí otro.';
    return { fields: result };
  }
  if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details?.fields)) {
    let form: string | undefined;
    for (const item of error.details.fields as { path?: unknown; message?: unknown }[]) {
      const key = fields.find((f) => f === String(item.path));
      const message = typeof item.message === 'string' ? item.message : 'Revisá este dato.';
      if (key) result[key] ??= message;
      else form ??= message;
    }
    return form === undefined ? { fields: result } : { fields: result, form };
  }
  return { fields: result, form: friendlyMessage(error) };
}
