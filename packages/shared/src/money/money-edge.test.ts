// Casos borde de dinero y redondeo que pide el plan (4.1.6): centavos, peso entero, precio hacia
// arriba a $ 10, mitades, negativos y formato es-AR. Se suman a los de `money.test.ts`.
import { describe, expect, it } from 'vitest';
import { Decimal, toDecimal } from '../decimal';
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

describe('R-1 a centavos: bordes', () => {
  it.each([
    ['0.005', '0.01'],
    ['0.004999', '0.00'],
    ['2.675', '2.68'], // en coma flotante daría 2,67: acá es exacto
    ['1.015', '1.02'],
    ['0', '0.00'],
    ['999999999999.995', '1000000000000.00'],
  ])('roundToCents(%s) = %s', (input, expected) => {
    expect(roundToCents(input).toFixed(2)).toBe(expected);
  });

  it('acepta un Decimal como entrada y devuelve un Decimal', () => {
    expect(roundToCents(new Decimal('3.456')).toFixed(2)).toBe('3.46');
  });

  it('rechaza textos que no son números', () => {
    expect(() => roundToCents('abc')).toThrow();
    expect(() => roundToCents('')).toThrow();
  });
});

describe('R-2 al peso entero: mitades y negativos', () => {
  it.each([
    ['0.5', '1'],
    ['0.49', '0'],
    ['1.5', '2'],
    ['2.5', '3'], // no es "redondeo del banquero": 2,5 sube
    ['0.4999', '0'],
    ['-0.5', '-1'],
    ['-1.5', '-2'],
    ['-0.49', '0'],
    ['1746.50', '1747'],
  ])('roundToPeso(%s) = %s', (input, expected) => {
    // `+ 0` evita comparar "-0" contra "0".
    expect(roundToPeso(input).plus(0).toString()).toBe(expected);
  });

  it('es simétrico: redondear(-x) = -redondear(x)', () => {
    for (const x of ['0.5', '2.5', '10.5', '1746.5', '0.51', '99.49']) {
      expect(roundToPeso(`-${x}`).toString()).toBe(roundToPeso(x).negated().toString());
    }
  });
});

describe('R-3 precio hacia arriba al múltiplo de $ 10: bordes', () => {
  it.each([
    ['0.01', '10'],
    ['1', '10'],
    ['9.99', '10'],
    ['10', '10'],
    ['10.01', '20'],
    ['1439.99', '1440'],
    ['1440', '1440'],
    ['1441', '1450'],
    ['0', '0'],
  ])('roundPriceUp(%s) = %s', (input, expected) => {
    expect(roundPriceUp(input, '10').toString()).toBe(expected);
  });

  it('otro paso (por ejemplo, $ 50 o $ 5) y paso 1', () => {
    expect(roundPriceUp('1432', '50').toString()).toBe('1450');
    expect(roundPriceUp('1432', '5').toString()).toBe('1435');
    expect(roundPriceUp('1432.10', '1').toString()).toBe('1433');
  });

  it('paso negativo es inválido', () => {
    expect(() => roundPriceUp('100', '-10')).toThrow(RangeError);
  });

  it('nunca baja el precio, tenga los decimales que tenga', () => {
    for (const v of ['1.0000001', '1439.9999999', '123456.789', '5.5', '9.9']) {
      expect(roundPriceUp(v, '10').gte(toDecimal(v))).toBe(true);
      expect(roundPriceUp(v, '10').mod(10).isZero()).toBe(true);
    }
  });
});

describe('IVA y costos con centavos', () => {
  it.each([
    ['0', '21', '0.00'],
    ['100', '0', '100.00'],
    ['100', '10.5', '110.50'],
    ['100', '27', '127.00'],
    ['0.01', '21', '0.01'], // 0,0121 -> 0,01
    ['9.99', '21', '12.09'], // 12,0879
    ['1234.567', '21', '1493.83'], // 1493,82607
  ])('finalFromNet(%s, IVA %s) = %s', (net, vat, expected) => {
    expect(finalFromNet(net, vat).toFixed(2)).toBe(expected);
  });

  it('netFromFinal con centavos y IVA 10,5', () => {
    expect(netFromFinal('110.50', '10.5').toFixed(2)).toBe('100.00');
    expect(netFromFinal('1.00', '21').toFixed(2)).toBe('0.83');
  });

  it('ida y vuelta sin IVA no cambia el valor', () => {
    expect(netFromFinal(finalFromNet('1000', '0'), '0').toFixed(2)).toBe('1000.00');
  });
});

describe('suggestedPrice y realMargin: bordes', () => {
  it('margen 0 % e IVA 0 %: queda el costo, redondeado hacia arriba', () => {
    expect(suggestedPrice('1000', '0', '0').toString()).toBe('1000');
    expect(suggestedPrice('1001', '0', '0').toString()).toBe('1010');
  });

  it('un precio que ya es múltiplo de 10 no sube', () => {
    expect(suggestedPrice('100', '0', '21', '10').toString()).toBe('130'); // 121 -> 130
    expect(suggestedPrice('1000', '10', '0', '10').toString()).toBe('1100');
  });

  it('paso 0 solo redondea a centavos', () => {
    expect(suggestedPrice('333.33', '40', '21', '0').toFixed(2)).toBe('564.66');
  });

  it('realMargin puede ser negativo (precio por debajo del costo)', () => {
    expect(realMargin('605', '1000', '21')?.toFixed(2)).toBe('-50.00');
  });
});

describe('líneas por peso con decimales', () => {
  it.each([
    ['0.001', '4990', '5'], // 4,99
    ['0.100', '4990', '499'],
    ['0.350', '4990', '1747'], // 1746,50 sube
    ['1.250', '1000', '1250'],
    ['0.333', '1000', '333'],
    ['2.000', '0', '0'],
    ['0', '4990', '0'],
  ])('lineSubtotal(%s kg x $ %s) = %s', (qty, price, expected) => {
    expect(lineSubtotal(qty, price).toString()).toBe(expected);
  });

  it('precio con centavos', () => {
    expect(lineSubtotal('3', '10.50').toString()).toBe('32'); // 31,50 -> 32
  });
});

describe('descuento: bordes', () => {
  it('0 % y 100 %', () => {
    expect(discountFromPercent('1000', '0').toString()).toBe('0');
    expect(discountFromPercent('1000', '100').toString()).toBe('1000');
  });

  it('porcentaje con decimales', () => {
    expect(discountFromPercent('1000', '12.5').toString()).toBe('125');
    expect(discountFromPercent('999', '12.5').toString()).toBe('125'); // 124,875
  });

  it('reparto: una sola línea se lleva todo; lista vacía devuelve vacío', () => {
    expect(allocateDiscount(['500'], '50').map((s) => s.toString())).toEqual(['50']);
    expect(allocateDiscount([], '0')).toEqual([]);
  });

  it('reparto: subtotal 0 es inválido', () => {
    expect(() => allocateDiscount(['0', '0'], '10')).toThrow(RangeError);
  });

  it('la suma del reparto siempre da el descuento exacto, con montos incómodos', () => {
    const subtotals = ['1.01', '2.02', '3.03', '999.99', '0.07'];
    for (const discount of ['0.01', '1', '33.33', '500.5']) {
      const shares = allocateDiscount(subtotals, discount);
      const sum = shares.reduce((a, b) => a.plus(b), new Decimal(0));
      expect(sum.toFixed(2)).toBe(toDecimal(discount).toFixed(2));
    }
  });
});

describe('creditSurcharge: bordes', () => {
  it('recargo de $ 0,50 sube al peso', () => {
    // 5 % de 10 = 0,50 -> 1
    expect(creditSurcharge('10', '10', '0', '5').surchargeAmount.toString()).toBe('1');
    // 5 % de 9 = 0,45 -> 0
    expect(creditSurcharge('9', '9', '0', '5').surchargeAmount.toString()).toBe('0');
  });

  it('descuento negativo es inválido', () => {
    expect(() => creditSurcharge('100', '1000', '-1', '10')).toThrow(RangeError);
  });

  it('recargo 0 % no suma nada', () => {
    expect(creditSurcharge('8000', '8000', '0', '0').surchargeAmount.toString()).toBe('0');
  });

  it('base con centavos cuando hay descuento que no divide justo', () => {
    // 1000 x 3000 / 2999 = 1000,333...
    const r = creditSurcharge('1000', '3000', '1', '10');
    expect(r.surchargeBase.toFixed(2)).toBe('1000.33');
    expect(r.surchargeAmount.toString()).toBe('100');
  });
});

describe('formato es-AR: bordes', () => {
  it('lo cobrado redondea al peso y agrupa miles', () => {
    expect(formatMoney('0')).toBe('$ 0');
    expect(formatMoney('0.5')).toBe('$ 1');
    expect(formatMoney('999')).toBe('$ 999');
    expect(formatMoney('1000')).toBe('$ 1.000');
    expect(formatMoney('1234567890')).toBe('$ 1.234.567.890');
    expect(formatMoney('1746.50')).toBe('$ 1.747');
  });

  it('costos con centavos: siempre dos decimales y coma', () => {
    expect(formatMoneyWithCents('0')).toBe('$ 0,00');
    expect(formatMoneyWithCents('0.5')).toBe('$ 0,50');
    expect(formatMoneyWithCents('1000')).toBe('$ 1.000,00');
    expect(formatMoneyWithCents('1234567.891')).toBe('$ 1.234.567,89');
    expect(formatMoneyWithCents('0.005')).toBe('$ 0,01');
  });

  it('negativos', () => {
    expect(formatMoney('-1440')).toBe('-$ 1.440');
    expect(formatMoney('-0.5')).toBe('-$ 1');
    expect(formatMoneyWithCents('-1234.5')).toBe('-$ 1.234,50');
  });

  it('un importe negativo que redondea a cero no se muestra como "-$ 0"', () => {
    expect(formatMoney('-0.4')).toBe('$ 0');
    expect(formatMoneyWithCents('-0.004')).toBe('$ 0,00');
  });

  it('cantidades: por unidad sin decimales y por peso con tres', () => {
    expect(formatQuantity('1')).toBe('1');
    expect(formatQuantity('1000')).toBe('1.000');
    expect(formatQuantity('0.001', 'KG')).toBe('0,001 kg');
    expect(formatQuantity('1.5', 'KG')).toBe('1,500 kg');
    expect(formatQuantity('1234.5', 'KG')).toBe('1.234,500 kg');
    expect(formatQuantity('0', 'KG')).toBe('0,000 kg');
  });

  it('porcentajes', () => {
    expect(formatPercent('0')).toBe('0 %');
    expect(formatPercent('2.5')).toBe('2,5 %');
    expect(formatPercent('27')).toBe('27 %');
    expect(formatPercent('100')).toBe('100 %');
  });

  it('no usa espacios ni separadores de la configuración regional (mismo texto en cualquier equipo)', () => {
    expect(formatMoney('1234567')).not.toMatch(new RegExp('[\\u00a0\\u202f]'));
    expect(formatMoneyWithCents('1234567')).toBe('$ 1.234.567,00');
  });
});
