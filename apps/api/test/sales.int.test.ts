// Etapa 3: cobrar una venta (docs/api/ventas.md, secciones 6 y 10): los 6 ejemplos, todas las reglas,
// reintentos (clientRequestId) y carreras.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { COST_KEYS, findKeys, seedProduct } from './catalog-helpers';
import {
  closeCashInDb,
  example1,
  example2,
  openCash,
  saleBody,
  setupSalesWorld,
  stockOf,
  type SalesWorld,
} from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
  await openCash(w);
});
afterAll(() => prisma.$disconnect());

const post = (body: unknown, cookie = w.employee) => w.client.post('/api/sales', body, cookie);
/** Nada quedó guardado (ni venta ni movimientos ni auditoría de la venta). */
async function expectNothingSaved() {
  expect(await prisma.sale.count()).toBe(0);
  expect(await prisma.stockMovement.count()).toBe(0);
  expect(await prisma.auditLog.count({ where: { action: 'DISCOUNT_APPLIED' } })).toBe(0);
}
const SECRET_KEYS = [...COST_KEYS, 'unitCost', 'lineProfit', 'grossProfit', 'requestHash'];
const creditSurchargeOf = (body: {
  sale: { payments: { paymentMethod: { kind: string }; surchargeAmount: string }[] };
}) => body.sale.payments.find((p) => p.paymentMethod.kind === 'CREDIT_CARD')?.surchargeAmount;

describe('los 6 ejemplos del contrato (ventas.md 10)', () => {
  it('ejemplo 1: encargado, 10 % de descuento, todo con crédito -> $10.000', async () => {
    const res = await post(example1(w), w.manager);
    expect(res.status).toBe(201);
    const { sale } = res.body;
    expect(sale).toMatchObject({
      status: 'COMPLETED',
      subtotal: '10000.00',
      discountAmount: '1000.00',
      discountPercent: '10.00',
      discountReason: null,
      amountDue: '9000.00',
      surchargeAmount: '1000.00',
      total: '10000.00',
      user: { id: w.managerId },
    });
    expect(sale.items.map((i: { discountAmount: string }) => i.discountAmount)).toEqual([
      '600.00',
      '400.00',
    ]);
    expect(sale.items.map((i: { lineNetTotal: string }) => i.lineNetTotal)).toEqual([
      '4462.81',
      '2975.21',
    ]);
    expect(sale.payments[0]).toMatchObject({
      amount: '9000.00',
      surchargeBase: '10000.00',
      surchargePercent: '10.00',
      surchargeAmount: '1000.00',
      chargedAmount: '10000.00',
    });
    expect(res.body).toMatchObject({ isReplay: false, change: null, stockWarnings: [] });
    // Stock, movimiento y auditoría.
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
    expect(await stockOf(prisma, w.b.id)).toBe('9.000');
    const audit = await prisma.auditLog.findMany({ where: { action: 'DISCOUNT_APPLIED' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      userId: w.managerId,
      entityType: 'Sale',
      entityId: String(sale.id),
      channel: 'LOCAL',
    });
    expect(audit[0]?.details).toEqual({
      subtotal: '10000.00',
      discountType: 'PERCENT',
      discountValue: '10.00',
      discountAmount: '1000.00',
      reason: null,
    });
    // Ganancia (solo dueño): 962,81 + 975,21 = 1.938,02.
    const owner = await w.client.get(`/api/sales/${sale.id}`, w.owner);
    expect(owner.body.grossProfit).toBe('1938.02');
    expect(owner.body.items.map((i: { lineProfit: string }) => i.lineProfit)).toEqual([
      '962.81',
      '975.21',
    ]);
    expect(owner.body.items[0]).toMatchObject({ unitNetCost: '3500.00', unitCost: '4235.00' });
  });

  it('ejemplo 2: mixto $9.500, $5.000 en el posnet, vuelto $500', async () => {
    const res = await post(example2(w), w.manager);
    expect(res.status).toBe(201);
    const { sale } = res.body;
    expect(sale).toMatchObject({
      subtotal: '10000.00',
      discountAmount: '1000.00',
      discountPercent: null,
      discountReason: 'Cliente habitual',
      amountDue: '9000.00',
      surchargeAmount: '500.00',
      total: '9500.00',
    });
    expect(sale.payments.map((p: { chargedAmount: string }) => p.chargedAmount)).toEqual([
      '4500.00',
      '5000.00',
    ]);
    expect(sale.payments.map((p: { surchargeBase: string }) => p.surchargeBase)).toEqual([
      '5000.00',
      '5000.00',
    ]);
    expect(res.body.change).toBe('500.00');
    expect(sale.voidRefund).toBeNull();
  });

  it('ejemplo 3: sin descuento, todo con crédito -> $8.800', async () => {
    const p5 = await seedProduct(prisma, (await prisma.subcategory.findFirstOrThrow()).id, {
      name: 'P5000',
      salePrice: '5000',
      netCostPrice: '1000',
      costPrice: '1210',
    });
    const p3 = await seedProduct(prisma, (await prisma.subcategory.findFirstOrThrow()).id, {
      name: 'P3000',
      salePrice: '3000',
      netCostPrice: '1000',
      costPrice: '1210',
    });
    const res = await post(
      saleBody({
        items: [
          { productId: p5.id, quantity: '1' },
          { productId: p3.id, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '8000' }],
        expectedTotal: '8800',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.sale).toMatchObject({
      subtotal: '8000.00',
      surchargeAmount: '800.00',
      total: '8800.00',
    });
    expect(res.body.sale.payments[0]).toMatchObject({
      surchargeBase: '8000.00',
      chargedAmount: '8800.00',
    });
    expect(res.body.sale.items.map((i: { lineNetTotal: string }) => i.lineNetTotal)).toEqual([
      '4132.23',
      '2479.34',
    ]);
  });

  it('ejemplo 4: empleado, queso 0,350 kg + Coca (stock 1) en efectivo con vuelto y aviso de stock', async () => {
    const res = await post(
      saleBody({
        items: [
          { productId: w.cheese.id, quantity: '0.350' },
          { productId: w.coke.id, quantity: '2' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '4647' }],
        cashTendered: '5000',
        expectedTotal: '4647',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.sale.items.map((i: { lineSubtotal: string }) => i.lineSubtotal)).toEqual([
      '1747.00',
      '2900.00',
    ]);
    expect(res.body.sale.items.map((i: { lineNetTotal: string }) => i.lineNetTotal)).toEqual([
      '1443.80',
      '2396.69',
    ]);
    expect(res.body.sale.total).toBe('4647.00');
    expect(res.body.change).toBe('353.00');
    expect(res.body.stockWarnings).toEqual([
      {
        productId: w.coke.id,
        productName: 'Coca-Cola 500 ml',
        saleUnit: 'UNIT',
        stockAfter: '-1.000',
      },
    ]);
    expect(await stockOf(prisma, w.cheese.id)).toBe('4.650');
    expect(await stockOf(prisma, w.coke.id)).toBe('-1.000');
  });

  it('ejemplo 4 (bis): "2.5" de una Coca (producto por unidad) -> 400 con path items.1.quantity', async () => {
    const res = await post(
      saleBody({
        items: [
          { productId: w.cheese.id, quantity: '0.350' },
          { productId: w.coke.id, quantity: '2.5' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '4647' }],
        expectedTotal: '4647',
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields[0].path).toBe('items.1.quantity');
    await expectNothingSaved();
  });

  it('ejemplo 5: "Varios" $700 + alfajor, mitad efectivo y mitad crédito -> $2.006; "Varios" sin stock ni costo', async () => {
    const res = await post(
      saleBody({
        items: [
          { productId: w.misc.id, quantity: '1', unitPrice: '700', customDescription: 'Pila AA' },
          { productId: w.alfajor.id, quantity: '1' },
        ],
        payments: [
          { paymentMethodId: w.pm.CASH, amount: '955' },
          { paymentMethodId: w.pm.CREDIT_CARD, amount: '955' },
        ],
        cashTendered: '1000',
        expectedTotal: '2006',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.sale).toMatchObject({
      subtotal: '1910.00',
      surchargeAmount: '96.00',
      total: '2006.00',
    });
    expect(res.body.change).toBe('45.00');
    expect(res.body.sale.payments[1].chargedAmount).toBe('1051.00');
    expect(res.body.sale.items[0]).toMatchObject({
      isMiscellaneous: true,
      customDescription: 'Pila AA',
      unitPrice: '700.00',
      lineNetTotal: '578.51',
    });
    // "Varios" no mueve stock ni genera StockMovement; el alfajor sí.
    expect(await stockOf(prisma, w.misc.id)).toBe('0.000');
    const movements = await prisma.stockMovement.findMany();
    expect(movements.map((m) => m.productId)).toEqual([w.alfajor.id]);
    // Dueño: "Varios" con costo 0 y ganancia null; alfajor 300; total 300 sin recargo.
    const owner = (await w.client.get(`/api/sales/${res.body.sale.id}`, w.owner)).body;
    expect(owner.items[0]).toMatchObject({
      unitNetCost: '0.00',
      lineNetTotal: '578.51',
      lineProfit: null,
    });
    expect(owner.items[1]).toMatchObject({ lineNetTotal: '1000.00', lineProfit: '300.00' });
    expect(owner.grossProfit).toBe('300.00');
    // Encargado: la misma venta sin costos.
    const manager = (await w.client.get(`/api/sales/${res.body.sale.id}`, w.manager)).body;
    expect(findKeys(manager, SECRET_KEYS)).toEqual([]);
    expect(manager.total).toBe('2006.00');
  });

  it('ejemplo 5 (bis): unitPrice en el alfajor -> 422 LINE_FIELD_NOT_ALLOWED; "Varios" sin precio -> 422 MISC_PRICE_REQUIRED', async () => {
    const forged = await post(
      saleBody({
        items: [{ productId: w.alfajor.id, quantity: '1', unitPrice: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
    );
    expect(forged.status).toBe(422);
    expect(forged.body.error.code).toBe('LINE_FIELD_NOT_ALLOWED');
    expect(forged.body.error.details.fields[0].path).toBe('items.0.unitPrice');
    const noPrice = await post(
      saleBody({
        items: [{ productId: w.misc.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
    );
    expect(noPrice.status).toBe(422);
    expect(noPrice.body.error.code).toBe('MISC_PRICE_REQUIRED');
    await expectNothingSaved();
  });

  it('ejemplo 6: reparto del descuento con centavo sobrante (D6), IVA 10,5 % en la del medio', async () => {
    const sub = (await prisma.subcategory.findFirstOrThrow()).id;
    const l1 = await seedProduct(prisma, sub, {
      name: 'L1',
      salePrice: '1000',
      vatRatePercent: '21',
    });
    const l2 = await seedProduct(prisma, sub, {
      name: 'L2',
      salePrice: '1000',
      vatRatePercent: '10.5',
    });
    const l3 = await seedProduct(prisma, sub, {
      name: 'L3',
      salePrice: '1000',
      vatRatePercent: '21',
    });
    const res = await post(
      saleBody({
        items: [l1, l2, l3].map((p) => ({ productId: p.id, quantity: '1' })),
        discount: { type: 'AMOUNT', value: '1000' },
        payments: [{ paymentMethodId: w.pm.DEBIT_CARD, amount: '2000' }],
        expectedTotal: '2000',
      }),
      w.owner,
    );
    expect(res.status).toBe(201);
    const items = res.body.sale.items as {
      discountAmount: string;
      lineTotal: string;
      lineNetTotal: string;
    }[];
    expect(items.map((i) => i.discountAmount)).toEqual(['333.33', '333.33', '333.34']);
    expect(items.map((i) => i.lineTotal)).toEqual(['666.67', '666.67', '666.66']);
    expect(items.map((i) => i.lineNetTotal)).toEqual(['550.97', '603.32', '550.96']);
    expect(res.body.sale.payments[0]).toMatchObject({
      surchargeBase: '3000.00',
      surchargeAmount: '0.00',
    });
    expect(res.body.sale.total).toBe('2000.00');
  });
});

describe('precios, totales y recargos que manda la pantalla no se usan', () => {
  it('campos de dinero que no existen en el pedido -> 400 y no se guarda nada', async () => {
    const base = saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      expectedTotal: '6000',
    });
    const forgeries = [
      { ...base, total: '1' },
      { ...base, subtotal: '1' },
      { ...base, surchargeAmount: '0' },
      { ...base, items: [{ productId: w.a.id, quantity: '1', unitCost: '0' }] },
      { ...base, items: [{ productId: w.a.id, quantity: '1', lineSubtotal: '1' }] },
      { ...base, payments: [{ paymentMethodId: w.pm.CASH, amount: '6000', chargedAmount: '1' }] },
      {
        ...base,
        payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '6000', surchargePercent: '0' }],
      },
    ];
    for (const body of forgeries) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    await expectNothingSaved();
  });

  it('un expectedTotal falso (más bajo) -> 409 SALE_TOTAL_CHANGED con el desglose; no se guarda nada', async () => {
    const res = await post(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '6000' }],
        expectedTotal: '6000', // el recargo del crédito lo deja en 6.600
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SALE_TOTAL_CHANGED');
    expect(res.body.error.details).toMatchObject({
      expectedTotal: '6000.00',
      total: '6600.00',
      subtotal: '6000.00',
      discountAmount: '0.00',
      items: [{ index: 0, productId: w.a.id, unitPrice: '6000.00', lineSubtotal: '6000.00' }],
      payments: [
        {
          index: 0,
          paymentMethodId: w.pm.CREDIT_CARD,
          surchargePercent: '10.00',
          surchargeAmount: '600.00',
          chargedAmount: '6600.00',
        },
      ],
    });
    await expectNothingSaved();
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
  });

  it('H-33: si cambió el precio con el carrito armado -> 409; con el total nuevo cobra', async () => {
    const body = saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      expectedTotal: '6000',
    });
    await prisma.product.update({ where: { id: w.a.id }, data: { salePrice: '6500' } });
    const stale = await post(body);
    expect(stale.status).toBe(409);
    expect(stale.body.error.details.total).toBe('6500.00');
    expect(stale.body.error.details.items[0].unitPrice).toBe('6500.00');
    await expectNothingSaved();
    const ok = await post({
      ...body,
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6500' }],
      expectedTotal: '6500',
    });
    expect(ok.status).toBe(201);
    expect(ok.body.sale.items[0].unitPrice).toBe('6500.00');
  });

  it('H-33: si cambió el % de recargo del crédito con el carrito armado -> 409', async () => {
    await prisma.paymentMethod.update({
      where: { id: w.pm.CREDIT_CARD },
      data: { surchargePercent: '12' },
    });
    const res = await post(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '6000' }],
        expectedTotal: '6600',
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body.error.details.payments[0]).toMatchObject({
      surchargePercent: '12.00',
      chargedAmount: '6720.00',
    });
  });

  it('el precio y el costo guardados son los de la base, no los de la pantalla', async () => {
    const res = await post(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
        expectedTotal: '6000',
      }),
    );
    const item = await prisma.saleItem.findFirstOrThrow({ where: { saleId: res.body.sale.id } });
    expect(item).toMatchObject({ productName: 'Vino Malbec 750 ml' });
    expect(item.unitPrice.toFixed(2)).toBe('6000.00');
    expect(item.unitNetCost.toFixed(2)).toBe('3500.00');
    expect(item.unitCost.toFixed(2)).toBe('4235.00');
    expect(item.vatRatePercent.toFixed(2)).toBe('21.00');
  });

  it('el costo y la ganancia nunca viajan en la respuesta del cobro, ni para el dueño', async () => {
    for (const cookie of [w.employee, w.manager, w.owner]) {
      const res = await post(
        saleBody({
          items: [{ productId: w.alfajor.id, quantity: '1' }],
          payments: [{ paymentMethodId: w.pm.CASH, amount: '1210' }],
          expectedTotal: '1210',
        }),
        cookie,
      );
      expect(res.status).toBe(201);
      expect(findKeys(res.body, SECRET_KEYS)).toEqual([]);
    }
  });
});

describe('reglas de la venta', () => {
  const one = (extra: Record<string, unknown> = {}) =>
    saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      expectedTotal: '6000',
      ...extra,
    } as never);

  it('sin caja abierta -> 422 CASH_SESSION_REQUIRED (VEN-13)', async () => {
    const open = await prisma.cashSession.findFirstOrThrow();
    await closeCashInDb(prisma, open.id, w.managerId);
    const res = await post(one());
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CASH_SESSION_REQUIRED');
    await expectNothingSaved();
  });

  it('sin sesión -> 401', async () => {
    expect((await w.client.post('/api/sales', one())).status).toBe(401);
  });

  it('descuento de un empleado -> 403 FORBIDDEN con fields ["discount"]; no se guarda nada', async () => {
    const res = await post(
      one({
        discount: { type: 'PERCENT', value: '10' },
        expectedTotal: '5400',
        payments: [{ paymentMethodId: w.pm.CASH, amount: '5400' }],
      }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'FORBIDDEN', details: { fields: ['discount'] } });
    await expectNothingSaved();
  });

  it('descuento del 100 % o igual al subtotal -> 422 DISCOUNT_TOO_HIGH; $0,40 -> DISCOUNT_ROUNDS_TO_ZERO', async () => {
    for (const discount of [
      { type: 'PERCENT', value: '100' },
      { type: 'AMOUNT', value: '6000' },
      { type: 'AMOUNT', value: '7000' },
    ]) {
      const res = await post(one({ discount }), w.manager);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DISCOUNT_TOO_HIGH');
      expect(res.body.error.details).toMatchObject({ subtotal: '6000.00' });
    }
    const tiny = await post(one({ discount: { type: 'AMOUNT', value: '0.40' } }), w.manager);
    expect(tiny.body.error.code).toBe('DISCOUNT_ROUNDS_TO_ZERO');
    await expectNothingSaved();
  });

  it('descuento justo por debajo del subtotal ($5.999 de $6.000) se acepta', async () => {
    const res = await post(
      one({
        discount: { type: 'AMOUNT', value: '5999' },
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
      w.owner,
    );
    expect(res.status).toBe(201);
    expect(res.body.sale.amountDue).toBe('1.00');
  });

  it('H-34: producto desactivado -> 422 PRODUCT_INACTIVE con el índice; inexistente -> PRODUCT_NOT_FOUND', async () => {
    await prisma.product.update({ where: { id: w.b.id }, data: { isActive: false } });
    const res = await post(
      saleBody({
        items: [
          { productId: w.a.id, quantity: '1' },
          { productId: w.b.id, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '10000' }],
        expectedTotal: '10000',
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'PRODUCT_INACTIVE',
      details: { items: [{ index: 1, productId: w.b.id }] },
    });
    const missing = await post(
      saleBody({
        items: [{ productId: 99999, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
    );
    expect(missing.body.error.code).toBe('PRODUCT_NOT_FOUND');
    await expectNothingSaved();
  });

  it('H-35: líneas de $0 -> 422 LINE_TOTAL_ZERO (precio 0 en la base, "Varios" a $0,30, peso que redondea a $0)', async () => {
    const zero = await seedProduct(prisma, (await prisma.subcategory.findFirstOrThrow()).id, {
      name: 'Gratis',
      salePrice: '0',
    });
    const cases = [
      [{ productId: zero.id, quantity: '1' }],
      [{ productId: w.misc.id, quantity: '1', unitPrice: '0.30' }],
      [{ productId: w.cheese.id, quantity: '0.001' }], // 0,001 kg x $4.990 = $4,99 -> $5 (no es 0)
    ];
    for (const items of cases.slice(0, 2)) {
      const res = await post(
        saleBody({
          items,
          payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
          expectedTotal: '1',
        }),
      );
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('LINE_TOTAL_ZERO');
      expect(res.body.error.details.items).toEqual([{ index: 0 }]);
    }
    // "Varios" a $0 exacto lo frena el formato (precio > 0): 400.
    const misc0 = await post(
      saleBody({
        items: [{ productId: w.misc.id, quantity: '1', unitPrice: '0' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
    );
    expect(misc0.status).toBe(400);
    await expectNothingSaved();
  });

  it('H-36 y H-37: la suma de pagos tiene que dar EXACTO (de menos, de más, o con el recargo incluido)', async () => {
    const under = await post(one({ payments: [{ paymentMethodId: w.pm.CASH, amount: '5999' }] }));
    expect(under.status).toBe(422);
    expect(under.body.error).toMatchObject({
      code: 'PAYMENTS_TOTAL_MISMATCH',
      details: { amountDue: '6000.00', paidAmount: '5999.00' },
    });
    const over = await post(one({ payments: [{ paymentMethodId: w.pm.QR, amount: '6001' }] }));
    expect(over.body.error.code).toBe('PAYMENTS_TOTAL_MISMATCH');
    // La pantalla manda el crédito CON recargo (error de la pantalla): se nota en vez de cobrar de más.
    const withSurcharge = await post(
      one({
        payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '6600' }],
        expectedTotal: '6660',
      }),
    );
    expect(withSurcharge.body.error.code).toBe('PAYMENTS_TOTAL_MISMATCH');
    await expectNothingSaved();
  });

  it('H-39: el mismo medio dos veces (dos tarjetas) se permite; el recargo se calcula en cada pago', async () => {
    const res = await post(
      one({
        payments: [
          { paymentMethodId: w.pm.CREDIT_CARD, amount: '3000' },
          { paymentMethodId: w.pm.CREDIT_CARD, amount: '3000' },
        ],
        expectedTotal: '6600',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.sale.payments).toHaveLength(2);
    expect(res.body.sale.surchargeAmount).toBe('600.00');
  });

  it('medio inexistente o desactivado -> 422 con los índices', async () => {
    await prisma.paymentMethod.update({ where: { id: w.pm.QR }, data: { isActive: false } });
    const off = await post(
      one({
        payments: [
          { paymentMethodId: w.pm.CASH, amount: '3000' },
          { paymentMethodId: w.pm.QR, amount: '3000' },
        ],
      }),
    );
    expect(off.status).toBe(422);
    expect(off.body.error).toMatchObject({
      code: 'PAYMENT_METHOD_INACTIVE',
      details: { payments: [{ index: 1, paymentMethodId: w.pm.QR }] },
    });
    const missing = await post(one({ payments: [{ paymentMethodId: 9999, amount: '6000' }] }));
    expect(missing.body.error.code).toBe('PAYMENT_METHOD_NOT_FOUND');
    await expectNothingSaved();
  });

  it('H-36: cashTendered en pago mixto (débito + billetes): el vuelto sale solo del efectivo', async () => {
    const res = await post(
      one({
        payments: [
          { paymentMethodId: w.pm.DEBIT_CARD, amount: '5000' },
          { paymentMethodId: w.pm.CASH, amount: '1000' },
        ],
        cashTendered: '2000',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.change).toBe('1000.00');
  });

  it('cashTendered sin efectivo, o que no alcanza -> 422', async () => {
    const noCash = await post(
      one({
        payments: [{ paymentMethodId: w.pm.DEBIT_CARD, amount: '6000' }],
        cashTendered: '6000',
      }),
    );
    expect(noCash.body.error.code).toBe('CASH_TENDERED_WITHOUT_CASH');
    const low = await post(one({ cashTendered: '5999' }));
    expect(low.status).toBe(422);
    expect(low.body.error).toMatchObject({
      code: 'CASH_TENDERED_TOO_LOW',
      details: { cashAmount: '6000.00' },
    });
    const exact = await post(one({ cashTendered: '6000' }));
    expect(exact.status).toBe(201);
    expect(exact.body.change).toBe('0.00');
  });

  it('H-43: límites técnicos (201 líneas -> 400; 11 pagos -> 400; importe enorme -> 422)', async () => {
    const lines = Array.from({ length: 201 }, () => ({ productId: w.a.id, quantity: '1' }));
    expect(
      (
        await post(
          saleBody({
            items: lines,
            payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
            expectedTotal: '1',
          }),
        )
      ).status,
    ).toBe(400);
    const pays = Array.from({ length: 11 }, () => ({ paymentMethodId: w.pm.CASH, amount: '1' }));
    expect(
      (
        await post(
          saleBody({
            items: [{ productId: w.a.id, quantity: '1' }],
            payments: pays,
            expectedTotal: '11',
          }),
        )
      ).status,
    ).toBe(400);
    const huge = await seedProduct(prisma, (await prisma.subcategory.findFirstOrThrow()).id, {
      name: 'Enorme',
      salePrice: '999999999999',
    });
    const big = await post(
      saleBody({
        items: [{ productId: huge.id, quantity: '2' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1' }],
        expectedTotal: '1',
      }),
    );
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe('SALE_AMOUNT_OUT_OF_RANGE');
    await expectNothingSaved();
  });

  it('200 líneas se cobran bien (el límite de H-43 se puede usar)', async () => {
    const items = Array.from({ length: 200 }, () => ({ productId: w.alfajor.id, quantity: '1' }));
    const res = await post(
      saleBody({
        items,
        payments: [{ paymentMethodId: w.pm.CASH, amount: '242000' }],
        expectedTotal: '242000',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.sale.items).toHaveLength(200);
    expect(await stockOf(prisma, w.alfajor.id)).toBe('-180.000');
    expect(await prisma.stockMovement.count()).toBe(200);
  });

  it('el stock puede quedar negativo (VEN-09): avisa y deja vender', async () => {
    const res = await post(
      saleBody({
        items: [{ productId: w.coke.id, quantity: '3' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '4350' }],
        expectedTotal: '4350',
      }),
    );
    expect(res.status).toBe(201);
    expect(res.body.stockWarnings).toEqual([
      expect.objectContaining({ productId: w.coke.id, stockAfter: '-2.000' }),
    ]);
    const [m] = await prisma.stockMovement.findMany();
    expect(m).toMatchObject({ type: 'SALE', productId: w.coke.id, userId: w.employeeId });
    expect(m?.quantity.toFixed(3)).toBe('-3.000');
    expect(m?.stockAfter.toFixed(3)).toBe('-2.000');
    expect(m?.unitNetCost?.toFixed(2)).toBe('900.00');
    expect(m?.saleItemId).not.toBeNull();
  });

  it('el mismo producto en dos líneas: dos movimientos y un solo aviso con el stock final', async () => {
    const res = await post(
      saleBody({
        items: [
          { productId: w.coke.id, quantity: '1' },
          { productId: w.coke.id, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '2900' }],
        expectedTotal: '2900',
      }),
    );
    expect(res.status).toBe(201);
    expect(await prisma.stockMovement.count()).toBe(2);
    expect(res.body.stockWarnings).toHaveLength(1);
    expect(res.body.stockWarnings[0].stockAfter).toBe('-1.000');
  });

  it('businessDate usa la hora de corte (ADR 002): con corte 23:59 la venta cae en el día anterior', async () => {
    const day = async () => {
      const res = await post(one());
      expect(res.status).toBe(201);
      return res.body.sale.businessDate as string;
    };
    await prisma.$executeRaw`UPDATE settings SET business_day_cutoff_minutes = 0 WHERE id = 1`;
    const calendar = await day();
    await prisma.$executeRaw`UPDATE settings SET business_day_cutoff_minutes = 1439 WHERE id = 1`;
    const shifted = await day();
    const diffDays =
      (new Date(`${calendar}T00:00:00Z`).getTime() - new Date(`${shifted}T00:00:00Z`).getTime()) /
      86_400_000;
    expect(diffDays).toBe(1);
  });

  it('la venta guarda quién vendió, en qué caja y la hora del servidor', async () => {
    const before = Date.now();
    const res = await post(one(), w.manager);
    const cash = await prisma.cashSession.findFirstOrThrow();
    expect(res.body.sale.user.id).toBe(w.managerId);
    expect(res.body.sale.cashSession).toMatchObject({ id: cash.id, shift: 'MORNING' });
    const created = new Date(res.body.sale.createdAt).getTime();
    expect(created).toBeGreaterThanOrEqual(before - 1000);
    expect(created).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('desde la puerta remota: 403 LOCAL_ONLY (encargado y dueño), se audita y no se guarda nada', async () => {
    for (const cookie of [w.remoteManager, w.remoteOwner]) {
      const res = await w.remote.post('/api/sales', one(), cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    await expectNothingSaved();
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBeGreaterThan(0);
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
  });
});

describe('reintentos y duplicados: clientRequestId (ventas.md 2.4)', () => {
  const body = () =>
    saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      cashTendered: '10000',
      expectedTotal: '6000',
    });

  it('mismo id y mismo pedido (doble clic): 200 con la MISMA venta e isReplay; nada se duplica', async () => {
    const b = body();
    const first = await post(b);
    expect(first.status).toBe(201);
    expect(first.body.isReplay).toBe(false);
    const again = await post(b);
    expect(again.status).toBe(200);
    expect(again.body.isReplay).toBe(true);
    expect(again.body.sale).toEqual(first.body.sale);
    expect(again.body.change).toBe('4000.00');
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.stockMovement.count()).toBe(1);
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
  });

  it('el reintento da lo mismo aunque se normalicen los números ("6000" y "6000.00")', async () => {
    const b = body();
    await post(b);
    const again = await post({
      ...b,
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000.00' }],
    });
    expect(again.status).toBe(200);
    expect(again.body.isReplay).toBe(true);
  });

  it('el reintento repite el aviso de stock (sale del stockAfter guardado)', async () => {
    const b = saleBody({
      items: [{ productId: w.coke.id, quantity: '2' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '2900' }],
      expectedTotal: '2900',
    });
    const first = await post(b);
    const again = await post(b);
    expect(again.body.stockWarnings).toEqual(first.body.stockWarnings);
    expect(again.body.stockWarnings).toHaveLength(1);
  });

  it('mismo id con otro cuerpo -> 409 SALE_REQUEST_ID_REUSED, solo con saleId y createdAt', async () => {
    const b = body();
    const first = await post(b);
    const other = await post({
      ...b,
      items: [{ productId: w.a.id, quantity: '2' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '12000' }],
      expectedTotal: '12000',
    });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('SALE_REQUEST_ID_REUSED');
    expect(other.body.error.details).toEqual({
      saleId: first.body.sale.id,
      createdAt: first.body.sale.createdAt,
    });
    expect(await prisma.sale.count()).toBe(1);
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
  });

  it('mismo id y mismo cuerpo pero OTRO usuario -> 409 (no se le muestra la venta ajena)', async () => {
    const b = body();
    await post(b, w.employee);
    const other = await post(b, w.manager);
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe('SALE_REQUEST_ID_REUSED');
    expect(findKeys(other.body, ['total', 'items', 'payments', 'subtotal'])).toEqual([]);
  });

  it('el reintento funciona aunque la caja ya se haya cerrado o la venta se haya anulado', async () => {
    const b = body();
    const first = await post(b);
    const cash = await prisma.cashSession.findFirstOrThrow();
    // Se anula (con la caja abierta) y después se cierra la caja.
    expect(
      (
        await w.client.post(
          `/api/sales/${first.body.sale.id}/void`,
          { reason: 'Prueba' },
          w.manager,
        )
      ).status,
    ).toBe(200);
    await closeCashInDb(prisma, cash.id, w.managerId);
    const again = await post(b);
    expect(again.status).toBe(200);
    expect(again.body.isReplay).toBe(true);
    expect(again.body.sale.status).toBe('VOIDED');
  });

  it('un reintento de otro pedido con el mismo id por un descuento de empleado sigue siendo 403 (antes que todo)', async () => {
    const b = body();
    await post(b, w.manager);
    const res = await post({ ...b, discount: { type: 'PERCENT', value: '10' } }, w.employee);
    expect(res.status).toBe(403);
  });

  it('la huella (requestHash) se guarda pero NUNCA sale en ninguna respuesta', async () => {
    const b = body();
    const first = await post(b);
    const replay = await post(b);
    const other = await post({ ...b, expectedTotal: '1' });
    const sale = await prisma.sale.findFirstOrThrow();
    expect(sale.requestHash).toMatch(/^[0-9a-f]{64}$/);
    for (const res of [
      first,
      replay,
      other,
      await w.client.get(`/api/sales/${sale.id}`, w.owner),
      await w.client.get('/api/sales', w.owner),
    ]) {
      expect(JSON.stringify(res.body)).not.toContain(sale.requestHash);
      expect(findKeys(res.body, ['requestHash', 'clientRequestId'])).toEqual([]);
    }
  });

  it('carrera: el mismo clientRequestId en paralelo -> una sola venta, una 201 y el resto 200 isReplay; stock una vez', async () => {
    for (let round = 0; round < 3; round++) {
      await prisma.stockMovement.deleteMany();
      await prisma.salePayment.deleteMany();
      await prisma.saleItem.deleteMany();
      await prisma.sale.deleteMany();
      await prisma.product.update({ where: { id: w.a.id }, data: { stockQuantity: '10' } });
      const b = body();
      const results = await Promise.all(Array.from({ length: 6 }, () => post(b)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 200, 200, 200, 200, 201]);
      expect(results.filter((r) => r.status === 200).every((r) => r.body.isReplay === true)).toBe(
        true,
      );
      expect(new Set(results.map((r) => r.body.sale.id)).size).toBe(1);
      expect(await prisma.sale.count()).toBe(1);
      expect(await prisma.stockMovement.count()).toBe(1);
      expect(await stockOf(prisma, w.a.id)).toBe('9.000');
    }
  });

  it('carrera: mismo id con DOS cuerpos distintos a la vez -> una 201 y la otra 409', async () => {
    const id = randomUUID();
    const mk = (qtyText: string, amount: string) => ({
      clientRequestId: id,
      items: [{ productId: w.a.id, quantity: qtyText }],
      payments: [{ paymentMethodId: w.pm.CASH, amount }],
      expectedTotal: amount,
    });
    const results = await Promise.all([post(mk('1', '6000')), post(mk('2', '12000'))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.sale.count()).toBe(1);
  });
});

describe('carreras de stock', () => {
  it('dos ventas del mismo producto a la vez: no se pisan (stock y stockAfter exactos)', async () => {
    await prisma.product.update({ where: { id: w.alfajor.id }, data: { stockQuantity: '100' } });
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post(
          saleBody({
            items: [{ productId: w.alfajor.id, quantity: String(i + 1) }],
            payments: [{ paymentMethodId: w.pm.CASH, amount: String(1210 * (i + 1)) }],
            expectedTotal: String(1210 * (i + 1)),
          }),
          [w.employee, w.manager, w.owner][i % 3],
        ),
      ),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    // 1 + 2 + ... + 10 = 55 vendidos.
    expect(await stockOf(prisma, w.alfajor.id)).toBe('45.000');
    const movements = await prisma.stockMovement.findMany({ orderBy: { id: 'asc' } });
    expect(movements).toHaveLength(10);
    // Cada stockAfter es el anterior menos la cantidad: la cadena es consistente.
    let running = 100;
    for (const m of movements) {
      running += Number(m.quantity.toFixed(3));
      expect(m.stockAfter.toFixed(3)).toBe(running.toFixed(3));
    }
  });

  it('dos ventas con los mismos productos en orden opuesto, muchas veces: sin bloqueo cruzado (deadlock)', async () => {
    const mk = (first: number, second: number) =>
      saleBody({
        items: [
          { productId: first, quantity: '1' },
          { productId: second, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '10000' }],
        expectedTotal: '10000',
      });
    for (let round = 0; round < 8; round++) {
      const results = await Promise.all([
        post(mk(w.a.id, w.b.id)),
        post(mk(w.b.id, w.a.id)),
        post(mk(w.a.id, w.b.id), w.manager),
        post(mk(w.b.id, w.a.id), w.owner),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    }
    expect(await stockOf(prisma, w.a.id)).toBe('-22.000');
    expect(await stockOf(prisma, w.b.id)).toBe('-22.000');
  });

  it('una venta mientras se anula otra: las dos terminan y el stock cierra', async () => {
    const mk = (first: number, second: number) =>
      saleBody({
        items: [
          { productId: first, quantity: '1' },
          { productId: second, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '10000' }],
        expectedTotal: '10000',
      });
    for (let round = 0; round < 5; round++) {
      const s1 = await post(mk(w.b.id, w.a.id));
      expect(s1.status).toBe(201);
      const [voided, sold, sold2] = await Promise.all([
        w.client.post(`/api/sales/${s1.body.sale.id}/void`, { reason: 'Carrera' }, w.manager),
        post(mk(w.a.id, w.b.id)),
        post(mk(w.b.id, w.a.id), w.owner),
      ]);
      expect(voided.status).toBe(200);
      expect(sold.status).toBe(201);
      expect(sold2.status).toBe(201);
    }
    // Cada ronda: -1 (s1) +1 (anulación) -2 (dos ventas nuevas) = -2 por producto.
    expect(await stockOf(prisma, w.a.id)).toBe('0.000');
    expect(await stockOf(prisma, w.b.id)).toBe('0.000');
    expect(await prisma.sale.count({ where: { status: 'VOIDED' } })).toBe(5);
    expect(await prisma.cashMovement.count()).toBe(5);
  });
});
