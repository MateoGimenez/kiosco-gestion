// Devolución del proveedor (docs/api/proveedores.md 15, H-65 a H-71): ejemplo H y casos de 15.10.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { todayInBuenosAires } from '../src/lib/dates';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { closeCash, openCash, setupSalesWorld, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
let supplierId: number;

beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
  const res = await w.client.post('/api/suppliers', { name: 'Distribuidora Sur' }, w.manager);
  expect(res.status).toBe(201);
  supplierId = res.body.id;
});
afterAll(() => prisma.$disconnect());

const refundUrl = () => `/api/suppliers/${supplierId}/refunds`;
const refund = (b: Record<string, unknown>, cookie = w.manager, client = w.client) =>
  client.post(refundUrl(), { clientRequestId: randomUUID(), ...b }, cookie);
const pay = (b: Record<string, unknown>, cookie = w.manager, client = w.client) =>
  client.post(
    `/api/suppliers/${supplierId}/payments`,
    { clientRequestId: randomUUID(), ...b },
    cookie,
  );
const balance = async () =>
  (await w.client.get(`/api/suppliers/${supplierId}`, w.manager)).body.balance as string;
const expectedCash = async (id: number) =>
  (await w.client.get(`/api/cash-sessions/${id}`, w.manager)).body.summary.expectedCash as string;
/** Deja el saldo en −15.000 con un saldo inicial negativo (el dueño). */
const giveCredit = async (amount = '-15000') =>
  expect(
    (
      await w.client.post(
        `/api/suppliers/${supplierId}/opening-balance`,
        { amount, entryDate: '2026-10-01' },
        w.owner,
      )
    ).status,
  ).toBe(201);
const counts = async () => ({
  entries: await prisma.supplierAccountEntry.count({ where: { type: 'REFUND' } }),
  moves: await prisma.cashMovement.count({ where: { reason: 'SUPPLIER_REFUND' } }),
  audits: await prisma.auditLog.count({ where: { action: 'SUPPLIER_REFUND' } }),
});

describe('ejemplo H (proveedores.md 15.11)', () => {
  it('compra 40.300, pagos 10.000 (transferencia) y 5.000 (caja), anulación y devolución de 15.000 a la caja', async () => {
    const cash = await openCash(w); // abre con $ 5.000
    const purchase = await w.client.post(
      '/api/purchases',
      {
        clientRequestId: randomUUID(),
        supplierId,
        documentType: 'INVOICE',
        documentNumber: '0003-00012350',
        documentDate: '2026-11-01',
        otherChargesAmount: '1100',
        items: [
          {
            productId: w.coke.id,
            quantityMode: 'PACK',
            packCount: '2',
            unitsPerPack: '12',
            packNetCost: '10000',
            vatRatePercent: '21',
          },
          {
            productId: w.alfajor.id,
            quantityMode: 'UNIT',
            quantity: '10',
            unitNetCost: '1500',
            vatRatePercent: '0',
          },
        ],
      },
      w.manager,
    );
    expect(purchase.body.purchase.total).toBe('40300.00');
    expect((await pay({ amount: '10000', source: 'BANK_TRANSFER' })).status).toBe(201);
    expect((await pay({ amount: '5000', source: 'CASH_REGISTER' })).status).toBe(201);
    await w.client.post(
      `/api/purchases/${purchase.body.purchase.id}/void`,
      { reason: 'Error de carga' },
      w.manager,
    );
    expect(await balance()).toBe('-15000.00');
    expect(await expectedCash(cash.id)).toBe('0.00');

    const res = await refund({
      amount: '15000',
      source: 'CASH_REGISTER',
      description: 'Devuelve lo pagado de la compra #22 (anulada)',
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toMatchObject({
      balance: '0.00',
      isReplay: false,
      entry: {
        type: 'REFUND',
        amount: '15000.00',
        balanceAfter: '0.00',
        paymentSource: 'CASH_REGISTER',
        purchase: null,
        cashMovement: { cashSessionId: cash.id },
      },
      cashMovement: {
        direction: 'IN',
        reason: 'SUPPLIER_REFUND',
        amount: '15000.00',
        cashSessionId: cash.id,
        supplier: { id: supplierId, name: 'Distribuidora Sur' },
        description: 'Devuelve lo pagado de la compra #22 (anulada)',
      },
    });
    expect(res.body.cashMovement.supplierAccountEntryId).toBe(res.body.entry.id);
    expect(await expectedCash(cash.id)).toBe('15000.00');

    // La cuenta y la caja muestran los tipos nuevos.
    const account = await w.client.get(
      `/api/suppliers/${supplierId}/account?type=REFUND`,
      w.manager,
    );
    expect(account.body.items).toHaveLength(1);
    expect(account.body.items[0]).toMatchObject({ type: 'REFUND', amount: '15000.00' });
    const detail = await w.client.get(`/api/cash-sessions/${cash.id}`, w.manager);
    const reasons = (detail.body.movements as { reason: string }[]).map((m) => m.reason);
    expect(reasons).toContain('SUPPLIER_REFUND');

    // Auditoría: una sola fila SUPPLIER_REFUND y ningún CASH_MOVEMENT_IN aparte.
    const audit = await prisma.auditLog.findMany({ where: { action: 'SUPPLIER_REFUND' } });
    expect(audit).toHaveLength(1);
    expect(audit[0]!.entityType).toBe('Supplier');
    expect(audit[0]!.entityId).toBe(String(supplierId));
    expect(audit[0]!.details).toMatchObject({
      entryId: res.body.entry.id,
      amount: '15000.00',
      source: 'CASH_REGISTER',
      cashMovementId: res.body.cashMovement.id,
      cashSessionId: cash.id,
      balanceBefore: '-15000.00',
      balanceAfter: '0.00',
      confirmedExceedsCredit: false,
    });
    expect(await prisma.auditLog.count({ where: { action: 'CASH_MOVEMENT_IN' } })).toBe(0);

    // El cierre incluye el ingreso.
    const closed = await closeCash(w, cash.id, '15000');
    expect(closed).toMatchObject({ expectedCash: '15000.00', difference: '0.00' });
  });

  it('devolución parcial: saldo sigue a favor; transferencia no toca la caja', async () => {
    const cash = await openCash(w);
    await giveCredit();
    const res = await refund({ amount: '10000', source: 'BANK_TRANSFER', reference: 'NC 12' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ balance: '-5000.00', cashMovement: null });
    expect(res.body.entry).toMatchObject({ cashMovement: null, reference: 'NC 12' });
    expect(await expectedCash(cash.id)).toBe('5000.00');
    expect((await counts()).moves).toBe(0);
  });
});

describe('puerta remota', () => {
  it('efectivo de la caja desde la remota: 403 LOCAL_ONLY, ACCESS_DENIED y nada guardado', async () => {
    await openCash(w);
    await giveCredit();
    const res = await refund(
      { amount: '1000', source: 'CASH_REGISTER' },
      w.remoteManager,
      w.remote,
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('LOCAL_ONLY');
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBe(1);
    expect(await counts()).toEqual({ entries: 0, moves: 0, audits: 0 });
    expect(await balance()).toBe('-15000.00');
  });

  it('transferencia desde la remota funciona, con fecha pasada, y la caja no cambia', async () => {
    const cash = await openCash(w);
    await giveCredit();
    const res = await refund(
      { amount: '5000', source: 'BANK_TRANSFER', entryDate: '2026-11-01' },
      w.remoteManager,
      w.remote,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.entry.entryDate).toBe('2026-11-01');
    expect(await expectedCash(cash.id)).toBe('5000.00');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SUPPLIER_REFUND' } });
    expect(audit.channel).toBe('REMOTE');
  });
});

describe('caja y fechas', () => {
  it('sin caja abierta con efectivo de la caja: 422 CASH_SESSION_REQUIRED y nada guardado', async () => {
    await giveCredit();
    const res = await refund({ amount: '1000', source: 'CASH_REGISTER' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CASH_SESSION_REQUIRED');
    expect(await counts()).toEqual({ entries: 0, moves: 0, audits: 0 });
    // Sin caja, otros orígenes sí se pueden.
    expect((await refund({ amount: '1000', source: 'OTHER' })).status).toBe(201);
  });

  it('fecha pasada con efectivo de la caja: 422 REFUND_DATE_MUST_BE_TODAY; hoy y sin fecha, 201', async () => {
    await openCash(w);
    await giveCredit();
    const res = await refund({ amount: '1000', source: 'CASH_REGISTER', entryDate: '2026-01-01' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('REFUND_DATE_MUST_BE_TODAY');
    expect(
      (await refund({ amount: '1000', source: 'CASH_REGISTER', entryDate: todayInBuenosAires() }))
        .status,
    ).toBe(201);
    expect((await refund({ amount: '1000', source: 'CASH_REGISTER' })).status).toBe(201);
  });

  it('fecha futura con cualquier origen: 422 DATE_IN_FUTURE', async () => {
    for (const source of ['CASH_REGISTER', 'BANK_TRANSFER']) {
      const res = await refund({ amount: '1', source, entryDate: '2999-01-01' });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('DATE_IN_FUTURE');
    }
  });
});

describe('devolución mayor que el saldo a favor (H-68 b)', () => {
  it('sin confirmar: 422 con details y nada guardado; con confirmación y el mismo id: 201', async () => {
    await giveCredit();
    const id = randomUUID();
    const body = { clientRequestId: id, amount: '20000', source: 'BANK_TRANSFER' };
    const no = await w.client.post(refundUrl(), body, w.manager);
    expect(no.status).toBe(422);
    expect(no.body.error.code).toBe('REFUND_EXCEEDS_CREDIT');
    expect(no.body.error.details).toEqual({
      balance: '-15000.00',
      credit: '15000.00',
      amount: '20000.00',
      balanceAfter: '5000.00',
    });
    expect(await counts()).toEqual({ entries: 0, moves: 0, audits: 0 });
    const yes = await w.client.post(
      refundUrl(),
      { ...body, confirmExceedsCredit: true },
      w.manager,
    );
    expect(yes.status).toBe(201);
    expect(yes.body.balance).toBe('5000.00');
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: 'SUPPLIER_REFUND' } });
    expect(audit.details).toMatchObject({ confirmedExceedsCredit: true });
  });

  it('con saldo 0: 422 (credit 0) y con confirmación 201', async () => {
    const body = { amount: '100', source: 'OTHER' };
    const no = await refund(body);
    expect(no.status).toBe(422);
    expect(no.body.error.details).toMatchObject({ credit: '0.00', balanceAfter: '100.00' });
    expect((await refund({ ...body, confirmExceedsCredit: true })).status).toBe(201);
  });

  it('con deuda (compra corregida ya cargada): ejemplo H, saldo 25.300 -> 40.300', async () => {
    await w.client.post(
      `/api/suppliers/${supplierId}/opening-balance`,
      { amount: '25300', entryDate: '2026-10-01' },
      w.owner,
    );
    const no = await refund({ amount: '15000', source: 'BANK_TRANSFER' });
    expect(no.body.error.details).toEqual({
      balance: '25300.00',
      credit: '0.00',
      amount: '15000.00',
      balanceAfter: '40300.00',
    });
  });
});

describe('reintentos (15.5)', () => {
  it('dos veces el mismo pedido: 201 y 200 isReplay, un solo movimiento, un ingreso y una auditoría', async () => {
    await openCash(w);
    await giveCredit();
    const body = { clientRequestId: randomUUID(), amount: '3000', source: 'CASH_REGISTER' };
    const a = await w.client.post(refundUrl(), body, w.manager);
    const b = await w.client.post(refundUrl(), body, w.manager);
    expect([a.status, b.status]).toEqual([201, 200]);
    expect(b.body.isReplay).toBe(true);
    expect(b.body.entry.id).toBe(a.body.entry.id);
    expect(b.body.cashMovement.id).toBe(a.body.cashMovement.id);
    expect(await counts()).toEqual({ entries: 1, moves: 1, audits: 1 });
  });

  it('mismo id con otro monto u otro usuario: 409 REFUND_REQUEST_ID_REUSED con details', async () => {
    await giveCredit();
    const body = { clientRequestId: randomUUID(), amount: '3000', source: 'BANK_TRANSFER' };
    const a = await w.client.post(refundUrl(), body, w.manager);
    const diff = await w.client.post(refundUrl(), { ...body, amount: '3001' }, w.manager);
    expect(diff.status).toBe(409);
    expect(diff.body.error.code).toBe('REFUND_REQUEST_ID_REUSED');
    expect(diff.body.error.details.entryId).toBe(a.body.entry.id);
    expect(diff.body.error.details.createdAt).toBeTruthy();
    const otherUser = await w.client.post(refundUrl(), body, w.owner);
    expect(otherUser.status).toBe(409);
    expect(await counts()).toMatchObject({ entries: 1 });
  });

  it('el id de un pago no sirve para una devolución ni al revés', async () => {
    await giveCredit();
    const payId = randomUUID();
    const p = await pay({
      clientRequestId: payId,
      amount: '1000',
      source: 'OTHER',
      confirmOverpayment: true,
    });
    expect(p.status).toBe(201);
    const r = await w.client.post(
      refundUrl(),
      { clientRequestId: payId, amount: '1000', source: 'OTHER' },
      w.manager,
    );
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('REFUND_REQUEST_ID_REUSED');

    const refundId = randomUUID();
    expect(
      (
        await w.client.post(
          refundUrl(),
          { clientRequestId: refundId, amount: '500', source: 'OTHER' },
          w.manager,
        )
      ).status,
    ).toBe(201);
    const p2 = await pay({ clientRequestId: refundId, amount: '500', source: 'OTHER' });
    expect(p2.status).toBe(409);
    expect(p2.body.error.code).toBe('PAYMENT_REQUEST_ID_REUSED');
    expect(await prisma.supplierAccountEntry.count({ where: { type: 'PAYMENT' } })).toBe(1);
  });

  it('dos pedidos iguales a la vez: uno 201 y otro 200, un solo movimiento', async () => {
    await openCash(w);
    await giveCredit();
    const body = { clientRequestId: randomUUID(), amount: '2000', source: 'CASH_REGISTER' };
    const [a, b] = await Promise.all([
      w.client.post(refundUrl(), body, w.manager),
      w.client.post(refundUrl(), body, w.manager),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(await counts()).toEqual({ entries: 1, moves: 1, audits: 1 });
  });
});

describe('roles y proveedor', () => {
  it('empleado: 403; encargado desde la remota (transferencia) 201; sin sesión 401', async () => {
    const body = { amount: '1', source: 'OTHER', confirmExceedsCredit: true };
    expect((await refund(body, w.employee)).status).toBe(403);
    expect((await refund(body, w.employee)).body.error.code).toBe('FORBIDDEN');
    const remote = await refund(body, w.remoteManager, w.remote);
    expect(remote.status).toBe(201);
    expect((await refund({ amount: '1', source: 'OTHER' }, '')).status).toBe(401);
  });

  it('encargado y dueño pueden; proveedor desactivado también; inexistente 404', async () => {
    expect(
      (await refund({ amount: '1', source: 'OTHER', confirmExceedsCredit: true }, w.owner)).status,
    ).toBe(201);
    await w.client.patch(`/api/suppliers/${supplierId}`, { isActive: false }, w.manager);
    const res = await refund({ amount: '1', source: 'OTHER', confirmExceedsCredit: true });
    expect(res.status).toBe(201);
    const missing = await w.client.post(
      '/api/suppliers/99999/refunds',
      { clientRequestId: randomUUID(), amount: '1', source: 'OTHER' },
      w.manager,
    );
    expect(missing.status).toBe(404);
  });

  it('validación: purchaseId, monto inválido, número de JSON y sin clientRequestId -> 400', async () => {
    const ok = { amount: '10', source: 'OTHER' };
    for (const extra of [
      { purchaseId: 1 },
      { amount: '0' },
      { amount: '-5' },
      { amount: '1.234' },
      { amount: 10 },
      { source: 'CHEQUE' },
    ]) {
      const res = await refund({ ...ok, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const noId = await w.client.post(refundUrl(), ok, w.manager);
    expect(noId.status).toBe(400);
    expect(await counts()).toEqual({ entries: 0, moves: 0, audits: 0 });
  });
});

describe('caja a mano y rutas', () => {
  it('SUPPLIER_REFUND no se carga a mano: 400', async () => {
    await openCash(w);
    const res = await w.client.post(
      '/api/cash-movements',
      { direction: 'IN', reason: 'SUPPLIER_REFUND', description: 'x', amount: '100' },
      w.manager,
    );
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('no hay rutas de edición ni borrado de devoluciones', async () => {
    await giveCredit();
    const r = await refund({ amount: '100', source: 'OTHER' });
    const url = `${refundUrl()}/${r.body.entry.id}`;
    expect((await w.client.patch(url, {}, w.manager)).status).toBe(404);
    expect((await w.client.delete(url, w.manager)).status).toBe(404);
  });
});

describe('coherencia entre tablas', () => {
  it('cada SUPPLIER_REFUND apunta a un REFUND de la caja con el mismo monto, y cada REFUND de caja tiene un ingreso', async () => {
    await openCash(w);
    await giveCredit('-50000');
    await refund({ amount: '1000', source: 'CASH_REGISTER' });
    await refund({ amount: '2500.50', source: 'CASH_REGISTER' });
    await refund({ amount: '700', source: 'BANK_TRANSFER' });
    const moves = await prisma.cashMovement.findMany({ where: { reason: 'SUPPLIER_REFUND' } });
    expect(moves).toHaveLength(2);
    for (const m of moves) {
      const e = await prisma.supplierAccountEntry.findUniqueOrThrow({
        where: { id: m.supplierAccountEntryId! },
      });
      expect(e.type).toBe('REFUND');
      expect(e.paymentSource).toBe('CASH_REGISTER');
      expect(e.amount.toFixed(2)).toBe(m.amount.toFixed(2));
      expect(m.direction).toBe('IN');
    }
    const cashRefunds = await prisma.supplierAccountEntry.findMany({
      where: { type: 'REFUND', paymentSource: 'CASH_REGISTER' },
      include: { cashMovement: true },
    });
    expect(cashRefunds).toHaveLength(2);
    for (const e of cashRefunds) expect(e.cashMovement).not.toBeNull();
  });
});

describe('concurrencia con el cierre de caja', () => {
  it('una devolución en efectivo y un cierre a la vez: queda en la caja o 422, nunca en una caja cerrada', async () => {
    const cash = await openCash(w);
    await giveCredit();
    const [r, c] = await Promise.all([
      refund({ amount: '1000', source: 'CASH_REGISTER' }),
      w.client.post(`/api/cash-sessions/${cash.id}/close`, { countedCash: '0' }, w.manager),
    ]);
    expect([200, 201, 422]).toContain(r.status);
    expect(c.status).toBe(200);
    const session = await prisma.cashSession.findUniqueOrThrow({ where: { id: cash.id } });
    expect(session.status).toBe('CLOSED');
    const moves = await prisma.cashMovement.findMany({ where: { reason: 'SUPPLIER_REFUND' } });
    if (r.status === 201) {
      expect(moves).toHaveLength(1);
      // Si entró, el esperado del cierre ya lo incluía.
      expect(Number(c.body.expectedCash)).toBe(6000);
    } else {
      expect(r.body.error.code).toBe('CASH_SESSION_REQUIRED');
      expect(moves).toHaveLength(0);
    }
  });
});
