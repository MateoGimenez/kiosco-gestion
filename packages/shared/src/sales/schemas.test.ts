// Tests de los esquemas Zod de ventas y caja (docs/api/ventas.md sección 4, caja.md sección 2).
import { describe, expect, it } from 'vitest';
import {
  CreateSaleRequestSchema,
  UpdatePaymentMethodRequestSchema,
  VoidSaleRequestSchema,
} from './schemas';
import { OpenCashSessionRequestSchema } from '../cash/schemas';

const ID = '0b9f7c1e-2a44-4f0e-8d51-6c3a9e7b1f20';
const base = {
  clientRequestId: ID,
  items: [{ productId: 31, quantity: '1' }],
  payments: [{ paymentMethodId: 3, amount: '9000' }],
  expectedTotal: '10000',
};

describe('CreateSaleRequestSchema', () => {
  it('acepta el ejemplo 1 del contrato', () => {
    const r = CreateSaleRequestSchema.safeParse({
      ...base,
      items: [
        { productId: 31, quantity: '1' },
        { productId: 44, quantity: '1' },
      ],
      discount: { type: 'PERCENT', value: '10' },
    });
    expect(r.success).toBe(true);
  });
  it('rechaza campos que no existen (precio, costo, total, recargo)', () => {
    for (const extra of [{ total: '1' }, { surchargeAmount: '1' }, { subtotal: '1' }]) {
      expect(CreateSaleRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
    expect(
      CreateSaleRequestSchema.safeParse({
        ...base,
        items: [{ productId: 31, quantity: '1', unitCost: '5' }],
      }).success,
    ).toBe(false);
    expect(
      CreateSaleRequestSchema.safeParse({
        ...base,
        payments: [{ paymentMethodId: 3, amount: '9000', chargedAmount: '9900' }],
      }).success,
    ).toBe(false);
  });
  it('importes en número de JSON, con centavos en pagos o cero -> 400', () => {
    expect(CreateSaleRequestSchema.safeParse({ ...base, expectedTotal: 10000 }).success).toBe(
      false,
    );
    expect(
      CreateSaleRequestSchema.safeParse({
        ...base,
        payments: [{ paymentMethodId: 1, amount: '4500.50' }],
      }).success,
    ).toBe(false);
    expect(
      CreateSaleRequestSchema.safeParse({
        ...base,
        payments: [{ paymentMethodId: 1, amount: '0' }],
      }).success,
    ).toBe(false);
    expect(
      CreateSaleRequestSchema.safeParse({ ...base, items: [{ productId: 1, quantity: '0' }] })
        .success,
    ).toBe(false);
    expect(
      CreateSaleRequestSchema.safeParse({
        ...base,
        payments: [{ paymentMethodId: 1, amount: '4500.00' }],
      }).success,
    ).toBe(true);
  });
  it('límites técnicos: 1 a 200 líneas y 1 a 10 pagos (H-43)', () => {
    const lines = (n: number) => Array.from({ length: n }, () => ({ productId: 1, quantity: '1' }));
    const pays = (n: number) =>
      Array.from({ length: n }, () => ({ paymentMethodId: 1, amount: '1' }));
    expect(CreateSaleRequestSchema.safeParse({ ...base, items: lines(200) }).success).toBe(true);
    expect(CreateSaleRequestSchema.safeParse({ ...base, items: lines(201) }).success).toBe(false);
    expect(CreateSaleRequestSchema.safeParse({ ...base, items: [] }).success).toBe(false);
    expect(CreateSaleRequestSchema.safeParse({ ...base, payments: pays(10) }).success).toBe(true);
    expect(CreateSaleRequestSchema.safeParse({ ...base, payments: pays(11) }).success).toBe(false);
  });
  it('el identificador tiene que ser un UUID y se guarda en minúsculas', () => {
    expect(CreateSaleRequestSchema.safeParse({ ...base, clientRequestId: 'hola' }).success).toBe(
      false,
    );
    const r = CreateSaleRequestSchema.parse({ ...base, clientRequestId: ID.toUpperCase() });
    expect(r.clientRequestId).toBe(ID);
  });
  it('descuento: motivo con trim, "" = sin motivo, 0 y % de más de 2 decimales no valen', () => {
    const r = CreateSaleRequestSchema.parse({
      ...base,
      discount: { type: 'AMOUNT', value: '1000', reason: '  Cliente habitual ' },
    });
    expect(r.discount?.reason).toBe('Cliente habitual');
    const empty = CreateSaleRequestSchema.parse({
      ...base,
      discount: { type: 'AMOUNT', value: '1000', reason: '  ' },
    });
    expect(empty.discount?.reason).toBeNull();
    expect(
      CreateSaleRequestSchema.safeParse({ ...base, discount: { type: 'PERCENT', value: '0' } })
        .success,
    ).toBe(false);
    expect(
      CreateSaleRequestSchema.safeParse({ ...base, discount: { type: 'PERCENT', value: '10.555' } })
        .success,
    ).toBe(false);
  });
});

describe('otros esquemas', () => {
  it('anular pide un motivo', () => {
    expect(VoidSaleRequestSchema.safeParse({ reason: '  ' }).success).toBe(false);
    expect(VoidSaleRequestSchema.safeParse({ reason: 'Error' }).success).toBe(true);
    expect(VoidSaleRequestSchema.safeParse({ reason: 'x'.repeat(201) }).success).toBe(false);
  });
  it('abrir caja: turno válido y efectivo inicial >= 0 como texto', () => {
    expect(
      OpenCashSessionRequestSchema.safeParse({ shift: 'MORNING', openingCash: '0' }).success,
    ).toBe(true);
    expect(
      OpenCashSessionRequestSchema.safeParse({ shift: 'MORNING', openingCash: 5000 }).success,
    ).toBe(false);
    expect(
      OpenCashSessionRequestSchema.safeParse({ shift: 'MORNING', openingCash: '-1' }).success,
    ).toBe(false);
    expect(
      OpenCashSessionRequestSchema.safeParse({ shift: 'LUNCH', openingCash: '1' }).success,
    ).toBe(false);
  });
  it('medio de pago: al menos un campo y el recargo entre 0 y 100', () => {
    expect(UpdatePaymentMethodRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdatePaymentMethodRequestSchema.safeParse({ surchargePercent: '100.01' }).success).toBe(
      false,
    );
    expect(UpdatePaymentMethodRequestSchema.safeParse({ surchargePercent: '12.5' }).success).toBe(
      true,
    );
    expect(UpdatePaymentMethodRequestSchema.safeParse({ sortOrder: 1000 }).success).toBe(false);
  });
});
