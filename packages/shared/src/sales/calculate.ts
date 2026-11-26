// Cálculo de una venta: UNA sola función pura que usan la pantalla y el servidor
// (docs/api/ventas.md 2.1 y 4.4, ADR 002). Todo con Decimal, nunca con `number`.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';
import {
  allocateDiscount,
  creditSurcharge,
  discountFromPercent,
  lineSubtotal,
  netFromFinal,
  roundToCents,
  roundToPeso,
} from '../money';
import type { DiscountType } from '../enums';

export interface CalcLineInput {
  quantity: DecimalInput;
  unitPrice: DecimalInput;
  vatRatePercent: DecimalInput;
}

export interface CalcDiscountInput {
  type: DiscountType;
  value: DecimalInput;
}

export interface CalcPaymentInput {
  /** Parte del total con descuento que cubre este medio, SIN recargo. */
  amount: DecimalInput;
  /** % de recargo del medio (solo el crédito tiene). */
  surchargePercent: DecimalInput;
}

export interface CalcLineResult {
  lineSubtotal: Decimal;
  discountAmount: Decimal;
  lineTotal: Decimal;
  lineNetTotal: Decimal;
}

export interface CalcPaymentResult {
  amount: Decimal;
  surchargeBase: Decimal;
  surchargePercent: Decimal;
  surchargeAmount: Decimal;
  /** Lo que se cobra con ese medio (monto del posnet): amount + recargo. */
  chargedAmount: Decimal;
}

export interface SaleCalculation {
  lines: CalcLineResult[];
  subtotal: Decimal;
  discountAmount: Decimal;
  /** El % usado, si el descuento se pidió en %; si no, null. */
  discountPercent: Decimal | null;
  /** subtotal − descuento: lo que tienen que sumar los pagos. */
  amountDue: Decimal;
  payments: CalcPaymentResult[];
  paidAmount: Decimal;
  /** amountDue − paidAmount (con pagos incompletos, lo que falta cargar). */
  remaining: Decimal;
  surchargeAmount: Decimal;
  /** amountDue + recargo = lo cobrado. */
  total: Decimal;
}

export type SaleCalculationErrorCode =
  'LINE_TOTAL_ZERO' | 'DISCOUNT_TOO_HIGH' | 'DISCOUNT_ROUNDS_TO_ZERO';

/** Error de una regla de la venta, con el mismo `code` que la API (así pantalla y servidor dicen lo mismo). */
export class SaleCalculationError extends Error {
  constructor(
    public readonly code: SaleCalculationErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'SaleCalculationError';
  }
}

const ZERO = new Decimal(0);

/**
 * Calcula la venta completa (H-06, H-10, H-11, H-35, PA-14, PA-20).
 *  1. `lineSubtotal` = R-2(cantidad × precio). Una línea de $0 es un error (H-35).
 *  2. Descuento en $ o % (R-2), menor que el subtotal (H-10 b), repartido entre las líneas (D6).
 *  3. `lineNetTotal` = R-1(lineTotal ÷ (1 + IVA)).
 *  4. Recargo solo donde el medio tiene % (crédito), sobre la parte ANTES del descuento (PA-14, H-11).
 * Con pagos incompletos también funciona (`remaining`): la pantalla lo usa mientras arma el cobro.
 * Con el carrito vacío devuelve todo en 0.
 */
export function calculateSale(input: {
  lines: CalcLineInput[];
  discount?: CalcDiscountInput | null | undefined;
  payments?: CalcPaymentInput[] | undefined;
}): SaleCalculation {
  const lineSubtotals = input.lines.map((l) => lineSubtotal(l.quantity, l.unitPrice));

  const zeroIndexes = lineSubtotals.flatMap((s, index) => (s.isZero() ? [{ index }] : []));
  if (zeroIndexes.length > 0) {
    throw new SaleCalculationError(
      'LINE_TOTAL_ZERO',
      'Una línea da $ 0. Revisá el precio o la cantidad.',
      { items: zeroIndexes },
    );
  }

  const subtotal = lineSubtotals.reduce((acc, s) => acc.plus(s), ZERO);

  // Descuento.
  let discountAmount = ZERO;
  let discountPercent: Decimal | null = null;
  if (input.discount) {
    const value = toDecimal(input.discount.value);
    if (input.discount.type === 'PERCENT') {
      discountAmount = discountFromPercent(subtotal, value);
      discountPercent = roundToCents(value);
    } else {
      discountAmount = roundToPeso(value);
    }
    if (discountAmount.isZero()) {
      throw new SaleCalculationError(
        'DISCOUNT_ROUNDS_TO_ZERO',
        'El descuento es tan chico que da $ 0.',
      );
    }
    if (discountAmount.gte(subtotal)) {
      throw new SaleCalculationError(
        'DISCOUNT_TOO_HIGH',
        'El descuento tiene que ser menor que el subtotal.',
        { subtotal: subtotal.toFixed(2), discountAmount: discountAmount.toFixed(2) },
      );
    }
  }

  const amountDue = subtotal.minus(discountAmount);

  // Reparto del descuento y netos por línea.
  const shares = lineSubtotals.length > 0 ? allocateDiscount(lineSubtotals, discountAmount) : [];
  const lines: CalcLineResult[] = input.lines.map((l, i) => {
    const sub = lineSubtotals[i]!;
    const share = shares[i]!;
    const lineTotal = sub.minus(share);
    return {
      lineSubtotal: sub,
      discountAmount: share,
      lineTotal,
      lineNetTotal: netFromFinal(lineTotal, l.vatRatePercent),
    };
  });

  // Pagos y recargo.
  const payments: CalcPaymentResult[] = (input.payments ?? []).map((p) => {
    const amount = toDecimal(p.amount);
    const percent = toDecimal(p.surchargePercent);
    if (amountDue.lte(0)) {
      // Carrito vacío: no hay nada que cobrar ni recargar.
      return {
        amount,
        surchargeBase: ZERO,
        surchargePercent: percent,
        surchargeAmount: ZERO,
        chargedAmount: amount,
      };
    }
    const { surchargeBase, surchargeAmount } = creditSurcharge(
      amount,
      subtotal,
      discountAmount,
      percent,
    );
    return {
      amount,
      surchargeBase,
      surchargePercent: percent,
      surchargeAmount,
      chargedAmount: amount.plus(surchargeAmount),
    };
  });

  const paidAmount = payments.reduce((acc, p) => acc.plus(p.amount), ZERO);
  const surchargeAmount = payments.reduce((acc, p) => acc.plus(p.surchargeAmount), ZERO);

  return {
    lines,
    subtotal,
    discountAmount,
    discountPercent,
    amountDue,
    payments,
    paidAmount,
    remaining: amountDue.minus(paidAmount),
    surchargeAmount,
    total: amountDue.plus(surchargeAmount),
  };
}

/**
 * Inversa para la pantalla (ventas.md 2.2): el `amount` entero (sin recargo) cuyo `chargedAmount`
 * es el más cercano al monto que el cliente quiere pagar en el posnet. Si hay dos igual de
 * cerca, el más chico. Con carrito vacío o descuento inválido devuelve 0.
 */
export function creditAmountFromCharged(
  charged: DecimalInput,
  subtotal: DecimalInput,
  discount: DecimalInput,
  surchargePercent: DecimalInput,
): Decimal {
  const target = toDecimal(charged);
  const sub = toDecimal(subtotal);
  const disc = toDecimal(discount);
  const percent = toDecimal(surchargePercent);
  const due = sub.minus(disc);
  if (due.lte(0) || target.lte(0)) return ZERO;

  const chargedFor = (amount: Decimal): Decimal =>
    amount.plus(creditSurcharge(amount, sub, disc, percent).surchargeAmount);

  // Primera aproximación sin redondeos: charged = amount × (1 + % × subtotal / (subtotal − descuento)).
  const factor = percent.div(100).times(sub).div(due).plus(1);
  const guess = roundToPeso(target.div(factor));
  let best = guess.isNegative() ? ZERO : guess;
  let bestGap = chargedFor(best).minus(target).abs();
  // El recargo salta de a $1 o $2: se revisan los vecinos.
  for (let delta = -3; delta <= 3; delta++) {
    const candidate = guess.plus(delta);
    if (candidate.isNegative()) continue;
    const gap = chargedFor(candidate).minus(target).abs();
    if (gap.lt(bestGap) || (gap.eq(bestGap) && candidate.lt(best))) {
      best = candidate;
      bestGap = gap;
    }
  }
  return best;
}

/** Vuelto (VEN-12): lo entregado menos la parte en efectivo. Negativo = no alcanza. */
export function cashChange(cashTendered: DecimalInput, cashAmount: DecimalInput): Decimal {
  return toDecimal(cashTendered).minus(toDecimal(cashAmount));
}

/**
 * UUID v4 para `clientRequestId`. Usa `crypto.getRandomValues()`, que existe también en páginas
 * HTTP que no son localhost (`crypto.randomUUID()` no; las tablets entran por http://192.168.x.x).
 */
export function newClientRequestId(): string {
  const cryptoApi = (
    globalThis as unknown as { crypto?: { getRandomValues<T extends Uint8Array>(array: T): T } }
  ).crypto;
  if (!cryptoApi) throw new Error('Este navegador no tiene crypto.getRandomValues.');
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40; // versión 4
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
