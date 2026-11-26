// Ejemplos A a D de docs/api/caja.md 9.2 y los casos extra.
import { describe, expect, it } from 'vitest';
import { calculateExpectedCash, cashDifference, MANUAL_CASH_REASON_DIRECTIONS } from './expected';

const expected = (openingCash: string, cashSales: string, cashIn: string, cashOut: string) =>
  calculateExpectedCash({ openingCash, cashSales, cashIn, cashOut });

describe('calculateExpectedCash', () => {
  it('A (plan): 5.000 + 3.000 − 500 = 7.500; contado 7.400 -> diferencia −100', () => {
    // La venta de $2.000 con débito no entra: solo efectivo.
    const e = expected('5000', '3000', '0', '500');
    expect(e.toFixed(2)).toBe('7500.00');
    expect(cashDifference('7400', e).toFixed(2)).toBe('-100.00');
  });

  it('B (vuelto): el pago en efectivo es lo que queda en la caja (4.647), no lo entregado (5.000)', () => {
    const e = expected('5000', '4647', '0', '0');
    expect(e.toFixed(2)).toBe('9647.00');
    expect(cashDifference('9647', e).isZero()).toBe(true);
  });

  it('C: devolución de una venta de otro turno (salida de 4.500) -> 5.000 + 2.000 − 4.500 = 2.500', () => {
    const e = expected('5000', '2000', '0', '4500');
    expect(e.toFixed(2)).toBe('2500.00');
    expect(cashDifference('2500', e).isZero()).toBe(true);
  });

  it('C (misma caja): venta en efectivo 3.000 y su devolución -> vuelve a 5.000', () => {
    expect(expected('5000', '3000', '0', '3000').toFixed(2)).toBe('5000.00');
  });

  it('D (mixto con recargo): solo entra lo cobrado en efectivo (4.500); el crédito y su recargo no', () => {
    // amount 4.500 + recargo 0 del efectivo; el crédito (4.500 + 500) queda en el posnet.
    expect(expected('2000', '4500', '0', '0').toFixed(2)).toBe('6500.00');
  });

  it('sin ventas ni movimientos: el esperado es el efectivo inicial', () => {
    expect(expected('1234.50', '0', '0', '0').toFixed(2)).toBe('1234.50');
  });

  it('efectivo inicial 0 y una devolución de 4.500 -> −4.500 (el cierre funciona)', () => {
    const e = expected('0', '0', '0', '4500');
    expect(e.toFixed(2)).toBe('-4500.00');
    expect(cashDifference('0', e).toFixed(2)).toBe('4500.00');
  });

  it('un aporte de cambio de 1.000 suma 1.000', () => {
    expect(expected('5000', '0', '1000', '0').toFixed(2)).toBe('6000.00');
  });

  it('es exacta con centavos (sin errores de coma flotante)', () => {
    expect(expected('0.10', '0.20', '0', '0').toFixed(2)).toBe('0.30');
  });
});

describe('MANUAL_CASH_REASON_DIRECTIONS', () => {
  it('no incluye la devolución por anulación ni el pago a proveedor', () => {
    expect(Object.keys(MANUAL_CASH_REASON_DIRECTIONS).sort()).toEqual([
      'CASH_CONTRIBUTION',
      'EXPENSE',
      'OTHER',
      'OWNER_WITHDRAWAL',
    ]);
  });
});
