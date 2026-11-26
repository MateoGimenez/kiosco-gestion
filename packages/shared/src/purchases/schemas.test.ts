import { describe, expect, it } from 'vitest';
import { CreatePurchaseRequestSchema } from './schemas';

const base = {
  clientRequestId: 'b3e2f0a4-5d6c-4e8f-9a1b-2c3d4e5f6a7b',
  supplierId: 3,
  documentType: 'INVOICE',
  documentDate: '2026-11-27',
  items: [
    {
      productId: 12,
      quantityMode: 'PACK',
      packCount: '2',
      unitsPerPack: '12',
      packNetCost: '10000',
      vatRatePercent: '21',
    },
  ],
};
const ok = (v: unknown) => CreatePurchaseRequestSchema.safeParse(v).success;

describe('CreatePurchaseRequestSchema', () => {
  it('acepta el ejemplo del contrato', () => {
    expect(ok(base)).toBe(true);
    expect(ok({ ...base, documentNumber: '0003-00012345', payNow: null, otherChargesAmount: '0' })).toBe(true);
  });

  it('rechaza campos de otra modalidad y los que calcula el servidor', () => {
    const line = base.items[0]!;
    expect(ok({ ...base, items: [{ ...line, quantity: '24' }] })).toBe(false);
    expect(ok({ ...base, items: [{ ...line, unitCost: '1' }] })).toBe(false);
    expect(
      ok({
        ...base,
        items: [{ productId: 1, quantityMode: 'UNIT', quantity: '1', unitNetCost: '1', vatRatePercent: '21', packCount: '1' }],
      }),
    ).toBe(false);
    expect(ok({ ...base, total: '1' })).toBe(false);
  });

  it('los bultos son enteros >= 1', () => {
    const line = base.items[0]!;
    for (const packCount of ['0', '1.5', '-1', '1000000', '']) {
      expect(ok({ ...base, items: [{ ...line, packCount }] }), packCount).toBe(false);
    }
  });

  it('el dinero no viaja como número y el IVA tiene que ser una alícuota válida', () => {
    const line = base.items[0]!;
    expect(ok({ ...base, items: [{ ...line, packNetCost: 10000 }] })).toBe(false);
    expect(ok({ ...base, items: [{ ...line, vatRatePercent: '20' }] })).toBe(false);
  });

  it('1 a 200 líneas', () => {
    expect(ok({ ...base, items: [] })).toBe(false);
    expect(ok({ ...base, items: Array.from({ length: 201 }, () => base.items[0]) })).toBe(false);
  });

  it('el número de comprobante vacío es "sin número"', () => {
    const r = CreatePurchaseRequestSchema.safeParse({ ...base, documentNumber: '  ' });
    expect(r.success && r.data.documentNumber).toBeNull();
  });
});
