// Etapa 5, devolución del proveedor (H-65, docs/api/proveedores.md 15.7 y 15.10): los cinco CHECK nuevos o
// cambiados de supplier_account_entries y cash_movements atajan un dato inválido aunque el servicio fallara
// (se escribe directo con SQL, salteando la API).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedUser } from './catalog-helpers';

const prisma = createTestPrisma();
let userId: number;
let supplierId: number;
let sessionId: number;
let seq = 0;

beforeEach(async () => {
  await resetDatabase(prisma);
  userId = (await seedUser(prisma, 'dueno', 'OWNER')).id;
  supplierId = (await prisma.supplier.create({ data: { name: 'Distribuidora Sur' } })).id;
  sessionId = (
    await prisma.cashSession.create({
      data: {
        shift: 'MORNING',
        businessDate: new Date('2026-11-27'),
        openedById: userId,
        openingCash: '0',
      },
    })
  ).id;
});
afterAll(() => prisma.$disconnect());

/** Intenta un cambio directo y espera que la base lo rechace por la restricción indicada. */
async function rejects(promise: Promise<unknown>, constraint: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as Error,
  );
  expect(err, 'la base tendría que haber rechazado el dato').not.toBeNull();
  expect(`${err?.message} ${JSON.stringify(err)}`).toContain(constraint);
}

const HASH = 'a'.repeat(64);
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

/** Inserta un movimiento de cuenta; los valores por defecto forman una devolución válida. */
function entry(
  over: {
    type?: string;
    amount?: string;
    source?: string | null;
    purchaseId?: number | null;
    requestId?: string | null;
    hash?: string | null;
    description?: string | null;
  } = {},
) {
  const requestId = over.requestId === undefined ? uuid() : over.requestId;
  const hash = over.hash === undefined ? (requestId ? HASH : null) : over.hash;
  const source = over.source === undefined ? 'CASH_REGISTER' : over.source;
  return prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO supplier_account_entries
      (supplier_id, type, amount, entry_date, payment_source, purchase_id, client_request_id, request_hash, description, user_id)
    VALUES (${supplierId}, ${over.type ?? 'REFUND'}::supplier_entry_type, ${over.amount ?? '15000'}::numeric, '2026-11-27',
            ${source}::supplier_payment_source, ${over.purchaseId ?? null}, ${requestId}::uuid, ${hash}, ${over.description ?? null}, ${userId})
    RETURNING id`;
}

/** Inserta un movimiento de caja; los valores por defecto forman un SUPPLIER_REFUND válido. */
function cashMovement(over: { direction?: string; reason?: string; entryId?: number | null }) {
  return prisma.$executeRaw`
    INSERT INTO cash_movements (cash_session_id, direction, reason, description, amount, supplier_account_entry_id, user_id)
    VALUES (${sessionId}, ${over.direction ?? 'IN'}::cash_direction, ${over.reason ?? 'SUPPLIER_REFUND'}::cash_movement_reason,
            'Devolución', 15000, ${over.entryId ?? null}, ${userId})`;
}

describe('supplier_account_entries: REFUND', () => {
  it('una devolución válida pasa', async () => {
    const [row] = await entry();
    expect(row.id).toBeGreaterThan(0);
    // Con cualquiera de los 4 orígenes.
    await entry({ source: 'BANK_TRANSFER' });
    await entry({
      source: 'CASH_OUTSIDE_REGISTER',
      description: 'Devuelve lo pagado de la compra #22 (anulada)',
    });
  });

  it('con monto negativo o cero (supplier_account_entries_amount_check)', async () => {
    await rejects(entry({ amount: '-15000' }), 'supplier_account_entries_amount_check');
    await rejects(entry({ amount: '0' }), 'supplier_account_entries_amount_check');
  });

  it('sin origen de la plata (supplier_account_entries_amount_check)', async () => {
    await rejects(entry({ source: null }), 'supplier_account_entries_amount_check');
  });

  it('vinculada a una compra (supplier_account_entries_amount_check)', async () => {
    await rejects(entry({ purchaseId: 999 }), 'supplier_account_entries_amount_check');
  });

  it('sin client_request_id (supplier_account_entries_request_check)', async () => {
    await rejects(entry({ requestId: null, hash: null }), 'supplier_account_entries_request_check');
  });

  it('con id pero sin huella, o al revés (supplier_account_entries_request_check)', async () => {
    await rejects(entry({ hash: null }), 'supplier_account_entries_request_check');
  });

  it('el pago sigue valiendo: con su id y su huella, o sin ninguno', async () => {
    await entry({ type: 'PAYMENT', amount: '-100' });
    await entry({ type: 'PAYMENT', amount: '-100', requestId: null, hash: null });
    // Un pago sin origen sigue rechazado.
    await rejects(
      entry({ type: 'PAYMENT', amount: '-100', source: null }),
      'supplier_account_entries_amount_check',
    );
  });

  it('el origen de la plata en un ajuste (supplier_account_entries_payment_source_check)', async () => {
    await rejects(
      entry({
        type: 'ADJUSTMENT',
        amount: '10',
        description: 'Corrección',
        requestId: null,
        hash: null,
      }),
      'supplier_account_entries_payment_source_check',
    );
    // Sin origen, el ajuste pasa.
    await entry({
      type: 'ADJUSTMENT',
      amount: '10',
      description: 'Corrección',
      requestId: null,
      hash: null,
      source: null,
    });
  });

  it('un client_request_id en un ajuste sigue rechazado (supplier_account_entries_request_check)', async () => {
    await rejects(
      entry({ type: 'ADJUSTMENT', amount: '10', description: 'Corrección', source: null }),
      'supplier_account_entries_request_check',
    );
  });
});

describe('cash_movements: SUPPLIER_REFUND', () => {
  it('un SUPPLIER_REFUND válido (ingreso con su devolución) pasa', async () => {
    const [e] = await entry();
    await cashMovement({ entryId: e.id });
    expect(await prisma.cashMovement.count({ where: { reason: 'SUPPLIER_REFUND' } })).toBe(1);
  });

  it('como salida (cash_movements_reason_direction_check)', async () => {
    const [e] = await entry();
    await rejects(
      cashMovement({ direction: 'OUT', entryId: e.id }),
      'cash_movements_reason_direction_check',
    );
  });

  it('sin movimiento de cuenta (cash_movements_reason_direction_check)', async () => {
    await rejects(cashMovement({ entryId: null }), 'cash_movements_reason_direction_check');
  });

  it('un OTHER con supplier_account_entry_id (cash_movements_supplier_link_check)', async () => {
    const [e] = await entry();
    await rejects(
      cashMovement({ reason: 'OTHER', entryId: e.id }),
      'cash_movements_supplier_link_check',
    );
    await rejects(
      cashMovement({ reason: 'CASH_CONTRIBUTION', entryId: e.id }),
      'cash_movements_supplier_link_check',
    );
  });

  it('el pago a proveedor sigue valiendo: salida con su vínculo; como ingreso o sin vínculo falla', async () => {
    const [e] = await entry({ type: 'PAYMENT', amount: '-5000' });
    await cashMovement({ direction: 'OUT', reason: 'SUPPLIER_PAYMENT', entryId: e.id });
    await rejects(
      cashMovement({ direction: 'IN', reason: 'SUPPLIER_PAYMENT', entryId: e.id }),
      'cash_movements_reason_direction_check',
    );
    await rejects(
      cashMovement({ direction: 'OUT', reason: 'SUPPLIER_PAYMENT', entryId: null }),
      'cash_movements_reason_direction_check',
    );
  });

  it('los demás motivos siguen con su sentido', async () => {
    await cashMovement({ direction: 'IN', reason: 'CASH_CONTRIBUTION' });
    await cashMovement({ direction: 'OUT', reason: 'EXPENSE' });
    await cashMovement({ direction: 'IN', reason: 'OTHER' });
    await rejects(
      cashMovement({ direction: 'IN', reason: 'EXPENSE' }),
      'cash_movements_reason_direction_check',
    );
    await rejects(
      cashMovement({ direction: 'OUT', reason: 'CASH_CONTRIBUTION' }),
      'cash_movements_reason_direction_check',
    );
  });

  it('un solo ingreso por devolución (UNIQUE del vínculo)', async () => {
    const [e] = await entry();
    await cashMovement({ entryId: e.id });
    await rejects(cashMovement({ entryId: e.id }), 'supplier_account_entry_id');
  });
});
