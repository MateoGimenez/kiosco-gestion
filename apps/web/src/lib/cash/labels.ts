import { Decimal, formatMoney, formatMoneyWithCents } from '@kiosco/shared';
import type { CashDirection, CashReason, ManualCashReason } from './types';

export const REASON_LABELS: Record<CashReason, string> = {
  OWNER_WITHDRAWAL: 'Retiro del dueño',
  EXPENSE: 'Gasto',
  CASH_CONTRIBUTION: 'Aporte de cambio',
  OTHER: 'Otro',
  SALE_VOID_REFUND: 'Devolución por anulación',
  SUPPLIER_PAYMENT: 'Pago a proveedor',
};

/**
 * Sentidos permitidos por motivo (caja.md 11.1).
 * TODO: usar `MANUAL_CASH_REASON_DIRECTIONS` de `@kiosco/shared` cuando exista.
 */
export const MANUAL_CASH_REASON_DIRECTIONS: Record<ManualCashReason, readonly CashDirection[]> = {
  OWNER_WITHDRAWAL: ['OUT'],
  EXPENSE: ['OUT'],
  CASH_CONTRIBUTION: ['IN'],
  OTHER: ['IN', 'OUT'],
};

const MANUAL_REASONS = Object.keys(MANUAL_CASH_REASON_DIRECTIONS) as ManualCashReason[];

/** Motivos que se ofrecen para un sentido: el usuario nunca elige el signo por su cuenta. */
export function reasonsFor(direction: CashDirection): ManualCashReason[] {
  return MANUAL_REASONS.filter((r) => MANUAL_CASH_REASON_DIRECTIONS[r].includes(direction));
}

export const DIRECTION_LABELS: Record<CashDirection, string> = { IN: 'Ingreso', OUT: 'Salida' };

/** Dinero de la caja: sin centavos si es redondo ("$ 7.400"), con centavos si no ("$ 7.400,50"). */
export function formatCash(value: string | Decimal): string {
  const d = new Decimal(value);
  return d.isInteger() ? formatMoney(d) : formatMoneyWithCents(d);
}

/** Tono de la diferencia: 0 = bien, sobra = aviso, falta = problema. */
export function differenceTone(value: string): 'ok' | 'warn' | 'bad' {
  const d = new Decimal(value);
  return d.isZero() ? 'ok' : d.isPositive() ? 'warn' : 'bad';
}
