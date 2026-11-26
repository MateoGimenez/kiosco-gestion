// Fechas sin hora (día de trabajo) y su relación con las columnas `date` de la base.

/** `YYYY-MM-DD` -> Date a medianoche UTC (así Prisma guarda el mismo día en una columna `date`). */
export function dateOnlyToDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Columna `date` de Prisma -> `YYYY-MM-DD`. */
export function dateToDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}
