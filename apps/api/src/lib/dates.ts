// Fechas sin hora (día de trabajo) y su relación con las columnas `date` de la base.
import { getBusinessDate } from '@kiosco/shared';

/** `YYYY-MM-DD` -> Date a medianoche UTC (así Prisma guarda el mismo día en una columna `date`). */
export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Columna `date` de Prisma -> `YYYY-MM-DD`. */
export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Fecha calendario de hoy en Buenos Aires (`YYYY-MM-DD`), SIN hora de corte: es la que se usa para
 * "no futura" en facturas, pagos y saldos (H-61), a diferencia del día de trabajo de la caja.
 */
export function todayInBuenosAires(now = new Date()): string {
  return getBusinessDate(now, 0);
}
