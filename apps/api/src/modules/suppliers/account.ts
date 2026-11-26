// Cuenta corriente de un proveedor: bloqueo, saldo y armado de movimientos
// (docs/api/proveedores.md, secciones 7 y 8). El saldo NUNCA se guarda: siempre es Σ amount.
import {
  ERROR_CODES,
  SupplierAccountEntrySchema,
  type SupplierAccountEntry,
  type SupplierPaymentSource,
} from '@kiosco/shared';
import { AppError, parseResponse } from '../../errors';
import { Prisma } from '../../generated/client';
import { dateToDateOnly } from '../../lib/dates';
import { dec, money, type Tx } from '../../lib/db';

export interface LockedSupplier {
  id: number;
  name: string;
  isActive: boolean;
}

/**
 * Bloquea al proveedor hasta el final de la transacción (`FOR NO KEY UPDATE`): serializa todo lo que
 * cambia su saldo (pagos, compras, anulaciones, ajustes). Siempre es lo PRIMERO que se bloquea.
 * `null` si no existe.
 */
export async function lockSupplier(tx: Tx, id: number): Promise<LockedSupplier | null> {
  const rows = await tx.$queryRaw<{ id: number; name: string; is_active: boolean }[]>`
    SELECT id, name, is_active FROM suppliers WHERE id = ${id} FOR NO KEY UPDATE`;
  const row = rows[0];
  return row ? { id: row.id, name: row.name, isActive: row.is_active } : null;
}

/** Saldo = Σ amount de todos los movimientos, calculado en SQL (nunca sumando en JavaScript). */
export async function supplierBalance(db: Tx, supplierId: number): Promise<ReturnType<typeof dec>> {
  const rows = await db.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(amount), 0)::text AS balance
    FROM supplier_account_entries WHERE supplier_id = ${supplierId}`;
  return dec(rows[0]?.balance ?? '0');
}

/** Saldo acumulado después de cada movimiento, en orden cronológico (`entryDate`, `id`). */
export async function balancesAfter(
  db: Tx,
  supplierId: number,
  entryIds: number[],
): Promise<Map<number, string>> {
  if (entryIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ id: number; balance_after: string }[]>`
    SELECT id, balance_after FROM (
      SELECT id, (SUM(amount) OVER (ORDER BY entry_date, id))::text AS balance_after
      FROM supplier_account_entries WHERE supplier_id = ${supplierId}
    ) t
    WHERE id IN (${Prisma.join(entryIds)})`;
  return new Map(rows.map((r) => [r.id, money(r.balance_after)]));
}

export const ENTRY_INCLUDE = {
  purchase: { select: { id: true, documentType: true, documentNumber: true, status: true } },
  cashMovement: { select: { id: true, cashSessionId: true } },
  user: { select: { id: true, fullName: true } },
} satisfies Prisma.SupplierAccountEntryInclude;
export type EntryRow = Prisma.SupplierAccountEntryGetPayload<{ include: typeof ENTRY_INCLUDE }>;

export function toAccountEntry(row: EntryRow, balanceAfter: string): SupplierAccountEntry {
  return parseResponse(SupplierAccountEntrySchema, {
    id: row.id,
    supplierId: row.supplierId,
    type: row.type,
    amount: money(row.amount),
    entryDate: dateToDateOnly(row.entryDate),
    balanceAfter,
    purchase: row.purchase
      ? {
          id: row.purchase.id,
          documentType: row.purchase.documentType,
          documentNumber: row.purchase.documentNumber,
          status: row.purchase.status,
        }
      : null,
    paymentSource: row.paymentSource,
    reference: row.reference,
    description: row.description,
    cashMovement: row.cashMovement
      ? { id: row.cashMovement.id, cashSessionId: row.cashMovement.cashSessionId }
      : null,
    user: { id: row.user.id, fullName: row.user.fullName },
    createdAt: row.createdAt.toISOString(),
  });
}

/** Un movimiento recién creado, con su saldo acumulado. */
export async function loadEntry(
  db: Tx,
  entryId: number,
): Promise<{ entry: SupplierAccountEntry; row: EntryRow }> {
  const row = await db.supplierAccountEntry.findUniqueOrThrow({
    where: { id: entryId },
    include: ENTRY_INCLUDE,
  });
  const balances = await balancesAfter(db, row.supplierId, [row.id]);
  return { entry: toAccountEntry(row, balances.get(row.id) ?? '0.00'), row };
}

/**
 * Pago mayor que la deuda (H-56 c): si `saldo − importe < 0` y no vino la confirmación → 422.
 * `balance` es el saldo que ya incluye lo que se haya cargado antes en la misma transacción.
 */
export function assertPaymentWithinBalance(
  balance: ReturnType<typeof dec>,
  amount: ReturnType<typeof dec>,
  confirmed: boolean | undefined,
): void {
  const after = balance.minus(amount);
  if (after.isNegative() && !confirmed) {
    throw new AppError(
      422,
      ERROR_CODES.PAYMENT_EXCEEDS_BALANCE,
      'El pago es mayor que lo que se le debe: el proveedor quedaría con saldo a favor del kiosco. Confirmá para guardarlo.',
      { balance: balance.toFixed(2), amount: amount.toFixed(2), balanceAfter: after.toFixed(2) },
    );
  }
}

export const PAYMENT_SOURCE_LABEL: Record<SupplierPaymentSource, string> = {
  CASH_REGISTER: 'efectivo de la caja',
  CASH_OUTSIDE_REGISTER: 'efectivo de afuera de la caja',
  BANK_TRANSFER: 'transferencia',
  OTHER: 'otro',
};
