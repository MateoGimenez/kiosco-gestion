// Caja: abrir, ver la abierta y listar (docs/api/caja.md).
// En la etapa 3 solo se ABRE; el cierre y los movimientos a mano llegan en la etapa 4.
import type { Request } from 'express';
import {
  CashSessionPublicSchema,
  CashSessionSchema,
  CurrentCashSessionResponseSchema,
  ERROR_CODES,
  getBusinessDate,
  type CashSession,
  type CashSessionListQuery,
  type CashSessionPublic,
  type CurrentCashSessionResponse,
  type OpenCashSessionRequest,
  type Paginated,
  type UserRole,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import type { Prisma } from '../../generated/client';
import { dateOnlyToDate, dateToDateOnly } from '../../lib/dates';
import { isUniqueViolation, money, type Tx } from '../../lib/db';
import { getCutoffMinutes } from '../settings/settings.service';

const CASH_INCLUDE = {
  openedBy: { select: { id: true, fullName: true } },
  closedBy: { select: { id: true, fullName: true } },
} as const;
type CashRow = Prisma.CashSessionGetPayload<{ include: typeof CASH_INCLUDE }>;

/** Lo que ve cualquier rol: nunca el efectivo inicial (el cierre es a ciegas, H-40 a). */
export function toCashSessionPublic(row: CashRow): CashSessionPublic {
  return parseResponse(CashSessionPublicSchema, {
    id: row.id,
    shift: row.shift,
    businessDate: dateToDateOnly(row.businessDate),
    status: row.status,
    openedAt: row.openedAt.toISOString(),
    openedBy: { id: row.openedBy.id, fullName: row.openedBy.fullName },
  });
}

function toCashSessionFull(row: CashRow): CashSession {
  return parseResponse(CashSessionSchema, {
    ...toCashSessionPublic(row),
    openingCash: money(row.openingCash),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    closedBy: row.closedBy ? { id: row.closedBy.id, fullName: row.closedBy.fullName } : null,
  });
}

/** Una función por rol: el empleado nunca recibe `openingCash`. */
export function toCashSessionForRole(
  row: CashRow,
  role: UserRole,
): CashSession | CashSessionPublic {
  return role === 'EMPLOYEE' ? toCashSessionPublic(row) : toCashSessionFull(row);
}

/** Día de trabajo de "ahora" según el reloj del servidor y la hora de corte. */
export async function currentBusinessDate(db: Tx, now = new Date()): Promise<string> {
  return getBusinessDate(now, await getCutoffMinutes(db));
}

export async function getCurrent(
  ctx: AppContext,
  role: UserRole,
): Promise<CurrentCashSessionResponse> {
  const [row, businessDate] = await Promise.all([
    ctx.prisma.cashSession.findFirst({ where: { status: 'OPEN' }, include: CASH_INCLUDE }),
    currentBusinessDate(ctx.prisma),
  ]);
  return parseResponse(CurrentCashSessionResponseSchema, {
    cashSession: row ? toCashSessionForRole(row, role) : null,
    currentBusinessDate: businessDate,
  });
}

export async function openCashSession(
  ctx: AppContext,
  req: Request,
  input: OpenCashSessionRequest,
): Promise<CashSession | CashSessionPublic> {
  const user = req.user!;
  const audit = auditContext(req);
  try {
    // NO se consulta primero y se inserta después: eso deja pasar a dos pedidos a la vez. Lo
    // decide el índice único parcial `cash_sessions_single_open` (PA-02, CAJ-02).
    const row = await ctx.prisma.$transaction(async (tx) => {
      const now = new Date();
      const businessDate = getBusinessDate(now, await getCutoffMinutes(tx));
      const created = await tx.cashSession.create({
        data: {
          shift: input.shift,
          businessDate: dateOnlyToDate(businessDate),
          openedById: user.id,
          openedAt: now,
          openingCash: input.openingCash,
          status: 'OPEN',
        },
        include: CASH_INCLUDE,
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'CASH_SESSION_OPEN',
        entityType: 'CashSession',
        entityId: created.id,
        details: {
          shift: input.shift,
          businessDate,
          openingCash: money(input.openingCash),
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return created;
    });
    return toCashSessionForRole(row, user.role);
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // La transacción ya se deshizo: se lee la caja que ganó (sin efectivo inicial, sea cual sea el rol).
    const open = await ctx.prisma.cashSession.findFirst({
      where: { status: 'OPEN' },
      include: CASH_INCLUDE,
    });
    throw new AppError(
      409,
      ERROR_CODES.CASH_SESSION_ALREADY_OPEN,
      'Ya hay una caja abierta. Para abrir otra, primero hay que cerrar esa.',
      open ? { cashSession: toCashSessionPublic(open) } : undefined,
    );
  }
}

export async function listCashSessions(
  ctx: AppContext,
  query: CashSessionListQuery,
): Promise<Paginated<CashSession>> {
  const where: Prisma.CashSessionWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? {
          businessDate: {
            ...(query.from ? { gte: dateOnlyToDate(query.from) } : {}),
            ...(query.to ? { lte: dateOnlyToDate(query.to) } : {}),
          },
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.prisma.cashSession.findMany({
      where,
      include: CASH_INCLUDE,
      orderBy: [{ openedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    ctx.prisma.cashSession.count({ where }),
  ]);
  return {
    items: rows.map(toCashSessionFull),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}
