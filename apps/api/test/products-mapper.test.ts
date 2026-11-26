// Unitarios de las respuestas por rol y de las ayudas de texto (sin base de datos).
import { describe, expect, it } from 'vitest';
import { escapeLike, isNumericOverflow, isUniqueViolation } from '../src/lib/db';
import {
  computePricing,
  toProductPricing,
  toProductResponse,
  toProductSaleItem,
  type ProductRow,
} from '../src/modules/products/products.mapper';
import { cutoffToMinutes, minutesToCutoff } from '../src/modules/settings/settings.service';
import { COST_KEYS, findKeys } from './catalog-helpers';

function row(
  over: Record<string, unknown> = {},
  sub: Record<string, unknown> = {},
  category: Record<string, unknown> = {},
): ProductRow {
  return {
    id: 1,
    name: 'Chocolate',
    barcode: '779',
    saleUnit: 'UNIT',
    subcategoryId: 2,
    netCostPrice: '1000',
    costPrice: '1210',
    vatRatePercent: '21',
    marginPercent: null,
    salePrice: '1820',
    stockQuantity: '3',
    minStock: '5',
    unitsPerPack: null,
    isMiscellaneous: false,
    isActive: true,
    createdAt: new Date('2026-11-25T10:00:00Z'),
    updatedAt: new Date('2026-11-25T10:00:00Z'),
    // Campos que NUNCA tienen que salir:
    secretInternalField: 'no-deberia-salir',
    subcategory: {
      id: 2,
      name: 'Chocolates',
      marginPercent: '50',
      category: { id: 1, name: 'Golosinas', marginPercent: '40', ...category },
      ...sub,
    },
    ...over,
  } as unknown as ProductRow;
}

describe('cadena de margen y precio sugerido en el servicio', () => {
  it('producto > subcategoría > categoría', () => {
    expect(computePricing(row({ marginPercent: '100' }), '10').margin).toMatchObject({
      source: 'PRODUCT',
    });
    expect(computePricing(row(), '10').margin.source).toBe('SUBCATEGORY');
    expect(computePricing(row({}, { marginPercent: null }), '10').margin.source).toBe('CATEGORY');
  });

  it('un margen propio de 0 no hereda', () => {
    const { margin, suggested } = computePricing(row({ marginPercent: '0' }), '10');
    expect(margin).toMatchObject({ source: 'PRODUCT' });
    expect(suggested?.toFixed(2)).toBe('1210.00');
  });

  it('"Varios" y costo 0 no tienen sugerido ni margen real', () => {
    expect(computePricing(row({ netCostPrice: '0' }), '10')).toMatchObject({
      suggested: null,
      real: null,
    });
    expect(computePricing(row({ isMiscellaneous: true }), '10')).toMatchObject({
      suggested: null,
      real: null,
    });
  });

  it('IVA 21, 10,5 y 0 con redondeo a $10 hacia arriba', () => {
    const at = (vat: string, subMargin: string | null) =>
      computePricing(
        row({ vatRatePercent: vat }, { marginPercent: subMargin }),
        '10',
      ).suggested?.toFixed(2);
    expect(at('21', null)).toBe('1700.00'); // 1000 x 1,4 x 1,21 = 1694
    expect(at('10.5', null)).toBe('1550.00'); // 1547
    expect(at('0', null)).toBe('1400.00'); // ya es múltiplo
  });
});

describe('respuestas por rol: el esquema descarta lo que sobra (red de seguridad, 2.3)', () => {
  it('empleado y encargado (catálogo): ni una clave de costo, aunque el objeto la tenga', () => {
    for (const role of ['EMPLOYEE', 'MANAGER'] as const) {
      const out = toProductResponse(row(), role, 'catalog', '10.00');
      expect(findKeys(out, COST_KEYS), role).toEqual([]);
      expect(out).not.toHaveProperty('secretInternalField');
      expect(out).toMatchObject({
        salePrice: '1820.00',
        stockQuantity: '3.000',
        needsRestock: true,
      });
    }
  });

  it('dueño (catálogo) y encargado/dueño (precios): con costo', () => {
    expect(toProductResponse(row(), 'OWNER', 'catalog', '10.00')).toMatchObject({
      netCostPrice: '1000.00',
      suggestedPrice: '1820.00',
    });
    expect(toProductResponse(row(), 'MANAGER', 'pricing', '10.00')).toMatchObject({
      costPrice: '1210.00',
      realMarginPercent: '50.41',
    });
  });

  it('el empleado nunca arma una respuesta de precios', () => {
    expect(() => toProductResponse(row(), 'EMPLOYEE', 'pricing', '10.00')).toThrow();
  });

  it('el mostrador nunca trae costo, ni siquiera con un objeto completo', () => {
    const out = toProductSaleItem(row());
    expect(Object.keys(out).sort()).toEqual([
      'barcode',
      'id',
      'isMiscellaneous',
      'name',
      'salePrice',
      'saleUnit',
      'stockQuantity',
    ]);
  });

  it('needsRestock: stock <= mínimo, salvo "Varios"', () => {
    const nr = (over: Record<string, unknown>) =>
      (toProductResponse(row(over), 'EMPLOYEE', 'catalog', '10') as { needsRestock: boolean })
        .needsRestock;
    expect(nr({ stockQuantity: '5', minStock: '5' })).toBe(true);
    expect(nr({ stockQuantity: '6', minStock: '5' })).toBe(false);
    expect(nr({ stockQuantity: '0', minStock: '0' })).toBe(true); // H-30
    expect(nr({ stockQuantity: '-1', minStock: '0' })).toBe(true);
    expect(nr({ isMiscellaneous: true, stockQuantity: '0', minStock: '0' })).toBe(false);
  });

  it('pantalla de precios: margen real de un precio puesto a mano (paso 4: $1.900 -> 57,02 %)', () => {
    const out = toProductPricing(row({ salePrice: '1900' }), '10.00');
    expect(out).toMatchObject({
      realMarginPercent: '57.02',
      matchesSuggestedPrice: false,
      categoryMarginPercent: '40.00',
    });
  });

  it('un stock negativo sale con signo y 3 decimales', () => {
    expect(
      toProductResponse(row({ stockQuantity: '-2' }), 'EMPLOYEE', 'catalog', '10'),
    ).toMatchObject({ stockQuantity: '-2.000' });
  });
});

describe('ayudas', () => {
  it('escapeLike escapa %, _ y la barra', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\');
    expect(escapeLike('normal')).toBe('normal');
  });

  it('hora de corte: minutos <-> "HH:MM"', () => {
    expect(minutesToCutoff(360)).toBe('06:00');
    expect(minutesToCutoff(0)).toBe('00:00');
    expect(minutesToCutoff(1439)).toBe('23:59');
    expect(cutoffToMinutes('05:30')).toBe(330);
    expect(cutoffToMinutes('00:00')).toBe(0);
  });

  it('reconoce los errores de la base por su forma', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint' })).toBe(
      true,
    );
    expect(isUniqueViolation(new Error('otra cosa'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isNumericOverflow({ code: '22003' })).toBe(true);
    // Por el texto NO: otros errores con "out of range" siguen siendo 500.
    expect(isNumericOverflow({ message: 'numeric field overflow' })).toBe(false);
    expect(isNumericOverflow(new Error('timestamp out of range'))).toBe(false);
    expect(
      isNumericOverflow({ code: '22008', message: 'date/time field value out of range' }),
    ).toBe(false);
    expect(
      isNumericOverflow({ meta: { driverAdapterError: { cause: { originalCode: '22003' } } } }),
    ).toBe(true);
    expect(isNumericOverflow(new Error('x'))).toBe(false);
  });
});
