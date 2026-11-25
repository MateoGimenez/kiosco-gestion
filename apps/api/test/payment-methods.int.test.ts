// Etapa 3: medios de pago (docs/api/ventas.md, sección 5).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { setupSalesWorld, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
let w: SalesWorld;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupSalesWorld(prisma);
});
afterAll(() => prisma.$disconnect());

const patch = (id: number, body: unknown, cookie = w.owner) =>
  w.client.patch(`/api/payment-methods/${id}`, body, cookie);

describe('GET /api/payment-methods', () => {
  it('todos los roles ven los 5 medios en orden (con el 10 % del crédito)', async () => {
    for (const cookie of [w.employee, w.manager, w.owner]) {
      const res = await w.client.get('/api/payment-methods', cookie);
      expect(res.status).toBe(200);
      expect(res.body.items.map((m: { kind: string }) => m.kind)).toEqual([
        'CASH',
        'DEBIT_CARD',
        'CREDIT_CARD',
        'QR',
        'TRANSFER',
      ]);
      const credit = res.body.items.find((m: { kind: string }) => m.kind === 'CREDIT_CARD');
      expect(credit).toMatchObject({ name: 'Crédito', surchargePercent: '10.00', isActive: true });
      expect(res.body.items[0].surchargePercent).toBe('0.00');
    }
    expect((await w.client.get('/api/payment-methods')).status).toBe(401);
  });
});

describe('PATCH /api/payment-methods/:id', () => {
  it('encargado y empleado -> 403; solo el dueño configura', async () => {
    for (const cookie of [w.employee, w.manager]) {
      const res = await patch(w.pm.CREDIT_CARD, { surchargePercent: '5' }, cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
    expect(
      (
        await prisma.paymentMethod.findUniqueOrThrow({ where: { id: w.pm.CREDIT_CARD } })
      ).surchargePercent.toFixed(2),
    ).toBe('10.00');
  });

  it('el dueño cambia el recargo del crédito, con auditoría de antes y después', async () => {
    const res = await patch(w.pm.CREDIT_CARD, { surchargePercent: '12.5' });
    expect(res.status).toBe(200);
    expect(res.body.surchargePercent).toBe('12.50');
    const [log] = await prisma.auditLog.findMany({ where: { action: 'PAYMENT_METHOD_UPDATE' } });
    expect(log).toMatchObject({ entityType: 'PaymentMethod', userId: w.ownerId });
    expect(log?.details).toEqual({
      kind: 'CREDIT_CARD',
      before: { surchargePercent: '10.00' },
      after: { surchargePercent: '12.50' },
    });
  });

  it('el recargo solo en crédito: otro medio con recargo -> 422 SURCHARGE_NOT_ALLOWED (0 sí se acepta)', async () => {
    const res = await patch(w.pm.DEBIT_CARD, { surchargePercent: '3' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SURCHARGE_NOT_ALLOWED');
    expect((await patch(w.pm.DEBIT_CARD, { surchargePercent: '0' })).status).toBe(200);
  });

  it('H-38 a: el efectivo no se desactiva (CASH_METHOD_LOCKED) y no se guarda nada del pedido', async () => {
    const res = await patch(w.pm.CASH, { isActive: false, sortOrder: 9 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CASH_METHOD_LOCKED');
    const cash = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: w.pm.CASH } });
    expect(cash).toMatchObject({ isActive: true, sortOrder: 1 });
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_METHOD_UPDATE' } })).toBe(0);
  });

  it('los otros cuatro sí se desactivan y se ordenan; sin cambios: 200 sin auditar', async () => {
    const off = await patch(w.pm.QR, { isActive: false, sortOrder: 7 });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ isActive: false, sortOrder: 7 });
    const list = await w.client.get('/api/payment-methods', w.employee);
    expect(list.body.items.map((m: { kind: string }) => m.kind)).toEqual([
      'CASH',
      'DEBIT_CARD',
      'CREDIT_CARD',
      'TRANSFER',
      'QR',
    ]);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_METHOD_UPDATE' } })).toBe(1);
    expect((await patch(w.pm.QR, { isActive: false })).status).toBe(200);
    expect(await prisma.auditLog.count({ where: { action: 'PAYMENT_METHOD_UPDATE' } })).toBe(1);
  });

  it('validación: vacío, recargo > 100, campo desconocido (name, kind) -> 400; id inexistente -> 404', async () => {
    for (const body of [
      {},
      { surchargePercent: '101' },
      { name: 'X' },
      { kind: 'QR' },
      { sortOrder: -1 },
    ]) {
      expect((await patch(w.pm.CREDIT_CARD, body)).status).toBe(400);
    }
    expect((await patch(9999, { isActive: true })).status).toBe(404);
  });

  it('desde la puerta remota el dueño sí configura (access any, ADR 003 punto 6)', async () => {
    const res = await w.remote.patch(
      `/api/payment-methods/${w.pm.CREDIT_CARD}`,
      { surchargePercent: '8' },
      w.remoteOwner,
    );
    expect(res.status).toBe(200);
  });
});
