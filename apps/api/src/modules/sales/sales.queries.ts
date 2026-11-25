// Listar y ver ventas (docs/api/ventas.md, sección 8). Solo encargado y dueño (H-40 a).
import {
  ERROR_CODES,
  SaleListItemSchema,
  type Paginated,
  type Sale,
  type SaleListItem,
  type SaleListQuery,
  type SaleWithCost,
  type UserRole,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateOnlyToDate, dateToDateOnly } from '../../lib/dates';
import { dec, money } from '../../lib/db';
import { toSaleForRole } from './sales.mapper';
import { loadSale } from './sales.service';

export async function listSales(
  ctx: AppContext,
  query: SaleListQuery,
): Promise<Paginated<SaleListItem>> {
  const where: Prisma.SaleWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.userId !== undefined ? { userId: query.userId } : {}),
    ...(query.cashSessionId !== undefined ? { cashSessionId: query.cashSessionId } : {}),
    ...(query.from || query.to
      ? {
          // Por DÍA DE TRABAJO, ambos incluidos.
          businessDate: {
            ...(query.from ? { gte: dateOnlyToDate(query.from) } : {}),
            ...(query.to ? { lte: dateOnlyToDate(query.to) } : {}),
          },
        }
      : {}),
  };
  const [sales, total] = await Promise.all([
    ctx.prisma.sale.findMany({
      where,
      include: {
        cashSession: { select: { id: true, shift: true } },
        user: { select: { id: true, fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    ctx.prisma.sale.count({ where }),
  ]);

  // Pagos y "Varios" de TODA la página en una consulta cada uno (no una por venta).
  const ids = sales.map((s) => s.id);
  const [payments, miscItems] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          ctx.prisma.salePayment.findMany({
            where: { saleId: { in: ids } },
            include: { paymentMethod: { select: { kind: true, name: true } } },
            orderBy: { id: 'asc' },
          }),
          ctx.prisma.saleItem.findMany({
            where: { saleId: { in: ids }, product: { isMiscellaneous: true } },
            select: { saleId: true },
          }),
        ]);
  const paymentsBySale = new Map<number, typeof payments>();
  for (const p of payments) {
    const list = paymentsBySale.get(p.saleId) ?? [];
    list.push(p);
    paymentsBySale.set(p.saleId, list);
  }
  const withMisc = new Set(miscItems.map((i) => i.saleId));

  return {
    items: sales.map((s) =>
      parseResponse(SaleListItemSchema, {
        id: s.id,
        status: s.status,
        businessDate: dateToDateOnly(s.businessDate),
        createdAt: s.createdAt.toISOString(),
        cashSession: { id: s.cashSession.id, shift: s.cashSession.shift },
        user: { id: s.user.id, fullName: s.user.fullName },
        itemCount: s._count.items,
        hasMiscellaneous: withMisc.has(s.id),
        subtotal: money(s.subtotal),
        discountAmount: money(s.discountAmount),
        surchargeAmount: money(s.surchargeAmount),
        total: money(s.total),
        payments: (paymentsBySale.get(s.id) ?? []).map((p) => ({
          kind: p.paymentMethod.kind,
          name: p.paymentMethod.name,
          chargedAmount: dec(p.amount).plus(dec(p.surchargeAmount)).toFixed(2),
        })),
        voidedAt: s.voidedAt ? s.voidedAt.toISOString() : null,
      }),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function getSale(
  ctx: AppContext,
  role: UserRole,
  id: number,
): Promise<Sale | SaleWithCost> {
  const row = await loadSale(ctx.prisma, id);
  if (!row) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La venta no existe.');
  return toSaleForRole(row, role);
}
