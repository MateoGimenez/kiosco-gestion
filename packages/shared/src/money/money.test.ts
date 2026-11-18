// Tests de dinero y redondeo. Los casos salen de requisitos.md (ventas, regla 3),
// modelo-datos.md (sección 1) y ADR 002 (punto 6).
import { describe, expect, it } from 'vitest';
import { Decimal } from '../decimal';
import {
  allocateDiscount,
  creditSurcharge,
  discountFromPercent,
  finalFromNet,
  formatMoney,
  formatMoneyWithCents,
  formatPercent,
  formatQuantity,
  lineSubtotal,
  netFromFinal,
  realMargin,
  roundPriceUp,
  roundToCents,
  roundToPeso,
  suggestedPrice,
} from './index';

describe('R-1 roundToCents', () => {
  it('mitad hacia arriba a 2 decimales', () => {
    expect(roundToCents('1.005').toFixed(2)).toBe('1.01');
    expect(roundToCents('1.004').toFixed(2)).toBe('1.00');
  });
  it('es simétrico con negativos', () => {
    expect(roundToCents('-1.005').toFixed(2)).toBe('-1.01');
  });
});

describe('R-2 roundToPeso (H-06 a)', () => {
  it('$ 0,50 sube', () => {
    expect(roundToPeso('1746.50').toString()).toBe('1747');
    expect(roundToPeso('1746.49').toString()).toBe('1746');
  });
  it('simétrico: -2,50 -> -3', () => {
    expect(roundToPeso('-2.50').toString()).toBe('-3');
  });
});

describe('R-3 roundPriceUp (PA-19)', () => {
  it('PRE-03: 1432 -> 1440 y 1440 queda igual', () => {
    expect(roundPriceUp('1432').toString()).toBe('1440');
    expect(roundPriceUp('1440', '10').toString()).toBe('1440');
  });
  it('siempre hacia arriba, aunque sea por un centavo', () => {
    expect(roundPriceUp('1440.01', '10').toString()).toBe('1450');
  });
  it('con paso 0 solo redondea a centavos', () => {
    expect(roundPriceUp('1432.456', '0').toFixed(2)).toBe('1432.46');
  });
});

describe('IVA y costos', () => {
  it('costo final desde neto', () => {
    expect(finalFromNet('1000', '21').toFixed(2)).toBe('1210.00');
    expect(finalFromNet('333.33', '10.5').toFixed(2)).toBe('368.33');
  });
  it('neto desde final: $ 1.210 con IVA 21 % -> $ 1.000 (requisitos, ganancia)', () => {
    expect(netFromFinal('1210', '21').toFixed(2)).toBe('1000.00');
  });
});

describe('suggestedPrice (H-15 a)', () => {
  it('costo neto 1000, margen 40 %, IVA 21 % -> 1694 -> 1700', () => {
    expect(suggestedPrice('1000', '40', '21', '10').toString()).toBe('1700');
  });
  it('acepta Decimal además de string', () => {
    expect(suggestedPrice(new Decimal('1000'), '40', '21').toString()).toBe('1700');
  });
});

describe('realMargin', () => {
  it('precio 1694 con IVA 21 % sobre costo neto 1000 -> 40 %', () => {
    expect(realMargin('1694', '1000', '21')?.toFixed(2)).toBe('40.00');
  });
  it('el precio redondeado a 1700 da un margen un poco mayor', () => {
    expect(realMargin('1700', '1000', '21')?.toFixed(2)).toBe('40.50');
  });
  it('costo 0 -> null', () => {
    expect(realMargin('100', '0', '21')).toBeNull();
  });
});

describe('líneas y descuento', () => {
  it('0,350 kg x $ 4.990 = $ 1.746,50 -> $ 1.747', () => {
    expect(lineSubtotal('0.350', '4990').toString()).toBe('1747');
  });
  it('descuento 10 % sobre 10.000 = 1.000', () => {
    expect(discountFromPercent('10000', '10').toString()).toBe('1000');
  });
  it('descuento en % redondea al peso', () => {
    expect(discountFromPercent('1005', '10').toString()).toBe('101'); // 100,50 sube
  });
  it('reparte el descuento proporcional y la diferencia va a la última línea', () => {
    const shares = allocateDiscount(['3000', '7000'], '1000');
    expect(shares.map((s) => s.toFixed(2))).toEqual(['300.00', '700.00']);

    const odd = allocateDiscount(['100', '100', '100'], '100');
    expect(odd.map((s) => s.toFixed(2))).toEqual(['33.33', '33.33', '33.34']);
    expect(odd.reduce((a, b) => a.plus(b), new Decimal(0)).toFixed(2)).toBe('100.00');
  });
});

describe('creditSurcharge (requisitos, ventas regla 3; ADR 002 casos 1 a 3)', () => {
  it('caso 1: todo crédito con descuento -> base 10.000, recargo 1.000, total 10.000', () => {
    const r = creditSurcharge('9000', '10000', '1000', '10');
    expect(r.surchargeBase.toFixed(2)).toBe('10000.00');
    expect(r.surchargeAmount.toString()).toBe('1000');
    expect(new Decimal('9000').plus(r.surchargeAmount).toString()).toBe('10000');
  });
  it('caso 2: mixto -> base 5.000, recargo 500, total 9.500', () => {
    const r = creditSurcharge('4500', '10000', '1000', '10');
    expect(r.surchargeBase.toFixed(2)).toBe('5000.00');
    expect(r.surchargeAmount.toString()).toBe('500');
    expect(new Decimal('9000').plus(r.surchargeAmount).toString()).toBe('9500');
  });
  it('caso 3: sin descuento -> recargo 800, total 8.800', () => {
    const r = creditSurcharge('8000', '8000', '0', '10');
    expect(r.surchargeBase.toFixed(2)).toBe('8000.00');
    expect(r.surchargeAmount.toString()).toBe('800');
  });
  it('sin parte de crédito no hay recargo', () => {
    expect(creditSurcharge('0', '10000', '1000', '10').surchargeAmount.toString()).toBe('0');
  });
  it('descuento igual o mayor al subtotal es inválido (H-10 b)', () => {
    expect(() => creditSurcharge('0', '1000', '1000', '10')).toThrow(RangeError);
  });
});

describe('formato es-AR', () => {
  it('lo cobrado, sin centavos', () => {
    expect(formatMoney('1440')).toBe('$ 1.440');
    expect(formatMoney('1234567.50')).toBe('$ 1.234.568');
    expect(formatMoney('-1440')).toBe('-$ 1.440');
  });
  it('costos con centavos', () => {
    expect(formatMoneyWithCents('1234.56')).toBe('$ 1.234,56');
    expect(formatMoneyWithCents('5')).toBe('$ 5,00');
  });
  it('cantidades', () => {
    expect(formatQuantity('2.000')).toBe('2');
    expect(formatQuantity('0.35', 'KG')).toBe('0,350 kg');
  });
  it('porcentajes', () => {
    expect(formatPercent('21.00')).toBe('21 %');
    expect(formatPercent('10.50')).toBe('10,5 %');
  });
});
