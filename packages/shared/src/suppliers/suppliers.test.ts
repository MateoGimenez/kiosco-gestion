import { describe, expect, it } from 'vitest';
import {
  buildSupplierOrderText,
  buildWhatsAppUrl,
  formatArPhone,
  isValidCuit,
  normalizeArPhone,
  suggestedOrderQuantity,
} from './phone';
import {
  CreateOpeningBalanceRequestSchema,
  CreateSupplierRequestSchema,
  UpdateSupplierRequestSchema,
} from './schemas';

describe('normalizeArPhone (proveedores.md 4)', () => {
  it.each([
    ['11 2345-6789', '1123456789'],
    ['+54 9 11 2345-6789', '1123456789'],
    ['+54 11 2345 6789', '1123456789'],
    ['0351 555-1234', '3515551234'],
    ['(011) 2345-6789', '1123456789'],
    ['0054 9 351 555-1234', '3515551234'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeArPhone(input)).toBe(expected);
  });

  it.each(['011 15 2345-6789', '2345-6789', 'abc', '11 2345-678x', ''])(
    '%s -> no sirve',
    (input) => {
      expect(normalizeArPhone(input)).toBeNull();
    },
  );

  it('se muestra con el código de área', () => {
    expect(formatArPhone('1123456789')).toBe('11 2345-6789');
    expect(formatArPhone('3515551234')).toBe('351 555-1234');
  });
});

describe('isValidCuit', () => {
  it('acepta el dígito verificador correcto, con o sin guiones', () => {
    expect(isValidCuit('20123456786')).toBe(true);
    expect(isValidCuit('20-12345678-6')).toBe(true);
  });
  it('rechaza el verificador incorrecto y formatos raros', () => {
    expect(isValidCuit('20123456785')).toBe(false);
    expect(isValidCuit('2012345678')).toBe(false);
    expect(isValidCuit('20-1234567-86')).toBe(false);
  });
});

describe('pedido sugerido (proveedores.md 11.2)', () => {
  it.each([
    ['3', '10', '7'],
    ['10', '10', '1'],
    ['-2', '10', '12'],
    ['0', '0', '1'],
    ['-3', '0', '3'],
    ['0.750', '2', '1.25'],
    ['2', '2', '1'],
  ])('stock %s mínimo %s -> %s', (stock, min, expected) => {
    expect(suggestedOrderQuantity(stock, min).toString()).toBe(expected);
  });
});

describe('texto y link de WhatsApp (11.3)', () => {
  const text = buildSupplierOrderText({
    storeName: 'Kiosco La Esquina',
    supplierName: 'Distribuidora Sur',
    lines: [
      { name: 'Coca-Cola 500 ml', saleUnit: 'UNIT', quantity: '7' },
      { name: 'Cero', saleUnit: 'UNIT', quantity: '0' },
      { name: 'Queso de máquina', saleUnit: 'KG', quantity: '1.250' },
      { name: 'Jamón', saleUnit: 'KG', quantity: '2.000' },
    ],
  });

  it('arma el texto y omite las líneas en 0', () => {
    expect(text).toBe(
      [
        'Hola, Distribuidora Sur. Pedido de Kiosco La Esquina:',
        '- 7 x Coca-Cola 500 ml',
        '- 1,25 kg x Queso de máquina',
        '- 2 kg x Jamón',
        'Gracias.',
      ].join('\n'),
    );
  });

  it('el link codifica el texto y es null sin teléfono', () => {
    expect(buildWhatsAppUrl('5491123456789', 'Hola, mundo\nok')).toBe(
      'https://wa.me/5491123456789?text=Hola%2C%20mundo%0Aok',
    );
    expect(buildWhatsAppUrl(null, 'x')).toBeNull();
  });
});

describe('esquemas de proveedores', () => {
  it('normaliza teléfono y CUIT, y ordena los días', () => {
    const r = CreateSupplierRequestSchema.safeParse({
      name: ' Distribuidora Sur ',
      phone: '+54 9 11 2345-6789',
      taxId: '20-12345678-6',
      visitDays: ['FRI', 'TUE'],
    });
    expect(r.success && r.data).toMatchObject({
      name: 'Distribuidora Sur',
      phone: '1123456789',
      taxId: '20123456786',
      visitDays: ['TUE', 'FRI'],
    });
  });

  it('teléfono con 15 -> error con el mensaje de "sin 15"', () => {
    const r = CreateSupplierRequestSchema.safeParse({ name: 'X', phone: '011 15 2345-6789' });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toContain('sin el 15');
  });

  it('CUIT con verificador malo -> 400; "" = sin CUIT', () => {
    expect(CreateSupplierRequestSchema.safeParse({ name: 'X', taxId: '20123456785' }).success).toBe(
      false,
    );
    const r = CreateSupplierRequestSchema.safeParse({ name: 'X', taxId: '', phone: '', email: '' });
    expect(r.success && [r.data.taxId, r.data.phone, r.data.email]).toEqual([null, null, null]);
  });

  it('días repetidos -> 400; el update necesita al menos un campo', () => {
    expect(
      CreateSupplierRequestSchema.safeParse({ name: 'X', visitDays: ['MON', 'MON'] }).success,
    ).toBe(false);
    expect(UpdateSupplierRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateSupplierRequestSchema.safeParse({ confirmDuplicateTaxId: true }).success).toBe(
      false,
    );
    expect(UpdateSupplierRequestSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('el saldo inicial puede ser negativo pero no 0 ni más de 9 enteros', () => {
    const ok = (amount: string) =>
      CreateOpeningBalanceRequestSchema.safeParse({ amount, entryDate: '2026-11-01' }).success;
    expect(ok('-1500')).toBe(true);
    expect(ok('1500.50')).toBe(true);
    expect(ok('0')).toBe(false);
    expect(ok('0.00')).toBe(false);
    expect(ok('1000000000')).toBe(false);
  });
});
