// Formato de fechas en es-AR (shared todavía no tiene formato de fechas).
const dateTimeFormat = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/Argentina/Buenos_Aires',
});

/** "18/11/2026, 10:30" a partir de una fecha ISO en UTC. */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
