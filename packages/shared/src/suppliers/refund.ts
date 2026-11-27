// Devolución del proveedor (docs/api/proveedores.md 15.4 paso 7 y 15.8, H-68 b).
// La usan el servidor (para frenar una devolución mayor que el saldo a favor) y la pantalla (resumen
// en vivo). Todo con Decimal: nunca `number`.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';

export interface SupplierRefundCheck {
  /** Saldo a favor del kiosco: max(0, −saldo). */
  credit: string;
  /** Saldo de la cuenta después de la devolución: saldo + importe (con signo). */
  balanceAfter: string;
  /** true si el importe supera el saldo a favor (hace falta `confirmExceedsCredit`). */
  exceedsCredit: boolean;
}

/**
 * `balance` es el saldo con signo de la cuenta corriente (+ le debemos; − saldo a favor).
 * La devolución suma (`REFUND +`): el saldo se acerca a 0 y, si se pasa, queda deuda con el proveedor.
 */
export function checkSupplierRefund(input: {
  balance: DecimalInput;
  amount: DecimalInput;
}): SupplierRefundCheck {
  const balance = toDecimal(input.balance);
  const amount = toDecimal(input.amount);
  const credit = Decimal.max(0, balance.neg());
  return {
    credit: credit.toFixed(2),
    balanceAfter: balance.plus(amount).toFixed(2),
    exceedsCredit: amount.greaterThan(credit),
  };
}
