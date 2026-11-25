// Plan etapa 2, "Tests de QA" (unitarios): precio sugerido con IVA 21 %, 10,5 % y 0 %, y el
// redondeo hacia arriba a $10. Fórmula (H-15): costo neto × (1 + margen) × (1 + IVA), redondeado
// hacia arriba al paso configurado.
import { describe, expect, it } from 'vitest';
import { Decimal } from '../decimal';
import { realMargin, roundPriceUp, suggestedPrice } from './index';

describe('precio sugerido según el IVA (costo neto $1.000)', () => {
  it.each([
    // [margen %, IVA %, sin redondear, sugerido]
    ['40', '21', '1694', '1700'],
    ['40', '10.5', '1547', '1550'],
    ['40', '0', '1400', '1400'],
    ['50', '21', '1815', '1820'], // ejemplo del "Cómo probarlo", paso 3
    ['50', '10.5', '1657.5', '1660'],
    ['50', '0', '1500', '1500'],
  ])('margen %s %% e IVA %s %%: %s -> %s', (margin, vat, raw, expected) => {
    expect(
      new Decimal('1000')
        .mul(new Decimal(1).add(new Decimal(margin).div(100)))
        .mul(new Decimal(1).add(new Decimal(vat).div(100)))
        .toString(),
    ).toBe(raw);
    expect(suggestedPrice('1000', margin, vat, '10').toString()).toBe(expected);
  });

  it('IVA 10,5 % acepta "10.5" y "10.50" (así llega del formulario y de la base)', () => {
    expect(suggestedPrice('1000', '40', '10.50', '10').toString()).toBe('1550');
    expect(suggestedPrice('1000', '40', '10.5', '10').toString()).toBe('1550');
  });

  it('un resultado que ya es múltiplo de $10 no sube', () => {
    expect(suggestedPrice('2000', '50', '21', '10').toString()).toBe('3630');
    expect(suggestedPrice('1000', '0', '21', '10').toString()).toBe('1210');
  });

  it('un centavo de más sube al siguiente múltiplo', () => {
    // 1000,01 × 1,21 = 1210,0121 -> 1220
    expect(suggestedPrice('1000.01', '0', '21', '10').toString()).toBe('1220');
  });

  it('con costo con centavos, el sugerido siempre queda en un múltiplo de $10', () => {
    for (const net of ['333.33', '17.5', '99.99', '1234.56']) {
      for (const vat of ['21', '10.5', '0']) {
        const price = suggestedPrice(net, '35', vat, '10');
        expect(price.mod(10).isZero(), `${net} con IVA ${vat}`).toBe(true);
      }
    }
  });

  it('el sugerido nunca queda por debajo del cálculo sin redondear', () => {
    const raw = new Decimal('1000').mul('1.4').mul('1.105');
    expect(suggestedPrice('1000', '40', '10.5', '10').gte(raw)).toBe(true);
  });

  it('el margen real del precio redondeado es un poco mayor que el margen pedido', () => {
    expect(realMargin('1700', '1000', '21')?.toFixed(2)).toBe('40.50');
    expect(realMargin('1550', '1000', '10.5')?.toFixed(2)).toBe('40.27');
    expect(realMargin('1400', '1000', '0')?.toFixed(2)).toBe('40.00');
  });
});

describe('redondeo hacia arriba (PRE-03)', () => {
  it('$1.432 -> $1.440 y $1.440 -> $1.440', () => {
    expect(roundPriceUp('1432', '10').toString()).toBe('1440');
    expect(roundPriceUp('1440', '10').toString()).toBe('1440');
    expect(roundPriceUp(new Decimal('1432'), '10').toString()).toBe('1440');
  });

  it('$1.431,99 -> $1.440 y $1.440,01 -> $1.450', () => {
    expect(roundPriceUp('1431.99', '10').toString()).toBe('1440');
    expect(roundPriceUp('1440.01', '10').toString()).toBe('1450');
  });

  it('otros pasos de la configuración: $5, $50 y $100', () => {
    expect(roundPriceUp('1432', '5').toString()).toBe('1435');
    expect(roundPriceUp('1432', '50').toString()).toBe('1450');
    expect(roundPriceUp('1432', '100').toString()).toBe('1500');
  });

  it('un precio en 0 queda en 0', () => {
    expect(roundPriceUp('0', '10').toString()).toBe('0');
  });
});
