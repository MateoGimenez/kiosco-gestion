// Textos de la interfaz para valores del contrato de proveedores y compras.
import type { DocumentType, EntryType, PaymentSource, Weekday } from './types';

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Factura',
  DELIVERY_NOTE: 'Remito',
  OTHER: 'Otro comprobante',
};

export const PAYMENT_SOURCE_LABELS: Record<PaymentSource, string> = {
  CASH_REGISTER: 'Efectivo de la caja',
  CASH_OUTSIDE_REGISTER: 'Efectivo de afuera de la caja',
  BANK_TRANSFER: 'Transferencia',
  OTHER: 'Otro (cheque, Mercado Pago…)',
};

export const ENTRY_TYPE_LABELS: Record<EntryType, string> = {
  OPENING_BALANCE: 'Saldo inicial',
  PURCHASE: 'Compra',
  PURCHASE_VOID: 'Compra anulada',
  PAYMENT: 'Pago',
  ADJUSTMENT: 'Corrección',
};

export const WEEKDAYS: { value: Weekday; label: string; short: string }[] = [
  { value: 'MON', label: 'Lunes', short: 'Lun' },
  { value: 'TUE', label: 'Martes', short: 'Mar' },
  { value: 'WED', label: 'Miércoles', short: 'Mié' },
  { value: 'THU', label: 'Jueves', short: 'Jue' },
  { value: 'FRI', label: 'Viernes', short: 'Vie' },
  { value: 'SAT', label: 'Sábado', short: 'Sáb' },
  { value: 'SUN', label: 'Domingo', short: 'Dom' },
];

/** Opciones de "de dónde sale la plata". Desde afuera, el efectivo de la caja queda deshabilitado. */
export function paymentSourceOptions(remote: boolean) {
  return (Object.keys(PAYMENT_SOURCE_LABELS) as PaymentSource[]).map((value) => ({
    value,
    label:
      value === 'CASH_REGISTER' && remote
        ? `${PAYMENT_SOURCE_LABELS[value]} (solo desde el local)`
        : PAYMENT_SOURCE_LABELS[value],
    disabled: value === 'CASH_REGISTER' && remote,
  }));
}

/** "11 2345-6789" a partir de los 10 dígitos guardados. */
export function formatPhone(phone: string | null): string {
  if (!phone) return '';
  if (!/^\d{10}$/.test(phone)) return phone;
  return `${phone.slice(0, 2)} ${phone.slice(2, 6)}-${phone.slice(6)}`;
}

/** "30-71234567-1" a partir de los 11 dígitos guardados. */
export function formatTaxId(taxId: string | null): string {
  if (!taxId || !/^\d{11}$/.test(taxId)) return taxId ?? '';
  return `${taxId.slice(0, 2)}-${taxId.slice(2, 10)}-${taxId.slice(10)}`;
}

/** "27/11/2026" a partir de "2026-11-27" (sin pasar por zonas horarias). */
export function formatDateOnly(date: string): string {
  const [y, m, d] = date.split('-');
  return y && m && d ? `${d}/${m}/${y}` : date;
}

/** Texto para el saldo con signo: "Le debemos" o "A favor del kiosco". */
export function balanceCaption(balance: string): string {
  const n = Number(balance);
  if (n > 0) return 'Le debemos';
  if (n < 0) return 'A favor del kiosco';
  return 'Sin deuda';
}
