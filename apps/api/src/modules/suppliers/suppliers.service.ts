// Proveedores: ABM, habitual de productos, cuenta corriente, pagos, saldo inicial, ajustes y pedido
// sugerido (docs/api/proveedores.md).
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import {
  AssignProductsResponseSchema,
  buildSupplierOrderText,
  buildWhatsAppUrl,
  ERROR_CODES,
  suggestedOrderQuantity,
  SupplierAccountResponseSchema,
  SupplierEntryResponseSchema,
  SupplierPageSchema,
  SupplierPaymentResponseSchema,
  SupplierSchema,
  SuggestedOrderResponseSchema,
  toDecimal,
  toWhatsAppPhone,
  type AssignProductsRequest,
  type AssignProductsResponse,
  type CreateAccountAdjustmentRequest,
  type CreateOpeningBalanceRequest,
  type CreateSupplierPaymentRequest,
  type CreateSupplierRequest,
  type Paginated,
  type Supplier,
  type SupplierAccountQuery,
  type SupplierAccountResponse,
  type SupplierEntryResponse,
  type SupplierListQuery,
  type SupplierPaymentResponse,
  type SuggestedOrderResponse,
  type UpdateSupplierRequest,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import { Prisma } from '../../generated/client';
import { dateOnlyToDate, todayInBuenosAires } from '../../lib/dates';
import {
  dec,
  escapeLike,
  isNumericOverflow,
  isUniqueViolation,
  money,
  qty,
  type Tx,
} from '../../lib/db';
import { denyRemote } from '../../middleware/route';
import { SQL_NAME_ORDER } from '../../lib/db';
import {
  assertPaymentWithinBalance,
  balancesAfter,
  ENTRY_INCLUDE,
  loadEntry,
  lockSupplier,
  supplierBalance,
  toAccountEntry,
} from './account';

const notFound = () => new AppError(404, ERROR_CODES.NOT_FOUND, 'El proveedor no existe.');
const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;
const SUPPLIER_NAME_ORDER = SQL_NAME_ORDER.replace('p.name', 's.name');

// --- Lectura ---------------------------------------------------------------------------------------

/** Proveedores con su saldo (una consulta agrupada) y conteos, en el orden de `ids`. */
async function loadSuppliers(db: Tx, ids: number[]): Promise<Supplier[]> {
  if (ids.length === 0) return [];
  const [rows, balances, openings, counts] = await Promise.all([
    db.supplier.findMany({ where: { id: { in: ids } } }),
    db.$queryRaw<{ supplier_id: number; balance: string }[]>`
      SELECT supplier_id, SUM(amount)::text AS balance FROM supplier_account_entries
      WHERE supplier_id IN (${Prisma.join(ids)}) GROUP BY supplier_id`,
    db.supplierAccountEntry.findMany({
      where: { supplierId: { in: ids }, type: 'OPENING_BALANCE' },
      select: { supplierId: true },
    }),
    db.product.groupBy({
      by: ['defaultSupplierId'],
      where: { defaultSupplierId: { in: ids }, isActive: true },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const balanceBy = new Map(balances.map((b) => [b.supplier_id, b.balance]));
  const opening = new Set(openings.map((o) => o.supplierId));
  const countBy = new Map(counts.map((c) => [c.defaultSupplierId, c._count._all]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    return [
      parseResponse(SupplierSchema, {
        id: r.id,
        name: r.name,
        phone: r.phone,
        whatsappPhone: r.phone ? toWhatsAppPhone(r.phone) : null,
        email: r.email,
        taxId: r.taxId,
        visitDays: r.visitDays,
        notes: r.notes,
        isActive: r.isActive,
        balance: money(balanceBy.get(id) ?? '0'),
        hasOpeningBalance: opening.has(id),
        defaultProductCount: countBy.get(id) ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      }),
    ];
  });
}

export async function getSupplier(ctx: AppContext, id: number): Promise<Supplier> {
  const [s] = await loadSuppliers(ctx.prisma, [id]);
  if (!s) throw notFound();
  return s;
}

export async function listSuppliers(
  ctx: AppContext,
  q: SupplierListQuery,
): Promise<Paginated<Supplier>> {
  const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (q.search) {
    const like = escapeLike(q.search);
    conds.push(
      Prisma.sql`(f_unaccent(lower(s.name)) ILIKE '%' || f_unaccent(lower(${like})) || '%' OR s.tax_id LIKE ${like} || '%')`,
    );
  }
  if (q.isActive !== undefined) conds.push(Prisma.sql`s.is_active = ${q.isActive}`);
  if (q.visitDay) conds.push(Prisma.sql`${q.visitDay}::weekday = ANY(s.visit_days)`);
  if (q.hasBalance !== undefined)
    conds.push(
      q.hasBalance
        ? Prisma.sql`COALESCE(b.balance, 0) <> 0`
        : Prisma.sql`COALESCE(b.balance, 0) = 0`,
    );
  const where = Prisma.join(conds, ' AND ');
  const dir = Prisma.raw(q.sortOrder === 'desc' ? 'DESC' : 'ASC');
  const order =
    q.sortBy === 'balance'
      ? Prisma.sql`COALESCE(b.balance, 0) ${dir}, ${Prisma.raw(SUPPLIER_NAME_ORDER)} ASC, s.id ASC`
      : Prisma.sql`${Prisma.raw(SUPPLIER_NAME_ORDER)} ${dir}, s.id ASC`;
  const from = Prisma.sql`suppliers s LEFT JOIN (
    SELECT supplier_id, SUM(amount) AS balance FROM supplier_account_entries GROUP BY supplier_id
  ) b ON b.supplier_id = s.id`;
  const [ids, totals] = await Promise.all([
    ctx.prisma.$queryRaw<{ id: number }[]>`
      SELECT s.id FROM ${from} WHERE ${where} ORDER BY ${order}
      LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`,
    ctx.prisma.$queryRaw<
      { total: number }[]
    >`SELECT COUNT(*)::int AS total FROM ${from} WHERE ${where}`,
  ]);
  return parseResponse(SupplierPageSchema, {
    items: await loadSuppliers(
      ctx.prisma,
      ids.map((r) => r.id),
    ),
    page: q.page,
    pageSize: q.pageSize,
    total: totals[0]?.total ?? 0,
  });
}

// --- ABM -------------------------------------------------------------------------------------------

const nameTaken = () =>
  new AppError(409, ERROR_CODES.SUPPLIER_NAME_TAKEN, 'Ya existe un proveedor con ese nombre.');

async function assertTaxIdFree(
  db: Tx,
  taxId: string | null | undefined,
  confirmed: boolean | undefined,
  exceptId?: number,
) {
  if (!taxId || confirmed) return;
  const other = await db.supplier.findFirst({
    where: { taxId, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true, name: true },
  });
  if (other) {
    throw new AppError(
      422,
      ERROR_CODES.SUPPLIER_TAX_ID_DUPLICATE,
      'Otro proveedor ya tiene ese CUIT. Confirmá si es correcto.',
      { supplierId: other.id, supplierName: other.name },
    );
  }
}

export async function createSupplier(
  ctx: AppContext,
  req: Request,
  input: CreateSupplierRequest,
): Promise<Supplier> {
  const audit = auditContext(req);
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      await assertTaxIdFree(tx, input.taxId, input.confirmDuplicateTaxId);
      const created = await tx.supplier.create({
        data: {
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          taxId: input.taxId ?? null,
          visitDays: input.visitDays ?? [],
          notes: input.notes ?? null,
        },
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'SUPPLIER_CREATE',
        entityType: 'Supplier',
        entityId: created.id,
        details: {
          after: {
            name: created.name,
            phone: created.phone,
            email: created.email,
            taxId: created.taxId,
            visitDays: created.visitDays,
            notes: created.notes,
          },
          ...(input.confirmDuplicateTaxId && input.taxId ? { confirmedDuplicateTaxId: true } : {}),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return created.id;
    });
    return await getSupplier(ctx, id);
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function updateSupplier(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateSupplierRequest,
): Promise<Supplier> {
  const audit = auditContext(req);
  try {
    await ctx.prisma.$transaction(async (tx) => {
      const current = await tx.supplier.findUnique({ where: { id } });
      if (!current) throw notFound();
      const next = {
        name: input.name ?? current.name,
        phone: input.phone === undefined ? current.phone : input.phone,
        email: input.email === undefined ? current.email : input.email,
        taxId: input.taxId === undefined ? current.taxId : input.taxId,
        visitDays: input.visitDays ?? current.visitDays,
        notes: input.notes === undefined ? current.notes : input.notes,
        isActive: input.isActive ?? current.isActive,
      };
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      for (const key of Object.keys(next) as (keyof typeof next)[]) {
        if (JSON.stringify(next[key]) !== JSON.stringify(current[key])) {
          before[key] = current[key];
          after[key] = next[key];
        }
      }
      if (Object.keys(after).length === 0) return;
      if ('taxId' in after) await assertTaxIdFree(tx, next.taxId, input.confirmDuplicateTaxId, id);
      await tx.supplier.update({ where: { id }, data: next });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'SUPPLIER_UPDATE',
        entityType: 'Supplier',
        entityId: id,
        details: { before, after } as Prisma.InputJsonValue,
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
    });
    return await getSupplier(ctx, id);
  } catch (err) {
    if (isUniqueViolation(err)) throw nameTaken();
    throw err;
  }
}

export async function assignProducts(
  ctx: AppContext,
  req: Request,
  supplierId: number,
  input: AssignProductsRequest,
): Promise<AssignProductsResponse> {
  const audit = auditContext(req);
  return ctx.prisma.$transaction(async (tx) => {
    const supplier = await lockSupplier(tx, supplierId);
    if (!supplier) throw notFound();
    if (!supplier.isActive)
      throw new AppError(422, ERROR_CODES.SUPPLIER_INACTIVE, 'El proveedor está desactivado.');
    const ids = [...input.productIds].sort((a, b) => a - b);
    await tx.$queryRaw`SELECT id FROM products WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR NO KEY UPDATE`;
    const products = await tx.product.findMany({
      where: { id: { in: ids } },
      include: { defaultSupplier: { select: { id: true, name: true } } },
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const missing = input.productIds.filter((p) => !byId.has(p));
    if (missing.length > 0)
      throw new AppError(422, ERROR_CODES.PRODUCT_NOT_FOUND, 'Un producto no existe.', {
        productIds: missing,
      });
    if (products.some((p) => p.isMiscellaneous))
      throw new AppError(
        422,
        ERROR_CODES.MISC_PRODUCT_LOCKED,
        '"Varios" no se puede asignar a un proveedor.',
      );
    const changed = products.filter((p) => p.defaultSupplierId !== supplierId);
    if (changed.length > 0) {
      await tx.product.updateMany({
        where: { id: { in: changed.map((p) => p.id) } },
        data: { defaultSupplierId: supplierId },
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: 'PRODUCT_SUPPLIER_ASSIGN',
        entityType: 'Supplier',
        entityId: supplierId,
        details: {
          products: changed.map((p) => ({
            productId: p.id,
            previousSupplierId: p.defaultSupplierId,
          })),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
    }
    return parseResponse(AssignProductsResponseSchema, {
      supplierId,
      products: input.productIds.map((pid) => {
        const p = byId.get(pid)!;
        return { id: p.id, name: p.name, previousSupplier: p.defaultSupplier };
      }),
    });
  }, TX_OPTIONS);
}

// --- Cuenta corriente --------------------------------------------------------------------------------

export async function getAccount(
  ctx: AppContext,
  supplierId: number,
  q: SupplierAccountQuery,
): Promise<SupplierAccountResponse> {
  const supplier = await ctx.prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, isActive: true },
  });
  if (!supplier) throw notFound();
  const where: Prisma.SupplierAccountEntryWhereInput = {
    supplierId,
    ...(q.type ? { type: q.type } : {}),
    ...(q.from || q.to
      ? {
          entryDate: {
            ...(q.from ? { gte: dateOnlyToDate(q.from) } : {}),
            ...(q.to ? { lte: dateOnlyToDate(q.to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total, balance] = await Promise.all([
    ctx.prisma.supplierAccountEntry.findMany({
      where,
      orderBy: [{ entryDate: 'desc' }, { id: 'desc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: ENTRY_INCLUDE,
    }),
    ctx.prisma.supplierAccountEntry.count({ where }),
    supplierBalance(ctx.prisma, supplierId),
  ]);
  const after = await balancesAfter(
    ctx.prisma,
    supplierId,
    rows.map((r) => r.id),
  );
  return parseResponse(SupplierAccountResponseSchema, {
    supplier,
    balance: balance.toFixed(2),
    items: rows.map((r) => toAccountEntry(r, after.get(r.id) ?? '0.00')),
    page: q.page,
    pageSize: q.pageSize,
    total,
  });
}

/** Huella del pago (sin el usuario: se compara aparte). */
function hashPayment(supplierId: number, i: CreateSupplierPaymentRequest): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        supplierId,
        clientRequestId: i.clientRequestId,
        amount: money(i.amount),
        source: i.source,
        entryDate: i.entryDate ?? null,
        reference: i.reference ?? null,
        description: i.description ?? null,
      }),
    )
    .digest('hex');
}

async function paymentResponse(
  db: Tx,
  entryId: number,
  isReplay: boolean,
): Promise<SupplierPaymentResponse> {
  const { entry, row } = await loadEntry(db, entryId);
  const movement = row.cashMovement
    ? await db.cashMovement.findUniqueOrThrow({
        where: { id: row.cashMovement.id },
        include: {
          user: { select: { id: true, fullName: true } },
          supplierAccountEntry: { select: { supplier: { select: { id: true, name: true } } } },
        },
      })
    : null;
  return parseResponse(SupplierPaymentResponseSchema, {
    entry,
    balance: (await supplierBalance(db, row.supplierId)).toFixed(2),
    cashMovement: movement
      ? {
          id: movement.id,
          cashSessionId: movement.cashSessionId,
          direction: movement.direction,
          reason: movement.reason,
          description: movement.description,
          amount: money(movement.amount),
          user: movement.user,
          createdAt: movement.createdAt.toISOString(),
          sale: null,
          supplierAccountEntryId: movement.supplierAccountEntryId,
          supplier: movement.supplierAccountEntry?.supplier ?? null,
        }
      : null,
    isReplay,
  });
}

export async function createPayment(
  ctx: AppContext,
  req: Request,
  supplierId: number,
  input: CreateSupplierPaymentRequest,
): Promise<{ status: 200 | 201; body: SupplierPaymentResponse }> {
  const user = req.user!;
  const audit = auditContext(req);
  if (input.source === 'CASH_REGISTER' && req.access === 'remote') {
    await denyRemote(ctx, req, 'Los pagos con efectivo de la caja se hacen desde el local.');
  }
  const requestHash = hashPayment(supplierId, input);
  const replay = async () => {
    const existing = await ctx.prisma.supplierAccountEntry.findUnique({
      where: { clientRequestId: input.clientRequestId },
    });
    if (!existing) return null;
    if (
      existing.userId === user.id &&
      existing.requestHash === requestHash &&
      existing.supplierId === supplierId
    )
      return { status: 200 as const, body: await paymentResponse(ctx.prisma, existing.id, true) };
    throw new AppError(
      409,
      ERROR_CODES.PAYMENT_REQUEST_ID_REUSED,
      'Ese pago ya se había registrado. Revisá la cuenta corriente antes de cargarlo de nuevo.',
      { entryId: existing.id, createdAt: existing.createdAt.toISOString() },
    );
  };
  const prior = await replay();
  if (prior) return prior;

  try {
    const entryId = await ctx.prisma.$transaction(async (tx) => {
      const supplier = await lockSupplier(tx, supplierId);
      if (!supplier) throw notFound();
      const today = todayInBuenosAires();
      const entryDate = input.entryDate ?? today;
      if (entryDate > today)
        throw new AppError(
          422,
          ERROR_CODES.DATE_IN_FUTURE,
          'La fecha no puede ser posterior a hoy.',
        );
      if (input.source === 'CASH_REGISTER' && entryDate !== today)
        throw new AppError(
          422,
          ERROR_CODES.PAYMENT_DATE_MUST_BE_TODAY,
          'Un pago con efectivo de la caja es de hoy.',
        );
      let cashSessionId: number | null = null;
      if (input.source === 'CASH_REGISTER') {
        const open = await tx.$queryRaw<{ id: number }[]>`
          SELECT id FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`;
        if (!open[0])
          throw new AppError(
            422,
            ERROR_CODES.CASH_SESSION_REQUIRED,
            'No hay ninguna caja abierta. Abrí la caja para pagar con efectivo de la caja.',
          );
        cashSessionId = open[0].id;
      }
      const amount = dec(input.amount);
      const balanceBefore = await supplierBalance(tx, supplierId);
      assertPaymentWithinBalance(balanceBefore, amount, input.confirmOverpayment);
      const entry = await tx.supplierAccountEntry.create({
        data: {
          supplierId,
          type: 'PAYMENT',
          amount: amount.neg().toFixed(2),
          entryDate: dateOnlyToDate(entryDate),
          paymentSource: input.source,
          reference: input.reference ?? null,
          description: input.description ?? null,
          clientRequestId: input.clientRequestId,
          requestHash,
          userId: user.id,
        },
      });
      let cashMovementId: number | null = null;
      if (cashSessionId !== null) {
        const m = await tx.cashMovement.create({
          data: {
            cashSessionId,
            direction: 'OUT',
            reason: 'SUPPLIER_PAYMENT',
            description: input.description ?? `Pago a proveedor: ${supplier.name}`,
            amount: amount.toFixed(2),
            supplierAccountEntryId: entry.id,
            userId: user.id,
          },
        });
        cashMovementId = m.id;
      }
      await writeAudit(tx, {
        userId: user.id,
        action: 'SUPPLIER_PAYMENT',
        entityType: 'Supplier',
        entityId: supplierId,
        details: {
          entryId: entry.id,
          amount: amount.toFixed(2),
          source: input.source,
          entryDate,
          reference: input.reference ?? null,
          purchaseId: null,
          cashMovementId,
          cashSessionId,
          balanceBefore: balanceBefore.toFixed(2),
          balanceAfter: balanceBefore.minus(amount).toFixed(2),
          confirmedOverpayment: input.confirmOverpayment === true,
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return entry.id;
    }, TX_OPTIONS);
    return { status: 201, body: await paymentResponse(ctx.prisma, entryId, false) };
  } catch (err) {
    if (isUniqueViolation(err)) {
      const prior2 = await replay();
      if (prior2) return prior2;
    }
    if (isNumericOverflow(err))
      throw new AppError(
        422,
        ERROR_CODES.ACCOUNT_AMOUNT_OUT_OF_RANGE,
        'El importe es demasiado grande.',
      );
    throw err;
  }
}

async function createOwnerEntry(
  ctx: AppContext,
  req: Request,
  supplierId: number,
  kind: 'OPENING_BALANCE' | 'ADJUSTMENT',
  amount: string,
  entryDateInput: string | null | undefined,
  description: string | null | undefined,
): Promise<SupplierEntryResponse> {
  const audit = auditContext(req);
  try {
    const id = await ctx.prisma.$transaction(async (tx) => {
      const supplier = await lockSupplier(tx, supplierId);
      if (!supplier) throw notFound();
      const today = todayInBuenosAires();
      const entryDate = entryDateInput ?? today;
      if (entryDate > today)
        throw new AppError(
          422,
          ERROR_CODES.DATE_IN_FUTURE,
          'La fecha no puede ser posterior a hoy.',
        );
      const before = await supplierBalance(tx, supplierId);
      const entry = await tx.supplierAccountEntry.create({
        data: {
          supplierId,
          type: kind,
          amount: dec(amount).toFixed(2),
          entryDate: dateOnlyToDate(entryDate),
          description: description ?? null,
          userId: req.user!.id,
        },
      });
      await writeAudit(tx, {
        userId: req.user!.id,
        action: kind === 'OPENING_BALANCE' ? 'SUPPLIER_OPENING_BALANCE' : 'SUPPLIER_ACCOUNT_ADJUST',
        entityType: 'Supplier',
        entityId: supplierId,
        details:
          kind === 'OPENING_BALANCE'
            ? {
                entryId: entry.id,
                amount: money(amount),
                entryDate,
                description: description ?? null,
              }
            : {
                entryId: entry.id,
                amount: money(amount),
                reason: description,
                entryDate,
                balanceBefore: before.toFixed(2),
                balanceAfter: before.plus(dec(amount)).toFixed(2),
              },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return entry.id;
    }, TX_OPTIONS);
    const { entry, row } = await loadEntry(ctx.prisma, id);
    return parseResponse(SupplierEntryResponseSchema, {
      entry,
      balance: (await supplierBalance(ctx.prisma, row.supplierId)).toFixed(2),
    });
  } catch (err) {
    if (kind === 'OPENING_BALANCE' && isUniqueViolation(err))
      throw new AppError(
        409,
        ERROR_CODES.OPENING_BALANCE_EXISTS,
        'Este proveedor ya tiene saldo inicial. Para corregirlo, cargá un ajuste.',
      );
    if (isNumericOverflow(err))
      throw new AppError(
        422,
        ERROR_CODES.ACCOUNT_AMOUNT_OUT_OF_RANGE,
        'El importe es demasiado grande.',
      );
    throw err;
  }
}

export const createOpeningBalance = (
  ctx: AppContext,
  req: Request,
  supplierId: number,
  i: CreateOpeningBalanceRequest,
) =>
  createOwnerEntry(ctx, req, supplierId, 'OPENING_BALANCE', i.amount, i.entryDate, i.description);

export const createAdjustment = (
  ctx: AppContext,
  req: Request,
  supplierId: number,
  i: CreateAccountAdjustmentRequest,
) => createOwnerEntry(ctx, req, supplierId, 'ADJUSTMENT', i.amount, i.entryDate, i.reason);

// --- Pedido sugerido ----------------------------------------------------------------------------------

const ORDER_LIMIT = 500;

export async function getSuggestedOrder(
  ctx: AppContext,
  supplierId: number,
): Promise<SuggestedOrderResponse> {
  const supplier = await ctx.prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) throw notFound();
  const rows = await ctx.prisma.$queryRaw<
    {
      id: number;
      name: string;
      barcode: string | null;
      sale_unit: 'UNIT' | 'KG';
      stock: string;
      min_stock: string;
      units_per_pack: string | null;
    }[]
  >`
    SELECT p.id, p.name, p.barcode, p.sale_unit::text AS sale_unit, p.stock_quantity::text AS stock,
           p.min_stock::text AS min_stock, p.units_per_pack::text AS units_per_pack
    FROM products p
    WHERE p.default_supplier_id = ${supplierId} AND p.is_active AND NOT p.is_miscellaneous
      AND p.stock_quantity <= p.min_stock
    ORDER BY ${Prisma.raw(SQL_NAME_ORDER)}, p.id
    LIMIT ${ORDER_LIMIT + 1}`;
  const isTruncated = rows.length > ORDER_LIMIT;
  const items = rows.slice(0, ORDER_LIMIT).map((r) => {
    const shortfall = toDecimal(r.min_stock).minus(toDecimal(r.stock));
    return {
      productId: r.id,
      name: r.name,
      barcode: r.barcode,
      saleUnit: r.sale_unit,
      stockQuantity: qty(r.stock),
      minStock: qty(r.min_stock),
      shortfall: qty(shortfall.isNegative() ? '0' : shortfall),
      suggestedQuantity: qty(suggestedOrderQuantity(r.stock, r.min_stock)),
      unitsPerPack: r.units_per_pack === null ? null : qty(r.units_per_pack),
    };
  });
  const settings = await ctx.prisma.setting.findUnique({ where: { id: 1 } });
  const storeName = settings?.storeName ?? 'Kiosco';
  const text = buildSupplierOrderText({
    storeName,
    supplierName: supplier.name,
    lines: items.map((i) => ({
      name: i.name,
      saleUnit: i.saleUnit,
      quantity: i.suggestedQuantity,
    })),
  });
  const whatsappPhone = supplier.phone ? toWhatsAppPhone(supplier.phone) : null;
  return parseResponse(SuggestedOrderResponseSchema, {
    supplier: { id: supplier.id, name: supplier.name, isActive: supplier.isActive, whatsappPhone },
    storeName,
    items,
    isTruncated,
    text,
    whatsappUrl: buildWhatsAppUrl(whatsappPhone, text),
  });
}
