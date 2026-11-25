// Tests de calculateSale: los 6 ejemplos de docs/api/ventas.md sección 10, los de requisitos.md
// (regla 3), y las reglas H-06, H-10, H-11, H-35, PA-14 (ADR 002).
import { describe, expect, it } from 'vitest';
import {
  calculateSale,
  cashChange,
  creditAmountFromCharged,
  newClientRequestId,
  SaleCalculationError,
  type CalcDiscountInput,
  type CalcLineInput,
  type CalcPaymentInput,
} from './calculate';
import { getBusinessDate } from '../money/business-date';

const line = (unitPrice: string, vat = '21', quantity = '1'): CalcLineInput => ({
  quantity,
  unitPrice,
  vatRatePercent: vat,
});
const cash = (amount: string): CalcPaymentInput => ({ amount, surchargePercent: '0' });
const credit = (amount: string): CalcPaymentInput => ({ amount, surchargePercent: '10' });
const f2 = (d: { toFixed(n: number): string }) => d.toFixed(2);

describe('calculateSale: los 6 ejemplos del contrato (ventas.md 10)', () => {
  it('ejemplo 1: todo con crédito y descuento del 10 % -> $10.000 (regla 3, ej. 1)', () => {
    const r = calculateSale({
      lines: [line('6000'), line('4000')],
      discount: { type: 'PERCENT', value: '10' },
      payments: [credit('9000')],
    });
    expect(f2(r.subtotal)).toBe('10000.00');
    expect(f2(r.discountAmount)).toBe('1000.00');
    expect(r.discountPercent && f2(r.discountPercent)).toBe('10.00');
    expect(r.lines.map((l) => f2(l.discountAmount))).toEqual(['600.00', '400.00']);
    expect(r.lines.map((l) => f2(l.lineTotal))).toEqual(['5400.00', '3600.00']);
    expect(r.lines.map((l) => f2(l.lineNetTotal))).toEqual(['4462.81', '2975.21']);
    expect(f2(r.amountDue)).toBe('9000.00');
    const p = r.payments[0]!;
    expect(f2(p.surchargeBase)).toBe('10000.00');
    expect(f2(p.surchargeAmount)).toBe('1000.00');
    expect(f2(p.chargedAmount)).toBe('10000.00');
    expect(f2(r.total)).toBe('10000.00');
    expect(f2(r.remaining)).toBe('0.00');
  });

  it('ejemplo 2: mixto -> $9.500, con $5.000 en el posnet (regla 3, ej. 2)', () => {
    const r = calculateSale({
      lines: [line('6000'), line('4000')],
      discount: { type: 'AMOUNT', value: '1000' },
      payments: [cash('4500'), credit('4500')],
    });
    expect(r.discountPercent).toBeNull();
    expect(r.payments.map((p) => f2(p.surchargeBase))).toEqual(['5000.00', '5000.00']);
    expect(r.payments.map((p) => f2(p.surchargeAmount))).toEqual(['0.00', '500.00']);
    expect(r.payments.map((p) => f2(p.chargedAmount))).toEqual(['4500.00', '5000.00']);
    expect(f2(r.surchargeAmount)).toBe('500.00');
    expect(f2(r.total)).toBe('9500.00');
    // Vuelto: entrega $5.000 por $4.500 en efectivo.
    expect(f2(cashChange('5000', '4500'))).toBe('500.00');
  });

  it('ejemplo 3: sin descuento, todo con crédito -> $8.800 (regla 3, ej. 3)', () => {
    const r = calculateSale({
      lines: [line('5000'), line('3000')],
      payments: [credit('8000')],
    });
    expect(f2(r.subtotal)).toBe('8000.00');
    expect(f2(r.discountAmount)).toBe('0.00');
    expect(f2(r.payments[0]!.surchargeBase)).toBe('8000.00');
    expect(f2(r.payments[0]!.surchargeAmount)).toBe('800.00');
    expect(f2(r.payments[0]!.chargedAmount)).toBe('8800.00');
    expect(f2(r.total)).toBe('8800.00');
    expect(r.lines.map((l) => f2(l.lineNetTotal))).toEqual(['4132.23', '2479.34']);
  });

  it('ejemplo 4: línea por peso (0,350 kg x $4.990 -> $1.747, H-06 a) + vuelto', () => {
    const r = calculateSale({
      lines: [line('4990', '21', '0.350'), line('1450', '21', '2')],
      payments: [cash('4647')],
    });
    expect(r.lines.map((l) => f2(l.lineSubtotal))).toEqual(['1747.00', '2900.00']);
    expect(r.lines.map((l) => f2(l.lineNetTotal))).toEqual(['1443.80', '2396.69']);
    expect(f2(r.total)).toBe('4647.00');
    expect(f2(cashChange('5000', r.payments[0]!.amount))).toBe('353.00');
  });

  it('ejemplo 5: "Varios" a $700 + alfajor $1.210, mitad efectivo y mitad crédito -> $2.006', () => {
    const r = calculateSale({
      lines: [line('700'), line('1210')],
      payments: [cash('955'), credit('955')],
    });
    expect(f2(r.subtotal)).toBe('1910.00');
    // $95,50 de recargo sube a $96 (H-06 a).
    expect(f2(r.payments[1]!.surchargeAmount)).toBe('96.00');
    expect(f2(r.payments[1]!.chargedAmount)).toBe('1051.00');
    expect(f2(r.total)).toBe('2006.00');
    expect(r.lines.map((l) => f2(l.lineNetTotal))).toEqual(['578.51', '1000.00']);
    expect(f2(cashChange('1000', '955'))).toBe('45.00');
  });

  it('ejemplo 6: reparto del descuento con centavo sobrante (D6)', () => {
    const r = calculateSale({
      lines: [line('1000', '21'), line('1000', '10.5'), line('1000', '21')],
      discount: { type: 'AMOUNT', value: '1000' },
      payments: [{ amount: '2000', surchargePercent: '0' }],
    });
    expect(r.lines.map((l) => f2(l.discountAmount))).toEqual(['333.33', '333.33', '333.34']);
    expect(r.lines.map((l) => f2(l.lineTotal))).toEqual(['666.67', '666.67', '666.66']);
    expect(r.lines.map((l) => f2(l.lineNetTotal))).toEqual(['550.97', '603.32', '550.96']);
    const sum = r.lines.reduce(
      (a, l) => a.plus(l.discountAmount),
      r.discountAmount.minus(r.discountAmount),
    );
    expect(f2(sum)).toBe('1000.00');
    // La base del recargo se guarda igual aunque el % sea 0.
    expect(f2(r.payments[0]!.surchargeBase)).toBe('3000.00');
    expect(f2(r.payments[0]!.surchargeAmount)).toBe('0.00');
    expect(f2(r.total)).toBe('2000.00');
  });
});

describe('calculateSale: reglas', () => {
  it('con pagos incompletos informa lo que falta (la pantalla arma el cobro)', () => {
    const r = calculateSale({ lines: [line('1000')], payments: [cash('400')] });
    expect(f2(r.remaining)).toBe('600.00');
    expect(f2(r.paidAmount)).toBe('400.00');
  });

  it('sin pagos: total = amountDue y remaining = amountDue', () => {
    const r = calculateSale({ lines: [line('1000')] });
    expect(f2(r.total)).toBe('1000.00');
    expect(f2(r.remaining)).toBe('1000.00');
  });

  it('carrito vacío: todo en 0 y no falla', () => {
    const r = calculateSale({ lines: [], payments: [credit('0')] });
    expect(f2(r.total)).toBe('0.00');
    expect(r.lines).toEqual([]);
  });

  it('dos pagos de crédito: cada uno con su recargo (H-39)', () => {
    const r = calculateSale({ lines: [line('1001')], payments: [credit('500'), credit('501')] });
    expect(r.payments.map((p) => f2(p.surchargeAmount))).toEqual(['50.00', '50.00']); // 50 y 50,1 -> 50
    expect(f2(r.total)).toBe('1101.00');
  });

  it('el descuento en % se redondea al peso (R-2): 10 % de $1.005 = $100,50 -> $101', () => {
    const r = calculateSale({
      lines: [line('1005')],
      discount: { type: 'PERCENT', value: '10' },
    });
    expect(f2(r.discountAmount)).toBe('101.00');
  });

  it('descuento en $ con centavos se redondea al peso', () => {
    const r = calculateSale({
      lines: [line('1000')],
      discount: { type: 'AMOUNT', value: '100.50' },
    });
    expect(f2(r.discountAmount)).toBe('101.00');
  });

  const expectError = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(SaleCalculationError);
      expect((err as SaleCalculationError).code).toBe(code);
      return err as SaleCalculationError;
    }
    throw new Error(`Tenía que lanzar ${code}`);
  };

  it('H-10 b: descuento igual al subtotal o del 100 % -> DISCOUNT_TOO_HIGH', () => {
    expectError(
      () => calculateSale({ lines: [line('1000')], discount: { type: 'PERCENT', value: '100' } }),
      'DISCOUNT_TOO_HIGH',
    );
    const err = expectError(
      () => calculateSale({ lines: [line('1000')], discount: { type: 'AMOUNT', value: '1000' } }),
      'DISCOUNT_TOO_HIGH',
    );
    expect(err.details).toEqual({ subtotal: '1000.00', discountAmount: '1000.00' });
    expectError(
      () => calculateSale({ lines: [line('1000')], discount: { type: 'AMOUNT', value: '1500' } }),
      'DISCOUNT_TOO_HIGH',
    );
  });

  it('descuento justo por debajo del subtotal: $999 de $1.000 se acepta', () => {
    const r = calculateSale({
      lines: [line('1000')],
      discount: { type: 'AMOUNT', value: '999' },
    });
    expect(f2(r.amountDue)).toBe('1.00');
  });

  it('descuento que redondea a $0 -> DISCOUNT_ROUNDS_TO_ZERO', () => {
    expectError(
      () => calculateSale({ lines: [line('100')], discount: { type: 'PERCENT', value: '0.40' } }),
      'DISCOUNT_ROUNDS_TO_ZERO',
    );
    expectError(
      () => calculateSale({ lines: [line('100')], discount: { type: 'AMOUNT', value: '0.40' } }),
      'DISCOUNT_ROUNDS_TO_ZERO',
    );
  });

  it('H-35: una línea de $0 -> LINE_TOTAL_ZERO con el índice', () => {
    const err = expectError(
      () => calculateSale({ lines: [line('1000'), line('0')] }),
      'LINE_TOTAL_ZERO',
    );
    expect(err.details).toEqual({ items: [{ index: 1 }] });
    // Un peso tan chico que redondea a $0 (0,001 kg x $100 = $0,10).
    expectError(() => calculateSale({ lines: [line('100', '21', '0.001')] }), 'LINE_TOTAL_ZERO');
  });
});

describe('creditAmountFromCharged (inversa para la pantalla)', () => {
  it('sin descuento: $8.800 en el posnet -> amount 8.000', () => {
    expect(creditAmountFromCharged('8800', '8000', '0', '10').toString()).toBe('8000');
  });
  it('con descuento: $5.000 en el posnet (ej. 2) -> amount 4.500', () => {
    expect(creditAmountFromCharged('5000', '10000', '1000', '10').toString()).toBe('4500');
  });
  it('monto de posnet imposible: devuelve el amount más cercano', () => {
    // Sin descuento y 10 %: amount 1.004 da $1.104 y 1.005 da $1.106; $1.105 no existe.
    const amount = creditAmountFromCharged('1105', '2000', '0', '10');
    const real = calculateSale({
      lines: [line('2000')],
      payments: [credit(amount.toString())],
    }).payments[0]!.chargedAmount;
    expect(['1104', '1106']).toContain(real.toString());
    expect(['1004', '1005']).toContain(amount.toString());
  });
  it('siempre da un charged lo más cercano posible (barrido)', () => {
    for (let target = 100; target <= 1500; target += 7) {
      const amount = creditAmountFromCharged(String(target), '1500', '300', '10');
      const gap = (a: number) =>
        calculateSale({
          lines: [line('1500')],
          discount: { type: 'AMOUNT', value: '300' } as CalcDiscountInput,
          payments: [credit(String(a))],
        })
          .payments[0]!.chargedAmount.minus(target)
          .abs();
      const best = gap(Number(amount.toString()));
      for (const d of [-2, -1, 1, 2]) {
        expect(best.lte(gap(Number(amount.toString()) + d))).toBe(true);
      }
    }
  });
  it('sin nada que cobrar devuelve 0', () => {
    expect(creditAmountFromCharged('100', '0', '0', '10').toString()).toBe('0');
  });
});

describe('newClientRequestId', () => {
  it('es un UUID v4 y no se repite', () => {
    const a = newClientRequestId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientRequestId()).not.toBe(a);
  });
});

describe('getBusinessDate (ADR 002 punto 7, corte 06:00 = 360)', () => {
  // Buenos Aires es UTC-3 todo el año.
  const at = (isoLocal: string) => new Date(`${isoLocal}-03:00`);
  it('martes 02:30 -> lunes (turno noche)', () => {
    expect(getBusinessDate(at('2026-11-24T02:30:00'), 360)).toBe('2026-11-23');
  });
  it('martes 05:59 -> lunes y martes 06:00 -> martes (borde exacto)', () => {
    expect(getBusinessDate(at('2026-11-24T05:59:59'), 360)).toBe('2026-11-23');
    expect(getBusinessDate(at('2026-11-24T06:00:00'), 360)).toBe('2026-11-24');
  });
  it('martes 23:59 -> martes', () => {
    expect(getBusinessDate(at('2026-11-24T23:59:00'), 360)).toBe('2026-11-24');
  });
  it('medianoche exacta con corte 06:00 -> día anterior', () => {
    expect(getBusinessDate(at('2026-11-24T00:00:00'), 360)).toBe('2026-11-23');
  });
  it('con corte 0 es la fecha local, y cruza mes y año', () => {
    expect(getBusinessDate(at('2026-12-31T23:30:00'), 0)).toBe('2026-12-31');
    expect(getBusinessDate(at('2027-01-01T02:00:00'), 360)).toBe('2026-12-31');
    expect(getBusinessDate(at('2026-03-01T01:00:00'), 360)).toBe('2026-02-28');
  });
  it('usa la zona dada, no la del sistema: 01:30 UTC = 22:30 del día anterior en Buenos Aires', () => {
    expect(getBusinessDate(new Date('2026-11-24T01:30:00.000Z'), 0)).toBe('2026-11-23');
    expect(getBusinessDate(new Date('2026-11-24T01:30:00.000Z'), 0, 'UTC')).toBe('2026-11-24');
  });
});
