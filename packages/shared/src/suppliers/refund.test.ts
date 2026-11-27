import { describe, expect, it } from 'vitest';
import { checkSupplierRefund } from './refund';
import { CreateSupplierRefundRequestSchema } from './schemas';
import { CreateCashMovementRequestSchema, ManualCashMovementReasonSchema } from '../cash/schemas';

describe('checkSupplierRefund (proveedores.md 15.10)', () => {
  it.each([
    ['devuelve todo (ejemplo H)', '-15000.00', '15000.00', '15000.00', '0.00', false],
    ['devuelve una parte', '-15000.00', '10000.00', '15000.00', '-5000.00', false],
    ['devuelve de más', '-15000.00', '20000.00', '15000.00', '5000.00', true],
    ['saldo 0', '0.00', '100.00', '0.00', '100.00', true],
    ['con deuda', '25300.00', '15000.00', '0.00', '40300.00', true],
    ['centavos', '-0.01', '0.01', '0.01', '0.00', false],
  ])('%s', (_n, balance, amount, credit, balanceAfter, exceedsCredit) => {
    expect(checkSupplierRefund({ balance, amount })).toEqual({
      credit,
      balanceAfter,
      exceedsCredit,
    });
  });
});

describe('CreateSupplierRefundRequestSchema', () => {
  const base = {
    clientRequestId: '0c9e7a51-2b3d-4c8e-a6f1-7d2e9b4c1a03',
    amount: '15000',
    source: 'CASH_REGISTER',
  };
  it('acepta el ejemplo de 15.3', () => {
    expect(CreateSupplierRefundRequestSchema.safeParse(base).success).toBe(true);
  });
  it.each(['0', '-5', '1.234'])('rechaza amount %s', (amount) => {
    expect(CreateSupplierRefundRequestSchema.safeParse({ ...base, amount }).success).toBe(false);
  });
  it('rechaza amount como número de JSON', () => {
    expect(CreateSupplierRefundRequestSchema.safeParse({ ...base, amount: 15000 }).success).toBe(
      false,
    );
  });
  it('rechaza purchaseId y campos desconocidos', () => {
    expect(CreateSupplierRefundRequestSchema.safeParse({ ...base, purchaseId: 1 }).success).toBe(
      false,
    );
    expect(CreateSupplierRefundRequestSchema.safeParse({ ...base, type: 'PAYMENT' }).success).toBe(
      false,
    );
  });
  it('rechaza sin clientRequestId', () => {
    const { clientRequestId: _omit, ...rest } = base;
    expect(CreateSupplierRefundRequestSchema.safeParse(rest).success).toBe(false);
  });
});

describe('SUPPLIER_REFUND no se carga a mano', () => {
  it('lo rechazan los esquemas de movimientos manuales', () => {
    expect(ManualCashMovementReasonSchema.safeParse('SUPPLIER_REFUND').success).toBe(false);
    expect(
      CreateCashMovementRequestSchema.safeParse({
        direction: 'IN',
        reason: 'SUPPLIER_REFUND',
        amount: '100',
        description: 'x',
      }).success,
    ).toBe(false);
  });
});
