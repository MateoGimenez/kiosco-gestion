// Medios de pago (docs/api/ventas.md, sección 5). Son 5 fijos: la API no da de alta ni de baja.
import type { Request } from 'express';
import {
  ERROR_CODES,
  PaymentMethodListResponseSchema,
  PaymentMethodSchema,
  type PaymentMethod,
  type PaymentMethodListResponse,
  type UpdatePaymentMethodRequest,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import type { PaymentMethod as PaymentMethodRow } from '../../generated/client';
import { dec, pct } from '../../lib/db';

function toPaymentMethod(row: PaymentMethodRow): PaymentMethod {
  return parseResponse(PaymentMethodSchema, {
    id: row.id,
    kind: row.kind,
    name: row.name,
    surchargePercent: pct(row.surchargePercent),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function listPaymentMethods(ctx: AppContext): Promise<PaymentMethodListResponse> {
  const rows = await ctx.prisma.paymentMethod.findMany({
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return parseResponse(PaymentMethodListResponseSchema, { items: rows.map(toPaymentMethod) });
}

export async function updatePaymentMethod(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdatePaymentMethodRequest,
): Promise<PaymentMethod> {
  const audit = auditContext(req);
  return ctx.prisma.$transaction(async (tx) => {
    // Fila bloqueada: el "antes" de la auditoría es exacto aunque haya dos cambios a la vez.
    await tx.$queryRaw`SELECT id FROM payment_methods WHERE id = ${id} FOR UPDATE`;
    const current = await tx.paymentMethod.findUnique({ where: { id } });
    if (!current) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'El medio de pago no existe.');

    // El recargo solo existe en crédito (VEN-07, CFG-01).
    if (
      input.surchargePercent !== undefined &&
      current.kind !== 'CREDIT_CARD' &&
      !dec(input.surchargePercent).isZero()
    ) {
      throw new AppError(422, ERROR_CODES.SURCHARGE_NOT_ALLOWED, 'Solo el crédito lleva recargo.');
    }
    // El efectivo no se desactiva (H-38 a): no se guarda nada del pedido.
    if (input.isActive === false && current.kind === 'CASH') {
      throw new AppError(
        422,
        ERROR_CODES.CASH_METHOD_LOCKED,
        'El efectivo no se puede desactivar.',
      );
    }

    const before: Record<string, string | boolean | number> = {};
    const after: Record<string, string | boolean | number> = {};
    const data: { surchargePercent?: string; isActive?: boolean; sortOrder?: number } = {};
    if (
      input.surchargePercent !== undefined &&
      !dec(input.surchargePercent).eq(dec(current.surchargePercent))
    ) {
      before.surchargePercent = pct(current.surchargePercent);
      after.surchargePercent = pct(input.surchargePercent);
      data.surchargePercent = input.surchargePercent;
    }
    if (input.isActive !== undefined && input.isActive !== current.isActive) {
      before.isActive = current.isActive;
      after.isActive = input.isActive;
      data.isActive = input.isActive;
    }
    if (input.sortOrder !== undefined && input.sortOrder !== current.sortOrder) {
      before.sortOrder = current.sortOrder;
      after.sortOrder = input.sortOrder;
      data.sortOrder = input.sortOrder;
    }

    // Si no cambió nada: 200 sin tocar la fila ni auditar.
    if (Object.keys(after).length === 0) return toPaymentMethod(current);

    const updated = await tx.paymentMethod.update({ where: { id }, data });
    await writeAudit(tx, {
      userId: req.user?.id ?? null,
      action: 'PAYMENT_METHOD_UPDATE',
      entityType: 'PaymentMethod',
      entityId: id,
      details: { kind: current.kind, before, after },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return toPaymentMethod(updated);
  });
}
