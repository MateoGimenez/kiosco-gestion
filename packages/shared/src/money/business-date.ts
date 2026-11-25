// Día de trabajo (ADR 002, punto 7). Una sola función para la venta, la apertura de caja y la pantalla.

/** Zona horaria del kiosco (la de la variable TZ del .env). Argentina no usa horario de verano. */
export const DEFAULT_TIME_ZONE = 'America/Argentina/Buenos_Aires';

/**
 * `businessDate = fecha( hora local − hora de corte )`, como `YYYY-MM-DD`.
 * Con corte 06:00 (360 min): martes 02:30 -> lunes; martes 06:00 -> martes; martes 23:59 -> martes.
 * Usa `Intl.DateTimeFormat` con la zona dada: no depende de la zona del sistema operativo.
 */
export function getBusinessDate(
  instant: Date,
  cutoffMinutes: number,
  timeZone: string = DEFAULT_TIME_ZONE,
): string {
  if (Number.isNaN(instant.getTime())) throw new RangeError('La fecha no es válida.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  // Se arma el reloj de pared como si fuera UTC, se resta el corte y se toma la fecha.
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(wall - cutoffMinutes * 60_000).toISOString().slice(0, 10);
}
