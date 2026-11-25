import type { PaymentMethodKind, Shift } from './types';

export const SHIFT_LABELS: Record<Shift, string> = {
  MORNING: 'Mañana',
  AFTERNOON: 'Tarde',
  NIGHT: 'Noche',
};
export const SHIFTS: readonly Shift[] = ['MORNING', 'AFTERNOON', 'NIGHT'];

export const KIND_LABELS: Record<PaymentMethodKind, string> = {
  CASH: 'Efectivo',
  DEBIT_CARD: 'Débito',
  CREDIT_CARD: 'Crédito',
  QR: 'QR Mercado Pago',
  TRANSFER: 'Transferencia',
};

/** "26/11/2026" a partir de "2026-11-26" (el día de trabajo no lleva hora ni zona). */
export function formatBusinessDate(value: string): string {
  const [y, m, d] = value.split('-');
  return y && m && d ? `${d}/${m}/${y}` : value;
}

/** Solo la hora, "10:02", de una fecha ISO. */
export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(iso));
}
