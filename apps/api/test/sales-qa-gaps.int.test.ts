// Etapa 3, huecos que QA encontró al contrastar los tests de backend con la lista del plan y del
// contrato (ventas.md 2.4, 6 y 7): todo se deshace si falla el stock, el reintento no vuelve a auditar
// ni a comparar el precio, y las cantidades por peso con demasiados decimales.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedProduct } from './catalog-helpers';
import {
  example1,
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

const sell = (body: unknown, cookie = w.manager) => w.client.post('/api/sales', body, cookie);
const voidSale = (id: number) =>
  w.client.post(`/api/sales/${id}/void`, { reason: 'Prueba' }, w.manager);

describe('atomicidad: si falla el stock no queda nada (NF-11)', () => {
  it('venta con un producto cuyo stock no entra en la columna -> 422 STOCK_OUT_OF_RANGE y NADA guardado (ni el stock del otro producto)', async () => {
    // numeric(12,3): el piso es -999.999.999,999. Con este stock, una unidad más ya no entra.
    const edge = await seedProduct(prisma, (await prisma.subcategory.findFirstOrThrow()).id, {
      name: 'Producto al límite',
      salePrice: '100',
      stockQuantity: '-999999999.000',
    });
    const before = await stockOf(prisma, w.alfajor.id);
    const res = await sell(
      saleBody({
        // El alfajor va primero (id más chico): su stock ya se descontó cuando falla el otro.
        items: [
          { productId: w.alfajor.id, quantity: '1' },
          { productId: edge.id, quantity: '2' },
        ],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1410' }],
        expectedTotal: '1410',
      }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STOCK_OUT_OF_RANGE');
    expect(await prisma.sale.count()).toBe(0);
    expect(await prisma.salePayment.count()).toBe(0);
    expect(await prisma.saleItem.count()).toBe(0);
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await stockOf(prisma, w.alfajor.id)).toBe(before);
    expect(await stockOf(prisma, edge.id)).toBe('-999999999.000');
  });

  it('anular cuando el stock devuelto no entra -> 422 STOCK_OUT_OF_RANGE y la venta SIGUE cobrada (sin salida de caja ni auditoría)', async () => {
    const sold = await sell(
      saleBody({
        items: [{ productId: w.alfajor.id, quantity: '1' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '1210' }],
        expectedTotal: '1210',
      }),
    );
    expect(sold.status).toBe(201);
    // Por alguna razón el stock quedó al tope: devolver una unidad ya no entra.
    await prisma.product.update({
      where: { id: w.alfajor.id },
      data: { stockQuantity: '999999999.999' },
    });
    const res = await voidSale(sold.body.sale.id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STOCK_OUT_OF_RANGE');
    const sale = await prisma.sale.findUniqueOrThrow({ where: { id: sold.body.sale.id } });
    expect(sale.status).toBe('COMPLETED');
    expect(sale.voidedAt).toBeNull();
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: 'SALE_VOID' } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'SALE_VOID' } })).toBe(0);
    expect(await stockOf(prisma, w.alfajor.id)).toBe('999999999.999');
  });
});

describe('reintentos (ventas.md 2.4), casos que faltaban', () => {
  it('el reintento NO vuelve a auditar el descuento ni a mover el stock', async () => {
    const body = example1(w);
    expect((await sell(body)).status).toBe(201);
    expect(await prisma.auditLog.count({ where: { action: 'DISCOUNT_APPLIED' } })).toBe(1);
    for (let i = 0; i < 3; i++) {
      const again = await sell(body);
      expect(again.status).toBe(200);
      expect(again.body.isReplay).toBe(true);
    }
    expect(await prisma.auditLog.count({ where: { action: 'DISCOUNT_APPLIED' } })).toBe(1);
    expect(await prisma.sale.count()).toBe(1);
    expect(await prisma.stockMovement.count()).toBe(2);
    expect(await stockOf(prisma, w.a.id)).toBe('9.000');
    expect(await stockOf(prisma, w.b.id)).toBe('9.000');
  });

  it('el reintento después de que cambió el precio devuelve la venta ya cobrada (200), no 409 SALE_TOTAL_CHANGED', async () => {
    const body = saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      expectedTotal: '6000',
    });
    const first = await sell(body, w.employee);
    expect(first.status).toBe(201);
    // Se cortó el WiFi, la respuesta se perdió y mientras tanto el dueño subió el precio.
    await prisma.product.update({ where: { id: w.a.id }, data: { salePrice: '7000' } });
    const again = await sell(body, w.employee);
    expect(again.status).toBe(200);
    expect(again.body.isReplay).toBe(true);
    expect(again.body.sale.total).toBe('6000.00');
    expect(await prisma.sale.count()).toBe(1);
  });

  it('un reintento cuando la caja se cerró y se abrió otra devuelve la venta original (de la caja vieja)', async () => {
    const body = saleBody({
      items: [{ productId: w.a.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '6000' }],
      expectedTotal: '6000',
    });
    const first = await sell(body, w.employee);
    const oldCash = first.body.sale.cashSession.id;
    await prisma.cashSession.update({
      where: { id: oldCash },
      data: {
        status: 'CLOSED',
        closedAt: new Date(),
        closedById: w.managerId,
        countedCash: '0',
        expectedCash: '0',
        difference: '0',
      },
    });
    await openCash(w, w.manager, '1000');
    const again = await sell(body, w.employee);
    expect(again.status).toBe(200);
    expect(again.body.sale.id).toBe(first.body.sale.id);
    expect(again.body.sale.cashSession.id).toBe(oldCash);
    expect(await prisma.sale.count()).toBe(1);
  });
});

describe('cantidades', () => {
  it('por peso con más de 3 decimales o en cero -> 400 y nada guardado', async () => {
    for (const quantity of ['0.3501', '0', '0.000', '-1', '1e3', '']) {
      const res = await sell(
        saleBody({
          items: [{ productId: w.cheese.id, quantity }],
          payments: [{ paymentMethodId: w.pm.CASH, amount: '1747' }],
          expectedTotal: '1747',
        }),
      );
      expect(res.status, `quantity "${quantity}"`).toBe(400);
    }
    expect(await prisma.sale.count()).toBe(0);
    expect(await stockOf(prisma, w.cheese.id)).toBe('5.000');
  });

  it('el peso mínimo que vale algo: 0,001 kg a $4.990 son $5 y se cobra', async () => {
    const res = await sell(
      saleBody({
        items: [{ productId: w.cheese.id, quantity: '0.001' }],
        payments: [{ paymentMethodId: w.pm.CASH, amount: '5' }],
        expectedTotal: '5',
      }),
      w.employee,
    );
    expect(res.status).toBe(201);
    expect(await stockOf(prisma, w.cheese.id)).toBe('4.999');
  });
});
