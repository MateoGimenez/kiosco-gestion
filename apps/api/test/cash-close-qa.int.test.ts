// Etapa 4, huecos que dejó cash-close.int.test.ts (revisión de QA): centavos de punta a punta, anulación
// y cierre a la vez, y qué ve el empleado cuando otro cierra su caja. No repite lo que ya cubre ese archivo.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { example2, openCash, saleBody, setupSalesWorld, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
});
afterAll(() => prisma.$disconnect());

const close = (id: number, body: unknown, cookie = w.employee) =>
  w.client.post(`/api/cash-sessions/${id}/close`, body, cookie);
const detail = (id: number, cookie = w.manager) => w.client.get(`/api/cash-sessions/${id}`, cookie);
const movement = (direction: 'IN' | 'OUT', reason: string, amount: string) =>
  w.client.post(
    '/api/cash-movements',
    { direction, reason, description: 'Prueba de centavos', amount },
    w.manager,
  );
const sellCash = (amount: string) =>
  w.client.post(
    '/api/sales',
    saleBody({
      items: [{ productId: w.misc.id, quantity: '1', unitPrice: amount }],
      payments: [{ paymentMethodId: w.pm.CASH, amount }],
      expectedTotal: amount,
    }),
    w.manager,
  );

describe('centavos en la caja (sin float)', () => {
  it('apertura con centavos, aporte y gasto con centavos: 1000,10 + 0,20 - 0,05 = 1000,25 exacto; contar 1000,25 da 0', async () => {
    const id = (await openCash(w, w.employee, '1000.10')).id;
    expect((await movement('IN', 'CASH_CONTRIBUTION', '0.20')).status).toBe(201);
    expect((await movement('OUT', 'EXPENSE', '0.05')).status).toBe(201);
    expect((await sellCash('300')).status).toBe(201);

    const res = await close(id, { countedCash: '1300.25' }, w.manager);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      expectedCash: '1300.25',
      countedCash: '1300.25',
      difference: '0.00',
    });
    expect(res.body.summary).toMatchObject({
      cashIn: '0.20',
      cashOut: '0.05',
      openingCash: '1000.10',
    });
    const row = await prisma.cashSession.findUniqueOrThrow({ where: { id } });
    expect(row.difference?.toFixed(2)).toBe('0.00');
  });

  it('un centavo de faltante se informa tal cual: -0,01', async () => {
    const id = (await openCash(w, w.employee, '0.10')).id;
    await movement('IN', 'OTHER', '0.20');
    const res = await close(id, { countedCash: '0.29' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '0.30', difference: '-0.01' });
  });
});

describe('anulación y cierre a la vez (caja.md 6)', () => {
  it('anular una venta de otra caja mientras se cierra la abierta: la devolución queda en la que se cierra y en su esperado, o la anulación recibe 422; nunca en una caja cerrada', async () => {
    for (let round = 0; round < 3; round++) {
      const c1 = (await openCash(w, w.employee, '1000')).id;
      const saleId = (await w.client.post('/api/sales', example2(w), w.manager)).body.sale
        .id as number;
      expect((await close(c1, { countedCash: '5500' }, w.manager)).status).toBe(200);
      const c2 = (await openCash(w, w.employee, '1000')).id;

      const [voided, closed] = await Promise.all([
        w.client.post(`/api/sales/${saleId}/void`, { reason: 'Se arrepintió' }, w.manager),
        close(c2, { countedCash: '0' }, w.owner),
      ]);
      expect(closed.status).toBe(200);
      const refunds = await prisma.cashMovement.findMany({ where: { reason: 'SALE_VOID_REFUND' } });
      if (voided.status === 200) {
        // La devolución entró en la caja que se cerraba y el esperado guardado la incluye.
        expect(refunds).toHaveLength(1);
        expect(refunds[0]?.cashSessionId).toBe(c2);
        expect(closed.body.expectedCash).toBe('-3500.00'); // 1.000 - 4.500
      } else {
        expect(voided.status).toBe(422);
        expect(voided.body.error.code).toBe('CASH_SESSION_REQUIRED');
        expect(refunds).toHaveLength(0);
        expect(closed.body.expectedCash).toBe('1000.00');
      }
      // Foto fija: lo guardado coincide con lo que da la cuenta hoy (9.3).
      const d = await detail(c2);
      expect(d.body.summary.expectedCash).toBe(d.body.expectedCash);
      // Limpieza para la vuelta siguiente (una sola caja abierta a la vez).
      await prisma.cashMovement.deleteMany();
      await prisma.salePayment.deleteMany();
      await prisma.stockMovement.deleteMany();
      await prisma.saleItem.deleteMany();
      await prisma.sale.deleteMany();
      await prisma.cashSession.updateMany({ data: { previousCashSessionId: null } });
      await prisma.cashSession.deleteMany();
    }
  });
});

describe('el empleado cuando otro le cierra la caja', () => {
  it('current pasa a null y canClose a false; si reintenta cerrarla recibe 409 con quién la cerró, sin arqueo', async () => {
    const id = (await openCash(w, w.employee, '5000')).id;
    expect((await close(id, { countedCash: '4000' }, w.manager)).status).toBe(200);

    const current = await w.client.get('/api/cash-sessions/current', w.employee);
    expect(current.body).toMatchObject({ cashSession: null, canClose: false });

    const again = await close(id, { countedCash: '5000' }, w.employee);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CASH_SESSION_ALREADY_CLOSED');
    expect(again.body.error.details.closedBy.id).toBe(
      (await prisma.cashSession.findUniqueOrThrow({ where: { id } })).closedById,
    );
    const text = JSON.stringify(again.body);
    for (const key of ['expectedCash', 'difference', 'openingCash', 'countedCash']) {
      expect(text).not.toContain(key);
    }
    // El contado del encargado no se pisó.
    expect(
      (await prisma.cashSession.findUniqueOrThrow({ where: { id } })).countedCash?.toFixed(2),
    ).toBe('4000.00');
  });
});
