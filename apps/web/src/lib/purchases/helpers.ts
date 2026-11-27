// Ayudas chicas de las pantallas de proveedores y compras.
import { DEFAULT_TIME_ZONE, Decimal, getBusinessDate } from '@kiosco/shared';
import { ApiError } from '../api';

/** Fecha de hoy en el kiosco (YYYY-MM-DD, calendario de Buenos Aires, sin hora de corte). */
export function todayDate(): string {
  return getBusinessDate(new Date(), 0, DEFAULT_TIME_ZONE);
}

/** Pasa un importe positivo al signo elegido ("+" suma deuda, "-" la baja). */
export function withSign(amount: Decimal, sign: 'plus' | 'minus'): string {
  return (sign === 'minus' ? amount.negated() : amount).toFixed();
}

/** Errores de campo que manda el servidor, con el camino como texto ("items.0.quantity"). */
export function serverFieldPaths(error: unknown): { path: string; message: string }[] {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR') return [];
  const fields = error.details?.fields;
  if (!Array.isArray(fields)) return [];
  return (fields as { path?: unknown; message?: unknown }[]).map((f) => ({
    path: Array.isArray(f.path) ? f.path.join('.') : String(f.path ?? ''),
    message: typeof f.message === 'string' ? f.message : 'Revisá este dato.',
  }));
}
