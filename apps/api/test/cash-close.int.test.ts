// Etapa 4: cierre a ciegas, arqueo, movimientos, notas, detalle y lista (docs/api/caja.md 9 a 14).
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { findKeys, PASSWORD, seedUser } from './catalog-helpers';
import { sessionCookie } from './helpers';
import { getCurrent, warnStaleCashSessions } from '../src/modules/cash/cash.service';
import { example2, openCash, saleBody, setupSalesWorld, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
});
afterAll(() => prisma.$disconnect());

/** Lo que el empleado nunca puede recibir (caja.md 2.1). `countedCash` sí: es su propio dato. */
const FORBIDDEN_FOR_EMPLOYEE = [
  'openingCash',
  'expectedCash',
  'difference',
  'summary',
  'paymentSummary',
  'cashSales',
  'cashIn',
  'cashOut',
  'voidRefunds',
  'movements',
  'notes',
  'previousClosing',
];

const open = (shift: string, openingCash: string, cookie = w.employee) =>
  w.client.post('/api/cash-sessions', { shift, openingCash }, cookie);
const close = (id: number | string, body: unknown, cookie = w.employee, client = w.client) =>
  client.post(`/api/cash-sessions/${id}/close`, body, cookie);
const detail = (id: number, cookie = w.manager) => w.client.get(`/api/cash-sessions/${id}`, cookie);
const movement = (body: unknown, cookie = w.manager, client = w.client) =>
  client.post('/api/cash-movements', body, cookie);
const expense = (amount: string, description = 'Pago limpieza') =>
  movement({ direction: 'OUT', reason: 'EXPENSE', description, amount });

/** Venta de un ítem "Varios" pagada con un solo medio. */
const sellWith = (
  method: keyof SalesWorld['pm'],
  amount: string,
  cookie = w.manager,
  extra: Record<string, unknown> = {},
) =>
  w.client.post(
    '/api/sales',
    saleBody({
      items: [{ productId: w.misc.id, quantity: '1', unitPrice: amount }],
      payments: [{ paymentMethodId: w.pm[method], amount }],
      expectedTotal: amount,
      ...extra,
    }),
    cookie,
  );

const stored = (id: number) => prisma.cashSession.findUniqueOrThrow({ where: { id } });

describe('calculo del esperado con ventas reales (ejemplos A a D del contrato)', () => {
  it('A (plan): 5.000 + 3.000 efectivo − 500 gasto = 7.500; el empleado cuenta 7.400 y ve solo lo suyo', async () => {
    const opened = await open('AFTERNOON', '5000');
    const id = opened.body.id as number;
    expect((await sellWith('CASH', '3000', w.employee)).status).toBe(201);
    expect((await sellWith('DEBIT_CARD', '2000', w.employee)).status).toBe(201);
    expect((await expense('500')).status).toBe(201);

    const res = await close(id, { countedCash: '7400' });
    expect(res.status).toBe(200);
    // Respuesta pública, campo por campo (caja.md 10.6).
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'id',
        'shift',
        'businessDate',
        'status',
        'openedAt',
        'openedBy',
        'closedAt',
        'closedBy',
        'countedCash',
      ].sort(),
    );
    expect(res.body).toMatchObject({
      id,
      status: 'CLOSED',
      countedCash: '7400.00',
      closedBy: { id: w.employeeId },
    });
    expect(findKeys(res.body, FORBIDDEN_FOR_EMPLOYEE)).toEqual([]);

    const row = await stored(id);
    expect(row.expectedCash?.toFixed(2)).toBe('7500.00');
    expect(row.difference?.toFixed(2)).toBe('-100.00');

    // El encargado lo ve en el detalle (mismo que el de la respuesta del cierre).
    const d = await detail(id);
    expect(d.status).toBe(200);
    expect(d.body).toMatchObject({
      openingCash: '5000.00',
      countedCash: '7400.00',
      expectedCash: '7500.00',
      difference: '-100.00',
      closingNote: null,
      summary: {
        openingCash: '5000.00',
        cashSales: '3000.00',
        cashIn: '0.00',
        cashOut: '500.00',
        voidRefunds: '0.00',
        expectedCash: '7500.00',
      },
      sales: { count: 2, voidedCount: 0, total: '5000.00', voidedTotal: '0.00' },
    });
    expect(d.body.paymentSummary).toEqual([
      expect.objectContaining({
        paymentMethod: expect.objectContaining({ kind: 'CASH' }),
        paymentCount: 1,
        chargedAmount: '3000.00',
      }),
      expect.objectContaining({
        paymentMethod: expect.objectContaining({ kind: 'DEBIT_CARD' }),
        chargedAmount: '2000.00',
      }),
    ]);
    expect(d.body.movements).toHaveLength(1);
    expect(d.body.movements[0]).toMatchObject({
      direction: 'OUT',
      reason: 'EXPENSE',
      description: 'Pago limpieza',
      amount: '500.00',
      user: { id: w.managerId },
      sale: null,
      supplierAccountEntryId: null,
    });

    const [log] = await prisma.auditLog.findMany({ where: { action: 'CASH_SESSION_CLOSE' } });
    expect(log).toMatchObject({
      userId: w.employeeId,
      entityType: 'CashSession',
      channel: 'LOCAL',
    });
    expect(log?.entityId).toBe(String(id));
    expect(log?.details).toMatchObject({
      countedCash: '7400.00',
      expectedCash: '7500.00',
      difference: '-100.00',
      summary: { openingCash: '5000.00', cashSales: '3000.00', cashIn: '0.00', cashOut: '500.00' },
    });
  });

  it('el encargado que cierra recibe el detalle completo con esperado y diferencia', async () => {
    const id = (await openCash(w, w.employee, '5000')).id;
    await sellWith('CASH', '3000');
    const res = await close(id, { countedCash: '8000.00' }, w.manager);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      openingCash: '5000.00',
      expectedCash: '8000.00',
      difference: '0.00',
    });
    expect(res.body.summary.cashSales).toBe('3000.00');
  });

  it('B (vuelto): el pago en efectivo es lo que queda en la caja (4.647), no lo entregado', async () => {
    const id = (await openCash(w, w.employee, '5000')).id;
    expect((await sellWith('CASH', '4647', w.manager, { cashTendered: '5000' })).status).toBe(201);
    const res = await close(id, { countedCash: '9647' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '9647.00', difference: '0.00' });
  });

  it('D (mixto con recargo): efectivo 4.500 + crédito 4.500 (+500 de recargo) con 2.000 iniciales -> esperado 6.500', async () => {
    const id = (await openCash(w, w.employee, '2000')).id;
    expect((await w.client.post('/api/sales', example2(w), w.manager)).status).toBe(201);
    const res = await close(id, { countedCash: '6500' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '6500.00', difference: '0.00' });
    expect(res.body.sales).toMatchObject({ count: 1, total: '9500.00', surchargeAmount: '500.00' });
    const credit = res.body.paymentSummary.find(
      (p: { paymentMethod: { kind: string } }) => p.paymentMethod.kind === 'CREDIT_CARD',
    );
    expect(credit).toMatchObject({
      amount: '4500.00',
      surchargeAmount: '500.00',
      chargedAmount: '5000.00',
      voidedChargedAmount: '0.00',
    });
  });

  it('C (anulación de otro turno): la caja cerrada no cambia y la devolución sale de la abierta', async () => {
    const c1 = (await openCash(w, w.employee, '5000')).id;
    const sale = await w.client.post('/api/sales', example2(w), w.manager);
    const saleId = sale.body.sale.id as number;
    const closed1 = await close(c1, { countedCash: '9500' }, w.manager);
    expect(closed1.body.expectedCash).toBe('9500.00');

    const c2 = (await openCash(w, w.employee, '5000')).id;
    expect((await sellWith('CASH', '2000')).status).toBe(201);
    const voided = await w.client.post(
      `/api/sales/${saleId}/void`,
      { reason: 'Se arrepintió' },
      w.manager,
    );
    expect(voided.status).toBe(200);

    // 9.3: la caja #1 (cerrada) sigue dando exactamente el esperado guardado.
    const after1 = await detail(c1);
    expect(after1.body.summary.expectedCash).toBe(after1.body.expectedCash);
    expect(after1.body.expectedCash).toBe('9500.00');
    expect(after1.body.sales).toMatchObject({ count: 1, voidedCount: 1, voidedTotal: '9500.00' });
    const credit = after1.body.paymentSummary.find(
      (p: { paymentMethod: { kind: string } }) => p.paymentMethod.kind === 'CREDIT_CARD',
    );
    expect(credit.voidedChargedAmount).toBe('5000.00');

    // La #2: 5.000 + 2.000 − 4.500 = 2.500.
    const d2 = await detail(c2);
    expect(d2.body.summary).toMatchObject({ cashOut: '4500.00', voidRefunds: '4500.00' });
    expect(d2.body.summary.expectedCash).toBe('2500.00');
    expect(d2.body.movements[0]).toMatchObject({
      reason: 'SALE_VOID_REFUND',
      amount: '4500.00',
      sale: { id: saleId, cashSessionId: c1 },
    });
    const closed2 = await close(c2, { countedCash: '2500' }, w.manager);
    expect(closed2.body).toMatchObject({ expectedCash: '2500.00', difference: '0.00' });
  });

  it('misma caja: venta en efectivo y su anulación -> vuelve al efectivo inicial', async () => {
    const id = (await openCash(w, w.employee, '5000')).id;
    const sale = await sellWith('CASH', '3000');
    await w.client.post(`/api/sales/${sale.body.sale.id}/void`, { reason: 'Error' }, w.manager);
    const res = await close(id, { countedCash: '5000' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '5000.00', difference: '0.00' });
  });

  it('esperado negativo (H-53): abrir con $0, anular una venta en efectivo de otra caja y cerrar -> 200', async () => {
    const c1 = (await openCash(w, w.employee, '1000')).id;
    const saleId = (await sellWith('CASH', '4500')).body.sale.id as number;
    await close(c1, { countedCash: '5500' }, w.manager);
    const c2 = (await openCash(w, w.employee, '0')).id;
    await w.client.post(`/api/sales/${saleId}/void`, { reason: 'Error' }, w.manager);
    const res = await close(c2, { countedCash: '0' }, w.manager);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ expectedCash: '-4500.00', difference: '4500.00' });
    expect((await stored(c2)).expectedCash?.toFixed(2)).toBe('-4500.00');
  });
});

describe('POST /api/cash-sessions/:id/close', () => {
  it('cerrar dos veces -> 409 con quién y cuándo; no se pisan los números', async () => {
    const id = (await openCash(w)).id;
    expect((await close(id, { countedCash: '5000' })).status).toBe(200);
    const again = await close(id, { countedCash: '1' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CASH_SESSION_ALREADY_CLOSED');
    expect(again.body.error.details).toMatchObject({ closedBy: { id: w.employeeId } });
    expect(again.body.error.details.closedAt).toBeTruthy();
    expect((await stored(id)).countedCash?.toFixed(2)).toBe('5000.00');
    expect(await prisma.auditLog.count({ where: { action: 'CASH_SESSION_CLOSE' } })).toBe(1);
  });

  it('H-04 b: un encargado y el dueño cierran la caja que dejó abierta un empleado', async () => {
    for (const cookie of [w.manager, w.owner]) {
      const id = (await openCash(w, w.employee)).id;
      const res = await close(id, { countedCash: '5000' }, cookie);
      expect(res.status).toBe(200);
      expect(res.body.difference).toBe('0.00');
    }
  });

  it('H-04 b: un empleado NO cierra la caja que abrió otro (403) y la caja sigue abierta', async () => {
    const other = await seedUser(prisma, 'empleado2', 'EMPLOYEE');
    const login = await w.client.post('/api/auth/login', {
      username: 'empleado2',
      password: PASSWORD,
    });
    const cookie2 = sessionCookie(login);
    const id = (await openCash(w, w.manager)).id;
    const res = await close(id, { countedCash: '5000' }, cookie2);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await stored(id)).status).toBe('OPEN');
    expect(other.id).toBeGreaterThan(0);
  });

  it('contado $0 permitido (H-50) y nota de cierre opcional (se recorta; "" = sin nota)', async () => {
    const id = (await openCash(w)).id;
    const res = await close(
      id,
      { countedCash: '0', closingNote: '  Dos billetes rotos  ' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      countedCash: '0.00',
      difference: '-5000.00',
      closingNote: 'Dos billetes rotos',
    });
    const id2 = (await openCash(w)).id;
    const res2 = await close(id2, { countedCash: '5000', closingNote: '   ' }, w.manager);
    expect(res2.body.closingNote).toBeNull();
  });

  it('validación: contado inválido, esperado/diferencia mandados, nota larga, id raro -> 400 y no se guarda nada', async () => {
    const id = (await openCash(w)).id;
    const bad: unknown[] = [
      {},
      { countedCash: 7400 },
      { countedCash: '-1' },
      { countedCash: '10.123' },
      { countedCash: '7.400,00' },
      { countedCash: '100', expectedCash: '5000' },
      { countedCash: '100', difference: '0' },
      { countedCash: '100', paymentSummary: [] },
      { countedCash: '100', closingNote: 'x'.repeat(501) },
    ];
    for (const body of bad) {
      const res = await close(id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect((await close('abc', { countedCash: '1' })).status).toBe(400);
    expect((await stored(id)).status).toBe('OPEN');
  });

  it('caja inexistente -> 404', async () => {
    expect((await close(9999, { countedCash: '1' }, w.manager)).status).toBe(404);
  });

  it('desde la puerta remota: 403 LOCAL_ONLY (encargado y dueño) y la caja sigue abierta', async () => {
    const id = (await openCash(w)).id;
    for (const cookie of [w.remoteManager, w.remoteOwner]) {
      const res = await close(id, { countedCash: '5000' }, cookie, w.remote);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    expect((await stored(id)).status).toBe('OPEN');
  });

  it('sin sesión -> 401', async () => {
    const id = (await openCash(w)).id;
    expect((await close(id, { countedCash: '1' }, '')).status).toBe(401);
  });
});

describe('POST /api/cash-movements', () => {
  it('encargado y dueño: gasto, retiro y otro (OUT) y aporte (IN) -> 201 con auditoría', async () => {
    const id = (await openCash(w, w.employee, '1000')).id;
    const cases = [
      [{ direction: 'OUT', reason: 'EXPENSE', description: 'Limpieza', amount: '500' }, w.manager],
      [
        { direction: 'OUT', reason: 'OWNER_WITHDRAWAL', description: 'Retiro', amount: '200.50' },
        w.owner,
      ],
      [
        { direction: 'IN', reason: 'CASH_CONTRIBUTION', description: 'Cambio', amount: '1000' },
        w.manager,
      ],
      [{ direction: 'IN', reason: 'OTHER', description: 'Sobró', amount: '10' }, w.owner],
      [{ direction: 'OUT', reason: 'OTHER', description: 'Falta', amount: '5' }, w.owner],
    ] as const;
    for (const [body, cookie] of cases) {
      const res = await movement(body, cookie);
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        cashSessionId: id,
        ...body,
        amount: expect.stringMatching(/^\d+\.\d{2}$/),
        sale: null,
        supplierAccountEntryId: null,
      });
    }
    const logs = await prisma.auditLog.findMany({
      where: { action: { in: ['CASH_MOVEMENT_IN', 'CASH_MOVEMENT_OUT'] } },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((l) => l.action)).toEqual([
      'CASH_MOVEMENT_OUT',
      'CASH_MOVEMENT_OUT',
      'CASH_MOVEMENT_IN',
      'CASH_MOVEMENT_IN',
      'CASH_MOVEMENT_OUT',
    ]);
    expect(logs[0]).toMatchObject({ entityType: 'CashMovement', userId: w.managerId });
    expect(logs[0]?.details).toMatchObject({
      cashSessionId: id,
      reason: 'EXPENSE',
      description: 'Limpieza',
      amount: '500.00',
    });
    // El cierre cuenta todo: 1.000 − 500 − 200,50 + 1.000 + 10 − 5 = 1.304,50.
    const res = await close(id, { countedCash: '1304.50' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '1304.50', difference: '0.00' });
    expect(res.body.summary).toMatchObject({ cashIn: '1010.00', cashOut: '705.50' });
  });

  it('el empleado -> 403 FORBIDDEN (aunque no haya caja); desde la remota el encargado -> 403 LOCAL_ONLY', async () => {
    await openCash(w);
    const body = { direction: 'OUT', reason: 'EXPENSE', description: 'x', amount: '1' };
    const emp = await movement(body, w.employee);
    expect(emp.status).toBe(403);
    expect(emp.body.error.code).toBe('FORBIDDEN');
    expect((await movement(body, w.employee, w.remote)).status).toBe(401);
    for (const cookie of [w.remoteManager, w.remoteOwner]) {
      const res = await movement(body, cookie, w.remote);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    expect(await prisma.cashMovement.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBeGreaterThan(0);
  });

  it('retiro del dueño como ingreso -> 400 en `direction`; gasto y aporte con el sentido cambiado también', async () => {
    await openCash(w);
    const res = await movement({
      direction: 'IN',
      reason: 'OWNER_WITHDRAWAL',
      description: 'x',
      amount: '10',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.fields).toEqual([
      { path: 'direction', message: 'Un retiro del dueño siempre es una salida.' },
    ]);
    for (const [direction, reason] of [
      ['IN', 'EXPENSE'],
      ['OUT', 'CASH_CONTRIBUTION'],
    ]) {
      const r = await movement({ direction, reason, description: 'x', amount: '10' });
      expect(r.status).toBe(400);
    }
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('SALE_VOID_REFUND y SUPPLIER_PAYMENT a mano -> 400 (el pago a proveedor es de la etapa 5)', async () => {
    await openCash(w);
    for (const reason of ['SALE_VOID_REFUND', 'SUPPLIER_PAYMENT']) {
      for (const direction of ['IN', 'OUT']) {
        const res = await movement({ direction, reason, description: 'x', amount: '10' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      }
    }
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('validación: descripción, monto y campos de más -> 400', async () => {
    await openCash(w);
    const base = { direction: 'OUT', reason: 'EXPENSE', description: 'Algo', amount: '10' };
    const bad = [
      { ...base, description: '   ' },
      { ...base, description: 'x'.repeat(201) },
      { ...base, amount: '0' },
      { ...base, amount: '-5' },
      { ...base, amount: 10 },
      { ...base, amount: '1.234' },
      { ...base, cashSessionId: 1 },
      { ...base, saleId: 1 },
      { ...base, userId: 1 },
      { direction: 'OUT', reason: 'EXPENSE', amount: '10' },
    ];
    for (const body of bad) {
      expect((await movement(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await prisma.cashMovement.count()).toBe(0);
  });

  it('sin caja abierta -> 422 CASH_SESSION_REQUIRED (H-47); con la caja cerrada también', async () => {
    const body = { direction: 'OUT', reason: 'EXPENSE', description: 'x', amount: '10' };
    expect((await movement(body)).status).toBe(422);
    const id = (await openCash(w)).id;
    await close(id, { countedCash: '5000' });
    const res = await movement(body);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CASH_SESSION_REQUIRED');
  });

  it('una salida mayor al efectivo deja el esperado negativo y no se rechaza (H-53)', async () => {
    const id = (await openCash(w, w.employee, '100')).id;
    expect((await expense('900')).status).toBe(201);
    const res = await close(id, { countedCash: '0' }, w.manager);
    expect(res.body).toMatchObject({ expectedCash: '-800.00', difference: '800.00' });
  });
});

describe('POST /api/cash-sessions/:id/notes', () => {
  it('el encargado agrega una nota a una caja cerrada; también el dueño desde la puerta remota (REMOTE)', async () => {
    const id = (await openCash(w)).id;
    await close(id, { countedCash: '4900' });
    const res = await w.client.post(
      `/api/cash-sessions/${id}/notes`,
      { note: '  Juan avisó que dio mal un vuelto.  ' },
      w.manager,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cashSessionId: id,
      note: 'Juan avisó que dio mal un vuelto.',
      user: { id: w.managerId },
    });
    const remote = await w.remote.post(
      `/api/cash-sessions/${id}/notes`,
      { note: 'Desde casa' },
      w.remoteOwner,
    );
    expect(remote.status).toBe(201);
    const logs = await prisma.auditLog.findMany({
      where: { action: 'CASH_SESSION_NOTE' },
      orderBy: { id: 'asc' },
    });
    expect(logs.map((l) => l.channel)).toEqual(['LOCAL', 'REMOTE']);
    expect(logs[0]).toMatchObject({ entityType: 'CashSession', entityId: String(id) });
    expect(logs[0]?.details).toMatchObject({ cashSessionNoteId: res.body.id });
    // Aparecen en el detalle (de la más vieja a la más nueva) y en la lista.
    const d = await detail(id);
    expect(d.body.notes.map((n: { note: string }) => n.note)).toEqual([
      'Juan avisó que dio mal un vuelto.',
      'Desde casa',
    ]);
    const list = await w.client.get('/api/cash-sessions', w.manager);
    expect(list.body.items[0].noteCount).toBe(2);
    // El cierre no se tocó.
    expect((await stored(id)).countedCash?.toFixed(2)).toBe('4900.00');
  });

  it('empleado -> 403; caja abierta -> 409 CASH_SESSION_NOT_CLOSED; inexistente -> 404; nota inválida -> 400', async () => {
    const id = (await openCash(w)).id;
    const url = `/api/cash-sessions/${id}/notes`;
    expect((await w.client.post(url, { note: 'x' }, w.employee)).status).toBe(403);
    const open409 = await w.client.post(url, { note: 'x' }, w.manager);
    expect(open409.status).toBe(409);
    expect(open409.body.error.code).toBe('CASH_SESSION_NOT_CLOSED');
    expect(
      (await w.client.post('/api/cash-sessions/9999/notes', { note: 'x' }, w.manager)).status,
    ).toBe(404);
    await close(id, { countedCash: '5000' });
    for (const body of [{ note: '   ' }, { note: 'x'.repeat(501) }, { note: 'a', extra: 1 }, {}]) {
      expect((await w.client.post(url, body, w.manager)).status).toBe(400);
    }
    expect(await prisma.cashSessionNote.count()).toBe(0);
  });

  it('no hay rutas para editar ni borrar cierres, movimientos ni notas (PATCH/PUT/DELETE -> 404)', async () => {
    const id = (await openCash(w)).id;
    await expense('10');
    await close(id, { countedCash: '4990' });
    const note = await w.client.post(`/api/cash-sessions/${id}/notes`, { note: 'n' }, w.manager);
    const urls = [
      `/api/cash-sessions/${id}`,
      `/api/cash-sessions/${id}/close`,
      `/api/cash-sessions/${id}/notes`,
      `/api/cash-sessions/${id}/notes/${note.body.id}`,
      '/api/cash-movements/1',
      '/api/cash-movements',
    ];
    for (const url of urls) {
      for (const verb of ['patch', 'put', 'delete'] as const) {
        const res =
          verb === 'delete'
            ? await w.client.delete(url, w.owner)
            : await w.client[verb](url, { countedCash: '1' }, w.owner);
        expect([404, 405], `${verb} ${url}`).toContain(res.status);
      }
    }
    expect((await stored(id)).countedCash?.toFixed(2)).toBe('4990.00');
  });
});

describe('GET /api/cash-sessions/:id y lista', () => {
  it('detalle de una caja ABIERTA: esperado "hasta ahora" (H-52) y los guardados en null', async () => {
    const id = (await openCash(w, w.employee, '5000')).id;
    await sellWith('CASH', '3000');
    await expense('500');
    const res = await detail(id, w.owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'OPEN',
      countedCash: null,
      expectedCash: null,
      difference: null,
      closedAt: null,
      summary: { expectedCash: '7500.00' },
    });
  });

  it('empleado -> 403 en detalle y lista (también cerrada); id inexistente 404; id raro 400; la ruta current no se toma como id', async () => {
    const id = (await openCash(w)).id;
    expect((await detail(id, w.employee)).status).toBe(403);
    expect((await w.client.get('/api/cash-sessions', w.employee)).status).toBe(403);
    expect((await detail(9999)).status).toBe(404);
    expect((await w.client.get('/api/cash-sessions/abc', w.manager)).status).toBe(400);
    expect((await w.client.get('/api/cash-sessions/current', w.manager)).status).toBe(200);
    // Por la puerta remota se puede mirar (access any).
    expect((await w.remote.get(`/api/cash-sessions/${id}`, w.remoteManager)).status).toBe(200);
  });

  it('lista: datos del cierre y filtros por turno, quién abrió/cerró, diferencia y estado', async () => {
    const a = (await openCash(w, w.employee, '100')).id; // MORNING (helper)
    await close(a, { countedCash: '100' }, w.manager); // sin diferencia
    const b = (await open('NIGHT', '100', w.manager)).body.id as number;
    await close(b, { countedCash: '90' }, w.owner); // faltante
    const c = (await open('AFTERNOON', '100', w.manager)).body.id as number; // abierta

    const ids = async (qs: string) =>
      (
        (await w.client.get(`/api/cash-sessions${qs}`, w.manager)).body.items as { id: number }[]
      ).map((i) => i.id);
    expect(await ids('')).toEqual([c, b, a]);
    expect(await ids('?hasDifference=true')).toEqual([b]);
    expect(await ids('?hasDifference=false')).toEqual([a]);
    expect(await ids('?hasDifference=true&status=OPEN')).toEqual([]);
    expect(await ids('?shift=NIGHT')).toEqual([b]);
    expect(await ids(`?openedById=${w.managerId}`)).toEqual([c, b]);
    expect(await ids(`?closedById=${w.ownerId}`)).toEqual([b]);
    expect((await w.client.get('/api/cash-sessions?hasDifference=si', w.manager)).status).toBe(400);

    const list = await w.client.get('/api/cash-sessions', w.owner);
    expect(list.body.items[1]).toMatchObject({
      id: b,
      countedCash: '90.00',
      expectedCash: '100.00',
      difference: '-10.00',
      noteCount: 0,
    });
    expect(list.body.items[0]).toMatchObject({
      id: c,
      countedCash: null,
      expectedCash: null,
      difference: null,
    });
  });
});

describe('GET /api/cash-sessions/current (etapa 4)', () => {
  it('canClose: encargado y dueño sí; el empleado solo si abrió él; sin caja, false', async () => {
    const none = await w.client.get('/api/cash-sessions/current', w.manager);
    expect(none.body).toMatchObject({
      cashSession: null,
      isFromPreviousBusinessDay: false,
      canClose: false,
    });
    await openCash(w, w.manager);
    const can = async (cookie: string) =>
      (await w.client.get('/api/cash-sessions/current', cookie)).body.canClose;
    expect(await can(w.employee)).toBe(false);
    expect(await can(w.manager)).toBe(true);
    expect(await can(w.owner)).toBe(true);
  });

  it('H-51 c: encargado y dueño ven lo contado en el cierre anterior; el empleado no', async () => {
    const a = (await openCash(w, w.employee, '100')).id;
    await close(a, { countedCash: '95.50' }, w.manager);
    for (const cookie of [w.manager, w.owner]) {
      const res = await w.client.get('/api/cash-sessions/current', cookie);
      expect(res.body.previousClosing).toMatchObject({ cashSessionId: a, countedCash: '95.50' });
    }
    const emp = await w.client.get('/api/cash-sessions/current', w.employee);
    expect(emp.body).not.toHaveProperty('previousClosing');
    // Con una caja abierta, "anterior" es la cerrada antes de ella; y en el detalle también.
    const b = (await openCash(w, w.employee, '200')).id;
    const cur = await w.client.get('/api/cash-sessions/current', w.manager);
    expect(cur.body.previousClosing.cashSessionId).toBe(a);
    expect((await detail(b)).body.previousClosing.countedCash).toBe('95.50');
    expect((await detail(a)).body.previousClosing).toBeNull();
  });

  it('isFromPreviousBusinessDay con relojes simulados (corte 06:00, hora de Buenos Aires)', async () => {
    const id = (await openCash(w, w.employee)).id;
    await prisma.cashSession.update({
      where: { id },
      data: { businessDate: new Date('2026-11-25T00:00:00Z') },
    });
    const ctx = { prisma } as never;
    const user = { id: w.employeeId, role: 'EMPLOYEE' as const };
    // 02:30 del 26/11 (05:30 UTC): todavía es el día de trabajo 25.
    const before = await getCurrent(ctx, user, new Date('2026-11-26T05:30:00Z'));
    expect(before).toMatchObject({
      currentBusinessDate: '2026-11-25',
      isFromPreviousBusinessDay: false,
    });
    // 08:00 del 26/11 (11:00 UTC): ya es el 26 y la caja quedó del día anterior.
    const after = await getCurrent(ctx, user, new Date('2026-11-26T11:00:00Z'));
    expect(after).toMatchObject({
      currentBusinessDate: '2026-11-26',
      isFromPreviousBusinessDay: true,
      canClose: true,
    });
  });

  it('NF-18: al arrancar se deja un warn por cada caja abierta de un día anterior (y no cierra nada)', async () => {
    const logger = { warn: vi.fn() } as never;
    expect(await warnStaleCashSessions(prisma, logger)).toBe(0);
    const id = (await openCash(w, w.employee)).id;
    expect(await warnStaleCashSessions(prisma, logger)).toBe(0);
    await prisma.cashSession.update({
      where: { id },
      data: { businessDate: new Date('2020-01-01T00:00:00Z') },
    });
    expect(await warnStaleCashSessions(prisma, logger)).toBe(1);
    const warn = (logger as unknown as { warn: ReturnType<typeof vi.fn> }).warn;
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatchObject({
      cashSessionId: id,
      shift: 'MORNING',
      businessDate: '2020-01-01',
      openedBy: 'Usuario empleado',
    });
    expect((await stored(id)).status).toBe('OPEN');
  });
});

describe('el empleado nunca recibe esperado, diferencia ni resúmenes (caja.md 2.1)', () => {
  it('recorre todas las respuestas del empleado, errores incluidos, buscando las claves prohibidas', async () => {
    const seen: { name: string; status: number; body: unknown }[] = [];
    const record = async (name: string, p: Promise<{ status: number; body: unknown }>) => {
      const r = await p;
      seen.push({ name, status: r.status, body: r.body });
      return r;
    };
    const emp = w.employee;

    await record('current sin caja', w.client.get('/api/cash-sessions/current', emp));
    const opened = await record('abrir', open('MORNING', '5000', emp));
    const id = (opened.body as { id: number }).id;
    await record('abrir 409', open('NIGHT', '1', emp));
    await record('abrir 400', open('LUNCH', '1', emp));
    await record('current con caja', w.client.get('/api/cash-sessions/current', emp));
    await sellWith('CASH', '3000', emp);
    await expense('500');
    await record('detalle 403', detail(id, emp));
    await record('lista 403', w.client.get('/api/cash-sessions', emp));
    await record(
      'movimiento 403',
      movement({ direction: 'OUT', reason: 'EXPENSE', description: 'x', amount: '1' }, emp),
    );
    await record('nota 403', w.client.post(`/api/cash-sessions/${id}/notes`, { note: 'x' }, emp));
    await record('cierre 400', close(id, { countedCash: '1', expectedCash: '1' }, emp));
    await record('cierre 404', close(9999, { countedCash: '1' }, emp));
    await record('venta', sellWith('CASH', '10', emp));
    const closed = await record('cierre', close(id, { countedCash: '7400' }, emp));
    expect(closed.status).toBe(200);
    await record('cierre 409', close(id, { countedCash: '7400' }, emp));
    await record('current cerrada', w.client.get('/api/cash-sessions/current', emp));
    await record('venta sin caja', sellWith('CASH', '10', emp));
    // Una caja abierta por otro y cerrada por el empleado ajeno -> 403.
    const other = (await openCash(w, w.manager, '123')).id;
    await record('cierre ajeno 403', close(other, { countedCash: '1' }, emp));
    await record('current ajena', w.client.get('/api/cash-sessions/current', emp));
    await record('open 409 ajena', open('NIGHT', '1', emp));

    for (const s of seen) {
      expect(findKeys(s.body, FORBIDDEN_FOR_EMPLOYEE), `${s.name} (${s.status})`).toEqual([]);
      // Tampoco por el texto: ni el efectivo inicial de la ajena ni el esperado.
      const text = JSON.stringify(s.body);
      expect(text, s.name).not.toMatch(/7500|-100\.00|123\.00/);
    }
    // El cierre del empleado trae solo su propio contado.
    expect(seen.find((s) => s.name === 'cierre')?.body).toMatchObject({ countedCash: '7400.00' });
  });
});

describe('concurrencia: el cierre contra ventas, movimientos y otro cierre', () => {
  it('venta(s) y cierre a la vez: cada venta queda en la caja y en el esperado, o recibe 422; nunca una venta en una caja cerrada', async () => {
    for (let round = 0; round < 4; round++) {
      const id = (await openCash(w, w.employee, '1000')).id;
      const results = await Promise.all([
        ...[1, 2, 3].map(() => sellWith('CASH', '100')),
        close(id, { countedCash: '1000' }, w.manager),
        ...[1, 2, 3].map(() => sellWith('CASH', '100', w.owner)),
        expense('50'),
      ]);
      const closeRes = results[3]!;
      expect(closeRes.status).toBe(200);
      const sales = [results[0]!, results[1]!, results[2]!, results[4]!, results[5]!, results[6]!];
      const okSales = sales.filter((r) => r.status === 201);
      for (const r of sales.filter((x) => x.status !== 201)) {
        expect(r.status).toBe(422);
        expect(r.body.error.code).toBe('CASH_SESSION_REQUIRED');
      }
      const row = await stored(id);
      const saved = await prisma.sale.findMany({ where: { cashSessionId: id } });
      // Las ventas guardadas en esta caja son exactamente las que respondieron 201...
      expect(saved).toHaveLength(okSales.length);
      // ...y todas se hicieron antes del cierre.
      for (const s of saved)
        expect(s.createdAt.getTime()).toBeLessThanOrEqual(row.closedAt!.getTime());
      const mv = await prisma.cashMovement.findMany({ where: { cashSessionId: id } });
      expect(mv.length).toBe(results[7]!.status === 201 ? 1 : 0);
      if (results[7]!.status !== 201) expect(results[7]!.status).toBe(422);
      // El esperado guardado es la cuenta de lo que realmente quedó en la caja.
      const expected = 1000 + saved.length * 100 - mv.length * 50;
      expect(row.expectedCash?.toFixed(2)).toBe(`${expected}.00`);
      expect((await detail(id)).body.summary.expectedCash).toBe(`${expected}.00`);
      await prisma.cashMovement.deleteMany();
      await prisma.salePayment.deleteMany();
      await prisma.stockMovement.deleteMany();
      await prisma.saleItem.deleteMany();
      await prisma.sale.deleteMany();
    }
  });

  it('dos cierres a la vez (encargado y dueño): uno 200 y el otro 409; queda el conteo del ganador', async () => {
    for (let round = 0; round < 3; round++) {
      const id = (await openCash(w, w.employee, '1000')).id;
      const [a, b] = await Promise.all([
        close(id, { countedCash: '1' }, w.manager),
        close(id, { countedCash: '2' }, w.owner),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const winner = a.status === 200 ? a : b;
      const loser = a.status === 200 ? b : a;
      expect(loser.body.error.code).toBe('CASH_SESSION_ALREADY_CLOSED');
      expect((await stored(id)).countedCash?.toFixed(2)).toBe(winner.body.countedCash);
      expect(
        await prisma.auditLog.count({
          where: { action: 'CASH_SESSION_CLOSE', entityId: String(id) },
        }),
      ).toBe(1);
    }
  });
});

describe('topes de importes (hallazgo de seguridad: cierre trabado por desborde)', () => {
  const TOO_BIG = '1000000000'; // 10 dígitos enteros

  it('el tope de 9 enteros rechaza con 400 en apertura, cierre, movimiento y venta', async () => {
    const o = await open('MORNING', '999999999999.99');
    expect(o.status).toBe(400);
    expect(o.body.error.details.fields[0].path).toBe('openingCash');
    expect(o.body.error.details.fields[0].message).toContain('demasiado grande');

    const opened = await open('MORNING', '999999999.99');
    expect(opened.status).toBe(201);
    expect((await close(opened.body.id, { countedCash: TOO_BIG })).status).toBe(400);
    expect(
      (await movement({ direction: 'IN', reason: 'OTHER_IN', description: 'x', amount: TOO_BIG }))
        .status,
    ).toBe(400);
    expect((await sellWith('CASH', TOO_BIG)).status).toBe(400);
    expect((await sellWith('CASH', '999999999999')).status).toBe(400);
  });

  it('con montos grandes pero válidos el cierre funciona (no 500)', async () => {
    const opened = await open('MORNING', '999999999');
    expect(opened.status).toBe(201);
    for (let i = 0; i < 3; i++) expect((await sellWith('CASH', '999999999')).status).toBe(201);
    // 999.999.999 de apertura + 3 ventas en efectivo de 999.999.999 = 3.999.999.996
    const res = await close(opened.body.id, { countedCash: '999999999' });
    expect(res.status).toBe(200);
    const row = await prisma.cashSession.findUniqueOrThrow({ where: { id: opened.body.id } });
    expect(row.expectedCash?.toFixed(2)).toBe('3999999996.00');
    expect(row.difference?.toFixed(2)).toBe('-2999999997.00');
  });
});
