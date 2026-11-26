// Ejemplos numéricos del contrato (docs/api/compras.md, sección 9).
import { describe, expect, it } from 'vitest';
import { calculatePurchase, calculatePurchaseLine, netCostChangePercent } from './calculate';

const text = (v: { toFixed(n: number): string }, n = 2) => v.toFixed(n);

describe('calculatePurchase - ejemplo A (2 bultos x 12 a $10.000 neto, IVA 21 %)', () => {
  const calc = calculatePurchase({
    lines: [
      {
        quantityMode: 'PACK',
        packCount: '2',
        unitsPerPack: '12',
        packNetCost: '10000',
        vatRatePercent: '21',
      },
    ],
  });
  const line = calc.lines[0]!;

  it('24 unidades, costo neto $833,33 y costo final $1.008,33', () => {
    expect(text(line.quantity, 3)).toBe('24.000');
    expect(text(line.unitNetCost)).toBe('833.33');
    expect(text(line.unitCost)).toBe('1008.33');
  });

  it('el neto de la línea es 2 x 10.000 (exacto, no 24 x 833,33)', () => {
    expect(text(line.lineNetTotal)).toBe('20000.00');
    expect(text(line.lineTotal)).toBe('24200.00');
  });

  it('IVA $4.200 y total $24.200', () => {
    expect(text(calc.netTotal)).toBe('20000.00');
    expect(text(calc.vatTotal)).toBe('4200.00');
    expect(text(calc.total)).toBe('24200.00');
    expect(calc.vatBreakdown).toHaveLength(1);
    expect(text(calc.vatBreakdown[0]!.vatRatePercent)).toBe('21.00');
  });
});

describe('calculatePurchase - ejemplo B (IVA 0 %)', () => {
  it('10 unidades a $1.500 neto, IVA 0: costo final = neto, total $15.000', () => {
    const calc = calculatePurchase({
      lines: [{ quantityMode: 'UNIT', quantity: '10', unitNetCost: '1500', vatRatePercent: '0' }],
    });
    expect(text(calc.lines[0]!.unitCost)).toBe('1500.00');
    expect(text(calc.vatTotal)).toBe('0.00');
    expect(text(calc.total)).toBe('15000.00');
  });
});

describe('calculatePurchase - ejemplo C (dos alícuotas y otros cargos)', () => {
  const calc = calculatePurchase({
    lines: [
      {
        quantityMode: 'PACK',
        packCount: '2',
        unitsPerPack: '12',
        packNetCost: '10000',
        vatRatePercent: '21',
      },
      { quantityMode: 'UNIT', quantity: '10', unitNetCost: '1500', vatRatePercent: '0' },
    ],
    otherChargesAmount: '1100',
  });

  it('agrupa por alícuota, de la más alta a la más baja', () => {
    expect(calc.vatBreakdown.map((r) => text(r.vatRatePercent))).toEqual(['21.00', '0.00']);
    expect(calc.vatBreakdown.map((r) => text(r.netAmount))).toEqual(['20000.00', '15000.00']);
    expect(calc.vatBreakdown.map((r) => text(r.vatAmount))).toEqual(['4200.00', '0.00']);
  });

  it('total $40.300 y los otros cargos no tocan el costo', () => {
    expect(text(calc.netTotal)).toBe('35000.00');
    expect(text(calc.total)).toBe('40300.00');
    expect(text(calc.lines[0]!.unitCost)).toBe('1008.33');
    expect(text(calc.lines[1]!.unitCost)).toBe('1500.00');
  });
});

describe('calculatePurchase - ejemplo D (IVA por alícuota, no línea por línea)', () => {
  it('2 x $10,02 neto con IVA 21 % -> IVA $4,21 y total $24,25', () => {
    const calc = calculatePurchase({
      lines: [
        { quantityMode: 'UNIT', quantity: '1', unitNetCost: '10.02', vatRatePercent: '21' },
        { quantityMode: 'UNIT', quantity: '1', unitNetCost: '10.02', vatRatePercent: '21' },
      ],
    });
    expect(text(calc.vatTotal)).toBe('4.21');
    expect(text(calc.total)).toBe('24.25');
    expect(text(calc.lines[0]!.lineTotal)).toBe('12.12');
  });

  it('"21" y "21.00" son la misma alícuota', () => {
    const calc = calculatePurchase({
      lines: [
        { quantityMode: 'UNIT', quantity: '1', unitNetCost: '100', vatRatePercent: '21' },
        { quantityMode: 'UNIT', quantity: '1', unitNetCost: '100', vatRatePercent: '21.00' },
      ],
    });
    expect(calc.vatBreakdown).toHaveLength(1);
    expect(text(calc.vatTotal)).toBe('42.00');
  });
});

describe('calculatePurchase - ejemplo E (por peso)', () => {
  it('1,255 kg a $3.333,33 el kg neto, IVA 21 %', () => {
    const calc = calculatePurchase({
      lines: [
        { quantityMode: 'UNIT', quantity: '1.255', unitNetCost: '3333.33', vatRatePercent: '21' },
      ],
    });
    expect(text(calc.lines[0]!.lineNetTotal)).toBe('4183.33');
    expect(text(calc.lines[0]!.unitCost)).toBe('4033.33');
    expect(text(calc.vatTotal)).toBe('878.50');
    expect(text(calc.total)).toBe('5061.83');
  });
});

describe('calculatePurchaseLine - bordes', () => {
  it('costo 0 (bonificación) da total 0 y costo final 0', () => {
    const l = calculatePurchaseLine({
      quantityMode: 'UNIT',
      quantity: '12',
      unitNetCost: '0',
      vatRatePercent: '21',
    });
    expect(text(l.lineNetTotal)).toBe('0.00');
    expect(text(l.unitCost)).toBe('0.00');
  });

  it('el costo del bulto que no divide justo se redondea a centavos (mitad hacia arriba)', () => {
    // 10 / 8 = 1,25 exacto; 0,05 / 8 = 0,00625 -> 0,01
    const l = calculatePurchaseLine({
      quantityMode: 'PACK',
      packCount: '1',
      unitsPerPack: '8',
      packNetCost: '0.05',
      vatRatePercent: '0',
    });
    expect(text(l.unitNetCost)).toBe('0.01');
    expect(text(l.lineNetTotal)).toBe('0.05');
  });

  it('sin otros cargos, el total es neto + IVA', () => {
    const calc = calculatePurchase({
      lines: [{ quantityMode: 'UNIT', quantity: '3', unitNetCost: '100', vatRatePercent: '10.5' }],
      otherChargesAmount: null,
    });
    expect(text(calc.total)).toBe('331.50');
  });
});

describe('netCostChangePercent', () => {
  it('(833,33 - 780) / 780 = 6,84 %', () => {
    expect(netCostChangePercent('780', '833.33')?.toFixed(2)).toBe('6.84');
  });
  it('null si el anterior era 0', () => {
    expect(netCostChangePercent('0', '100')).toBeNull();
  });
  it('baja con signo', () => {
    expect(netCostChangePercent('100', '90')?.toFixed(2)).toBe('-10.00');
  });
});
