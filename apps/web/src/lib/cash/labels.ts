import {
  Decimal,
  MANUAL_CASH_REASON_DIRECTIONS,
  formatMoney,
  formatMoneyWithCents,
  type CashDirection,
  type CashMovementReason,
  type ManualCashReason,
} from '@kiosco/shared';

export const REASON_LABELS: Record<CashMovementReason, string> = {
  OWNER_WITHDRAWAL: 'Retiro del dueño',
  EXPENSE: 'Gasto',
  CASH_CONTRIBUTION: 'Aporte de cambio',
  OTHER: 'Otro',
  SALE_VOID_REFUND: 'Devolución por anulación',
  SUPPLIER_PAYMENT: 'Pago a proveedor',
};

const MANUAL_REASONS = Object.keys(MANUAL_CASH_REASON_DIRECTIONS) as ManualCashReason[];

/** Motivos que se ofrecen para un sentido: el usuario nunca elige el signo por su cuenta. */
export function reasonsFor(direction: CashDirection): ManualCashReason[] {
  return MANUAL_REASONS.filter((r) =>
    (MANUAL_CASH_REASON_DIRECTIONS[r] as readonly CashDirection[]).includes(direction),
  );
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

/** ¿La apertura declaró un efectivo distinto de lo contado en el cierre anterior? */
export function hasOpeningDifference(
  value: { difference: string } | null | undefined,
): value is { difference: string } {
  return value != null && !new Decimal(value.difference).isZero();
}
