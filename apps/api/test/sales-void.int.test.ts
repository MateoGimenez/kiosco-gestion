// Etapa 3: anular (ventas.md 7) y ver/listar ventas (ventas.md 8, visibilidad por rol, sección 3).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { COST_KEYS, findKeys } from './catalog-helpers';
import {
  closeCash,
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
let cashId: number;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
  cashId = (await openCash(w)).id;
});
afterAll(() => prisma.$disconnect());

const SECRET_KEYS = [...COST_KEYS, 'unitCost', 'lineProfit', 'grossProfit', 'requestHash'];
const sell = (body: unknown, cookie = w.manager) => w.client.post('/api/sales', body, cookie);
const voidSale = (
  id: number,
  body: unknown = { reason: 'El cliente se arrepintió' },
  cookie = w.manager,
) => w.client.post(`/api/sales/${id}/void`, body, cookie);

/** Una venta de ejemplo 2 (efectivo $4.500 + crédito $4.500, entrega $5.000). */
async function sellExample2() {
  const res = await sell(example2(w));
  expect(res.status).toBe(201);
  return res.body.sale.id as number;
}

describe('POST /api/sales/:id/void', () => {
  it('ejemplo 2 anulado: vuelve el stock, sale $4.500 de la caja abierta y los $5.000 del posnet se devuelven por fuera', async () => {
    const id = await sellExample2();
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
    const res = await voidSale(id);
    expect(res.status).toBe(200);
    // Neto del vuelto (PA-17): $4.500, no los $5.000 que entregó.
    expect(res.body.cashRefund).toMatchObject({ cashSessionId: cashId, amount: '4500.00' });
    expect(res.body.otherRefunds).toEqual([
      {
        paymentMethod: { id: w.pm.CREDIT_CARD, kind: 'CREDIT_CARD', name: 'Crédito' },
        chargedAmount: '5000.00',
      },
    ]);
    expect(res.body.sale).toMatchObject({
      id,
      status: 'VOIDED',
      total: '9500.00',
      voidReason: 'El cliente se arrepintió',
      voidedBy: { id: w.managerId },
      voidRefund: {
        cashMovementId: res.body.cashRefund.cashMovementId,
        cashSessionId: cashId,
        amount: '4500.00',
      },
    });
    expect(res.body.sale.voidedAt).toBeTruthy();
    // Stock de vuelta, con movimientos SALE_VOID.
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
    expect(await stockOf(prisma, w.b.id)).toBe('10.000');
    const voids = await prisma.stockMovement.findMany({
      where: { type: 'SALE_VOID' },
      orderBy: { id: 'asc' },
    });
    expect(
      voids.map((m) => [m.productId, m.quantity.toFixed(3), m.stockAfter.toFixed(3), m.userId]),
    ).toEqual([
      [w.a.id, '1.000', '10.000', w.managerId],
      [w.b.id, '1.000', '10.000', w.managerId],
    ]);
    // La salida de efectivo.
    const movement = await prisma.cashMovement.findMany();
    expect(movement).toHaveLength(1);
    expect(movement[0]).toMatchObject({
      cashSessionId: cashId,
      direction: 'OUT',
      reason: 'SALE_VOID_REFUND',
      saleId: id,
      userId: w.managerId,
      description: `Anulación de la venta #${id}`,
    });
    expect(movement[0]?.amount.toFixed(2)).toBe('4500.00');
    // Auditoría (cubre también la salida de caja).
    const [log] = await prisma.auditLog.findMany({ where: { action: 'SALE_VOID' } });
    expect(log).toMatchObject({
      userId: w.managerId,
      entityType: 'Sale',
      entityId: String(id),
      channel: 'LOCAL',
    });
    expect(log?.details).toMatchObject({
      reason: 'El cliente se arrepintió',
      total: '9500.00',
      saleCashSessionId: cashId,
      cashRefund: { amount: '4500.00' },
    });
    // Los movimientos de stock de la venta traen el saleId (productos-stock.md 3.2).
    const history = await w.client.get(`/api/products/${w.a.id}/stock-movements`, w.manager);
    expect(
      history.body.items.map((m: { type: string; saleId: number }) => [m.type, m.saleId]),
    ).toEqual([
      ['SALE_VOID', id],
      ['SALE', id],
    ]);
  });

  it('anulación por un empleado -> 403 FORBIDDEN (rol antes que puerta); no cambia nada', async () => {
    const id = await sellExample2();
    const res = await voidSale(id, { reason: 'x' }, w.employee);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await prisma.sale.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
  });

  it('desde la puerta remota: el encargado y el dueño -> 403 LOCAL_ONLY, ACCESS_DENIED, nada cambia', async () => {
    const id = await sellExample2();
    for (const cookie of [w.remoteManager, w.remoteOwner]) {
      const res = await w.remote.post(`/api/sales/${id}/void`, { reason: 'Prueba' }, cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    expect((await prisma.sale.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBeGreaterThan(0);
  });

  it('H-41 a: sin caja abierta -> 422 CASH_SESSION_REQUIRED, también con una venta SIN efectivo', async () => {
    const card = await sell(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.DEBIT_CARD, amount: '6000' }],
        expectedTotal: '6000',
      }),
    );
    const cashSale = await sellExample2();
    await closeCash(w, cashId);
    for (const id of [card.body.sale.id, cashSale]) {
      const res = await voidSale(id);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('CASH_SESSION_REQUIRED');
      expect((await prisma.sale.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
    }
    expect(await stockOf(prisma, w.a.id)).toBe('8.000');
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('H-42 y PA-17: una venta de una caja ya cerrada se anula; la salida va a la caja ABIERTA y la vieja no cambia', async () => {
    const id = await sellExample2();
    await closeCash(w, cashId);
    const newCash = await openCash(w, w.manager, '100');
    // Pasó el tiempo: la venta es "vieja".
    await prisma.sale.update({
      where: { id },
      data: { createdAt: new Date('2026-01-01T12:00:00Z') },
    });
    const res = await voidSale(id);
    expect(res.status).toBe(200);
    expect(res.body.cashRefund).toMatchObject({ cashSessionId: newCash.id, amount: '4500.00' });
    expect(res.body.sale.cashSession.id).toBe(cashId);
    const movements = await prisma.cashMovement.findMany();
    expect(movements.map((m) => m.cashSessionId)).toEqual([newCash.id]);
    const old = await prisma.cashSession.findUniqueOrThrow({ where: { id: cashId } });
    expect(old.status).toBe('CLOSED');
    expect(old.difference?.toFixed(2)).toBe('0.00');
  });

  it('venta sin efectivo: no hay salida de caja (cashRefund null) y todo se devuelve por fuera', async () => {
    const sale = await sell(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [
          { paymentMethodId: w.pm.QR, amount: '3000' },
          { paymentMethodId: w.pm.TRANSFER, amount: '3000' },
        ],
        expectedTotal: '6000',
      }),
    );
    const res = await voidSale(sale.body.sale.id);
    expect(res.status).toBe(200);
    expect(res.body.cashRefund).toBeNull();
    expect(res.body.otherRefunds.map((r: { chargedAmount: string }) => r.chargedAmount)).toEqual([
      '3000.00',
      '3000.00',
    ]);
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
  });

  it('todo en efectivo con vuelto: se devuelve lo cobrado (la parte de la venta), no lo entregado', async () => {
    const sale = await sell(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
        cashTendered: '10000',
        expectedTotal: '6000',
      }),
    );
    const res = await voidSale(sale.body.sale.id);
    expect(res.body.cashRefund.amount).toBe('6000.00');
  });

  it('"Varios" no mueve stock al anular; el stock de un producto desactivado después sí vuelve (H-31)', async () => {
    const sale = await sell(
      saleBody({
        items: [
          { productId: w.misc.id, quantity: '1', unitPrice: '700' },
          { productId: w.alfajor.id, quantity: '2' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '3120' }],
        expectedTotal: '3120',
      }),
    );
    await prisma.product.update({ where: { id: w.alfajor.id }, data: { isActive: false } });
    expect((await voidSale(sale.body.sale.id)).status).toBe(200);
    expect(await stockOf(prisma, w.alfajor.id)).toBe('20.000');
    expect(await stockOf(prisma, w.misc.id)).toBe('0.000');
    expect(await prisma.stockMovement.count({ where: { type: 'SALE_VOID' } })).toBe(1);
  });

  it('una venta que dejó el stock en negativo: al anular vuelve al valor de antes', async () => {
    const sale = await sell(
      saleBody({
        items: [{ productId: w.coke.id, quantity: '3' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '4350' }],
        expectedTotal: '4350',
      }),
    );
    expect(await stockOf(prisma, w.coke.id)).toBe('-2.000');
    await voidSale(sale.body.sale.id);
    expect(await stockOf(prisma, w.coke.id)).toBe('1.000');
  });

  it('ya anulada -> 409 SALE_ALREADY_VOIDED, sin mover stock ni caja otra vez', async () => {
    const id = await sellExample2();
    expect((await voidSale(id)).status).toBe(200);
    const again = await voidSale(id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('SALE_ALREADY_VOIDED');
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
    expect(await prisma.cashMovement.count()).toBe(1);
    expect(await prisma.stockMovement.count({ where: { type: 'SALE_VOID' } })).toBe(2);
  });

  it('carrera: dos anulaciones a la vez -> una 200 y la otra 409; stock y caja una sola vez', async () => {
    for (let round = 0; round < 3; round++) {
      const id = await sellExample2();
      const results = await Promise.all(
        [
          voidSale(id, undefined, w.manager),
          voidSale(id, undefined, w.owner),
          voidSale(id, undefined, w.manager),
        ].map((p) => p),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    }
    expect(await stockOf(prisma, w.a.id)).toBe('10.000');
    expect(await prisma.cashMovement.count()).toBe(3);
  });

  it('validación: motivo vacío o muy largo, campo de más -> 400; id inexistente -> 404; sin sesión -> 401', async () => {
    const id = await sellExample2();
    for (const body of [
      {},
      { reason: '   ' },
      { reason: 'x'.repeat(201) },
      { reason: 'ok', amount: '1' },
    ]) {
      const res = await voidSale(id, body);
      expect(res.status).toBe(400);
    }
    expect((await voidSale(99999)).status).toBe(404);
    expect((await w.client.post(`/api/sales/${id}/void`, { reason: 'x' })).status).toBe(401);
    expect((await prisma.sale.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
  });

  it('respuesta por rol: el encargado sin costos; el dueño con costos y ganancia', async () => {
    const a = await sellExample2();
    const asManager = await voidSale(a, undefined, w.manager);
    expect(findKeys(asManager.body, SECRET_KEYS)).toEqual([]);
    const b = await sellExample2();
    const asOwner = await voidSale(b, undefined, w.owner);
    expect(asOwner.body.sale.grossProfit).toBeDefined();
    expect(asOwner.body.sale.items[0].unitNetCost).toBe('3500.00');
    expect(findKeys(asOwner.body, ['requestHash'])).toEqual([]);
  });
});

describe('GET /api/sales y GET /api/sales/:id', () => {
  it('H-40 a: el empleado -> 403 en la lista y en el detalle (aunque sea su venta)', async () => {
    const mine = await sell(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
        expectedTotal: '6000',
      }),
      w.employee,
    );
    expect(mine.status).toBe(201);
    const list = await w.client.get('/api/sales', w.employee);
    expect(list.status).toBe(403);
    expect(list.body.error.code).toBe('FORBIDDEN');
    const one = await w.client.get(`/api/sales/${mine.body.sale.id}`, w.employee);
    expect(one.status).toBe(403);
    expect(JSON.stringify(list.body) + JSON.stringify(one.body)).not.toContain('total');
  });

  it('lista del encargado: con anuladas, la más nueva primero, medios y marca de "Varios"', async () => {
    const s1 = await sell(example1(w));
    const s2 = await sell(
      saleBody({
        items: [
          { productId: w.misc.id, quantity: '1', unitPrice: '700' },
          { productId: w.alfajor.id, quantity: '1' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1910' }],
        expectedTotal: '1910',
      }),
      w.employee,
    );
    await voidSale(s1.body.sale.id);
    const res = await w.client.get('/api/sales', w.manager);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 2 });
    expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([
      s2.body.sale.id,
      s1.body.sale.id,
    ]);
    expect(res.body.items[0]).toMatchObject({
      status: 'COMPLETED',
      itemCount: 2,
      hasMiscellaneous: true,
      total: '1910.00',
      user: { id: w.employeeId },
      cashSession: { id: cashId, shift: 'MORNING' },
      payments: [{ kind: 'CASH', name: 'Efectivo', chargedAmount: '1910.00' }],
      voidedAt: null,
    });
    expect(res.body.items[1]).toMatchObject({
      status: 'VOIDED',
      hasMiscellaneous: false,
      discountAmount: '1000.00',
      surchargeAmount: '1000.00',
      total: '10000.00',
      payments: [{ kind: 'CREDIT_CARD', chargedAmount: '10000.00' }],
    });
    expect(res.body.items[1].voidedAt).toBeTruthy();
    expect(findKeys(res.body, SECRET_KEYS)).toEqual([]);
    const asc = await w.client.get('/api/sales?sortOrder=asc', w.owner);
    expect(asc.body.items.map((i: { id: number }) => i.id)).toEqual([
      s1.body.sale.id,
      s2.body.sale.id,
    ]);
  });

  it('filtros por día de trabajo (ambos incluidos), caja, estado y vendedor; paginación', async () => {
    const s1 = await sell(example1(w));
    await prisma.sale.update({
      where: { id: s1.body.sale.id },
      data: { businessDate: new Date('2026-03-10T00:00:00Z') },
    });
    await closeCash(w, cashId);
    const cash2 = await openCash(w, w.manager);
    const s2 = await sell(
      saleBody({
        items: [{ productId: w.a.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
        expectedTotal: '6000',
      }),
      w.employee,
    );
    const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((i) => i.id);
    expect(ids(await w.client.get('/api/sales?from=2026-03-10&to=2026-03-10', w.manager))).toEqual([
      s1.body.sale.id,
    ]);
    expect(ids(await w.client.get('/api/sales?from=2026-03-11', w.manager))).toEqual([
      s2.body.sale.id,
    ]);
    expect(ids(await w.client.get(`/api/sales?cashSessionId=${cash2.id}`, w.manager))).toEqual([
      s2.body.sale.id,
    ]);
    expect(ids(await w.client.get(`/api/sales?cashSessionId=${cashId}`, w.manager))).toEqual([
      s1.body.sale.id,
    ]);
    expect(ids(await w.client.get(`/api/sales?userId=${w.employeeId}`, w.manager))).toEqual([
      s2.body.sale.id,
    ]);
    expect(ids(await w.client.get('/api/sales?status=VOIDED', w.manager))).toEqual([]);
    const page = await w.client.get('/api/sales?page=2&pageSize=1', w.manager);
    expect(page.body).toMatchObject({ page: 2, pageSize: 1, total: 2 });
    expect(ids(page)).toEqual([s1.body.sale.id]);
    expect((await w.client.get('/api/sales?from=2026-03-11&to=2026-03-10', w.manager)).status).toBe(
      400,
    );
    expect((await w.client.get('/api/sales?pageSize=500', w.manager)).status).toBe(400);
    expect((await w.client.get('/api/sales?foo=1', w.manager)).status).toBe(400);
  });

  it('detalle: el encargado SIN costos ni ganancia; el dueño CON costos (ejemplo 1: 1.938,02)', async () => {
    const sale = await sell(example1(w));
    const id = sale.body.sale.id;
    const manager = await w.client.get(`/api/sales/${id}`, w.manager);
    expect(manager.status).toBe(200);
    expect(findKeys(manager.body, SECRET_KEYS)).toEqual([]);
    expect(manager.body).toMatchObject({
      id,
      total: '10000.00',
      amountDue: '9000.00',
      voidRefund: null,
    });
    const owner = await w.client.get(`/api/sales/${id}`, w.owner);
    expect(owner.body.grossProfit).toBe('1938.02');
    expect(owner.body.items[0].unitCost).toBe('4235.00');
  });

  it('detalle: 404 si no existe, 400 si el id no es un entero, 401 sin sesión', async () => {
    expect((await w.client.get('/api/sales/99999', w.manager)).status).toBe(404);
    expect((await w.client.get('/api/sales/abc', w.manager)).status).toBe(400);
    expect((await w.client.get('/api/sales/1')).status).toBe(401);
  });

  it('ver ventas desde afuera SÍ se puede (es como un reporte, ADR 003 punto 6)', async () => {
    const sale = await sell(example1(w));
    expect((await w.remote.get('/api/sales', w.remoteManager)).status).toBe(200);
    expect((await w.remote.get(`/api/sales/${sale.body.sale.id}`, w.remoteOwner)).status).toBe(200);
  });
});

describe('/api/products/miscellaneous', () => {
  it('devuelve "Varios" sin costos para cualquier rol, aunque se renombre (H-32)', async () => {
    await prisma.product.update({ where: { id: w.misc.id }, data: { name: 'Otros' } });
    for (const cookie of [w.employee, w.manager, w.owner]) {
      const res = await w.client.get('/api/products/miscellaneous', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: w.misc.id,
        name: 'Otros',
        isMiscellaneous: true,
        saleUnit: 'UNIT',
      });
      expect(findKeys(res.body, SECRET_KEYS)).toEqual([]);
    }
    expect((await w.client.get('/api/products/miscellaneous')).status).toBe(401);
  });

  it('404 si el seed no lo creó', async () => {
    await prisma.product.delete({ where: { id: w.misc.id } });
    expect((await w.client.get('/api/products/miscellaneous', w.employee)).status).toBe(404);
  });
});
