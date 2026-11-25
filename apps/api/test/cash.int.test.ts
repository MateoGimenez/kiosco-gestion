// Etapa 3: caja (docs/api/caja.md): abrir, ver la abierta y listar.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { findKeys } from './catalog-helpers';
import { closeCashInDb, openCash, setupSalesWorld, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
});
afterAll(() => prisma.$disconnect());

const open = (body: unknown, cookie = w.employee) =>
  w.client.post('/api/cash-sessions', body, cookie);

describe('GET /api/cash-sessions/current', () => {
  it('sin caja abierta: cashSession null (nunca 404) y el día de trabajo actual', async () => {
    const res = await w.client.get('/api/cash-sessions/current', w.employee);
    expect(res.status).toBe(200);
    expect(res.body.cashSession).toBeNull();
    expect(res.body.currentBusinessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('sin sesión: 401', async () => {
    expect((await w.client.get('/api/cash-sessions/current')).status).toBe(401);
  });

  it('H-40 a: el empleado NO ve el efectivo inicial; encargado y dueño sí', async () => {
    await openCash(w, w.manager, '5000');
    const emp = await w.client.get('/api/cash-sessions/current', w.employee);
    expect(emp.status).toBe(200);
    expect(emp.body.cashSession).toMatchObject({ shift: 'MORNING', status: 'OPEN' });
    expect(
      findKeys(emp.body, ['openingCash', 'closedAt', 'closedBy', 'expectedCash', 'countedCash']),
    ).toEqual([]);
    for (const cookie of [w.manager, w.owner]) {
      const res = await w.client.get('/api/cash-sessions/current', cookie);
      expect(res.body.cashSession.openingCash).toBe('5000.00');
      expect(res.body.cashSession.closedAt).toBeNull();
    }
  });
});

describe('POST /api/cash-sessions (abrir)', () => {
  it('el empleado abre la caja (paso 1 de "Cómo probarlo"): 201 sin efectivo inicial, con auditoría', async () => {
    const res = await open({ shift: 'MORNING', openingCash: '5000' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      shift: 'MORNING',
      status: 'OPEN',
      openedBy: { id: w.employeeId, fullName: 'Usuario empleado' },
    });
    expect(res.body.openingCash).toBeUndefined();
    const row = await prisma.cashSession.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.openingCash.toFixed(2)).toBe('5000.00');
    expect(res.body.businessDate).toBe(row.businessDate.toISOString().slice(0, 10));
    const [log] = await prisma.auditLog.findMany({ where: { action: 'CASH_SESSION_OPEN' } });
    expect(log).toMatchObject({
      userId: w.employeeId,
      entityType: 'CashSession',
      channel: 'LOCAL',
    });
    expect(log?.details).toMatchObject({ shift: 'MORNING', openingCash: '5000.00' });
  });

  it('el encargado y el dueño reciben openingCash', async () => {
    const res = await open({ shift: 'AFTERNOON', openingCash: '0' }, w.manager);
    expect(res.status).toBe(201);
    expect(res.body.openingCash).toBe('0.00');
  });

  it('la hora y el día los pone el servidor (no se aceptan campos de más)', async () => {
    for (const extra of [
      { openedAt: '2020-01-01T00:00:00.000Z' },
      { businessDate: '2020-01-01' },
      { status: 'CLOSED' },
    ]) {
      const res = await open({ shift: 'MORNING', openingCash: '1', ...extra });
      expect(res.status).toBe(400);
    }
    expect(await prisma.cashSession.count()).toBe(0);
  });

  it('validación: turno inválido, importe negativo, número de JSON o sin formato -> 400', async () => {
    for (const body of [
      { shift: 'LUNCH', openingCash: '1' },
      { shift: 'MORNING', openingCash: '-1' },
      { shift: 'MORNING', openingCash: 5000 },
      { shift: 'MORNING', openingCash: '5.000,50' },
      { shift: 'MORNING' },
    ]) {
      const res = await open(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('segunda apertura -> 409 CASH_SESSION_ALREADY_OPEN, con la caja abierta SIN efectivo inicial', async () => {
    const first = await open({ shift: 'MORNING', openingCash: '5000' }, w.manager);
    expect(first.status).toBe(201);
    const second = await open({ shift: 'NIGHT', openingCash: '1' }, w.owner);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('CASH_SESSION_ALREADY_OPEN');
    expect(second.body.error.details.cashSession).toMatchObject({
      id: first.body.id,
      shift: 'MORNING',
    });
    expect(findKeys(second.body, ['openingCash'])).toEqual([]);
    expect(await prisma.cashSession.count()).toBe(1);
  });

  it('carrera: dos aperturas a la vez -> una 201 y la otra 409; queda UNA sola caja abierta', async () => {
    for (let round = 0; round < 3; round++) {
      await prisma.cashSession.deleteMany();
      const results = await Promise.all([
        open({ shift: 'MORNING', openingCash: '100' }, w.employee),
        open({ shift: 'AFTERNOON', openingCash: '200' }, w.manager),
        open({ shift: 'NIGHT', openingCash: '300' }, w.owner),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
      for (const r of results.filter((x) => x.status === 409)) {
        expect(r.body.error.code).toBe('CASH_SESSION_ALREADY_OPEN');
      }
      expect(await prisma.cashSession.count({ where: { status: 'OPEN' } })).toBe(1);
    }
  });

  it('con la anterior cerrada (en la base) se puede abrir otra', async () => {
    const first = await openCash(w);
    await closeCashInDb(prisma, first.id, w.managerId);
    expect((await open({ shift: 'AFTERNOON', openingCash: '10' })).status).toBe(201);
  });

  it('desde la puerta remota: 403 LOCAL_ONLY (también encargado y dueño) y se audita ACCESS_DENIED', async () => {
    for (const cookie of [w.remoteManager, w.remoteOwner]) {
      const res = await w.remote.post(
        '/api/cash-sessions',
        { shift: 'MORNING', openingCash: '1' },
        cookie,
      );
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    expect(await prisma.cashSession.count()).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'ACCESS_DENIED' } })).toBeGreaterThan(0);
  });

  it('ver la caja abierta SÍ se puede desde afuera (access any)', async () => {
    await openCash(w);
    const res = await w.remote.get('/api/cash-sessions/current', w.remoteManager);
    expect(res.status).toBe(200);
    expect(res.body.cashSession.openingCash).toBe('5000.00');
  });
});

describe('GET /api/cash-sessions (lista)', () => {
  it('el empleado -> 403; encargado y dueño ven la lista paginada, la más nueva primero', async () => {
    const c1 = await openCash(w, w.manager, '100');
    await closeCashInDb(prisma, c1.id, w.managerId);
    const c2 = await openCash(w, w.manager, '200');
    expect((await w.client.get('/api/cash-sessions', w.employee)).status).toBe(403);
    for (const cookie of [w.manager, w.owner]) {
      const res = await w.client.get('/api/cash-sessions', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ page: 1, pageSize: 50, total: 2 });
      expect(res.body.items.map((i: { id: number }) => i.id)).toEqual([c2.id, c1.id]);
      expect(res.body.items[1]).toMatchObject({ status: 'CLOSED', openingCash: '100.00' });
      expect(res.body.items[1].closedBy).toMatchObject({ id: w.managerId });
    }
  });

  it('filtros: estado, día de trabajo (ambos incluidos) y from > to -> 400', async () => {
    const c1 = await openCash(w, w.manager);
    await closeCashInDb(prisma, c1.id, w.managerId);
    await prisma.cashSession.update({
      where: { id: c1.id },
      data: { businessDate: new Date('2026-01-10T00:00:00Z') },
    });
    const c2 = await openCash(w, w.manager);
    const byStatus = await w.client.get('/api/cash-sessions?status=OPEN', w.manager);
    expect(byStatus.body.items.map((i: { id: number }) => i.id)).toEqual([c2.id]);
    const byDay = await w.client.get('/api/cash-sessions?from=2026-01-10&to=2026-01-10', w.manager);
    expect(byDay.body.items.map((i: { id: number }) => i.id)).toEqual([c1.id]);
    expect(
      (await w.client.get('/api/cash-sessions?from=2026-02-01&to=2026-01-01', w.manager)).status,
    ).toBe(400);
    expect((await w.client.get('/api/cash-sessions?foo=1', w.manager)).status).toBe(400);
  });
});
