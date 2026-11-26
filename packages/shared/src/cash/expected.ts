// Efectivo esperado y diferencia de una caja (docs/api/caja.md, sección 9). Funciones puras, con Decimal.
import { toDecimal, type Decimal, type DecimalInput } from '../decimal';
import type { CashDirection } from '../enums';

export interface ExpectedCashInput {
  /** Efectivo inicial de la caja. */
  openingCash: DecimalInput;
  /**
   * Σ (amount + surchargeAmount) de los pagos en efectivo de TODAS las ventas de la caja
   * (también las anuladas después). Es lo que queda en el cajón: neto del vuelto.
   */
  cashSales: DecimalInput;
  /** Σ de los movimientos de entrada. */
  cashIn: DecimalInput;
  /** Σ de las salidas (gastos, retiros, otros y devoluciones por anulación). */
  cashOut: DecimalInput;
}

/** `openingCash + cashSales + cashIn − cashOut`. Sin redondeo; puede dar negativo (H-53). */
export function calculateExpectedCash(input: ExpectedCashInput): Decimal {
  return toDecimal(input.openingCash)
    .plus(toDecimal(input.cashSales))
    .plus(toDecimal(input.cashIn))
    .minus(toDecimal(input.cashOut));
}

/** `countedCash − expectedCash`. Negativo = faltante; positivo = sobrante. */
export function cashDifference(countedCash: DecimalInput, expectedCash: DecimalInput): Decimal {
  return toDecimal(countedCash).minus(toDecimal(expectedCash));
}

/** Sentidos permitidos a mano para cada motivo (docs/api/caja.md 11.1). */
export const MANUAL_CASH_REASON_DIRECTIONS = {
  OWNER_WITHDRAWAL: ['OUT'],
  EXPENSE: ['OUT'],
  CASH_CONTRIBUTION: ['IN'],
  OTHER: ['IN', 'OUT'],
} as const satisfies Record<string, readonly CashDirection[]>;

export type ManualCashReason = keyof typeof MANUAL_CASH_REASON_DIRECTIONS;
