// Tipos de la API de caja de la etapa 4 (docs/api/caja.md, sección 2).
// TODO: reemplazar por los esquemas de `@kiosco/shared/cash` cuando backend los publique.
import type { CashSession, CashSessionPublic, Shift } from '@kiosco/shared';

export type { CashSession, CashSessionPublic, Shift };

export type SignedMoney = string;
export type UserRef = { id: number; fullName: string };
export type CashSessionStatus = 'OPEN' | 'CLOSED';

/** Motivos que se pueden cargar a mano. "Pago a proveedor" llega en la etapa 5. */
export type ManualCashReason = 'OWNER_WITHDRAWAL' | 'EXPENSE' | 'CASH_CONTRIBUTION' | 'OTHER';
export type CashReason = ManualCashReason | 'SALE_VOID_REFUND' | 'SUPPLIER_PAYMENT';
export type CashDirection = 'IN' | 'OUT';

/** Lo que recibe el empleado al cerrar: solo lo que él mismo contó (H-46). */
export interface CashSessionClosedPublic extends CashSessionPublic {
  closedAt: string;
  closedBy: UserRef;
  countedCash: string;
}

export interface CashSummary {
  openingCash: string;
  cashSales: string;
  cashIn: string;
  cashOut: string;
  voidRefunds: string;
  expectedCash: SignedMoney;
}

export interface PaymentMethodSummary {
  paymentMethod: { id: number; kind: string; name: string };
  paymentCount: number;
  amount: string;
  surchargeAmount: string;
  chargedAmount: string;
  voidedChargedAmount: string;
}

export interface CashSessionSalesSummary {
  count: number;
  voidedCount: number;
  total: string;
  voidedTotal: string;
  surchargeAmount: string;
}

export interface CashMovement {
  id: number;
  cashSessionId: number;
  direction: CashDirection;
  reason: CashReason;
  description: string;
  amount: string;
  user: UserRef;
  createdAt: string;
  sale: { id: number; cashSessionId: number } | null;
  supplierAccountEntryId: number | null;
}

export interface CashSessionNote {
  id: number;
  cashSessionId: number;
  note: string;
  user: UserRef;
  createdAt: string;
}

export interface CashSessionListItem extends CashSession {
  countedCash: string | null;
  expectedCash: SignedMoney | null;
  difference: SignedMoney | null;
  noteCount: number;
}

export interface CashSessionDetail extends CashSession {
  countedCash: string | null;
  expectedCash: SignedMoney | null;
  difference: SignedMoney | null;
  closingNote: string | null;
  summary: CashSummary;
  paymentSummary: PaymentMethodSummary[];
  sales: CashSessionSalesSummary;
  movements: CashMovement[];
  notes: CashSessionNote[];
}

export interface CashListParams {
  page?: number;
  from?: string;
  to?: string;
  status?: CashSessionStatus;
  shift?: Shift;
  hasDifference?: boolean;
}

export interface CloseCashBody {
  countedCash: string;
  closingNote?: string;
}

export interface CreateCashMovementBody {
  direction: CashDirection;
  reason: ManualCashReason;
  description: string;
  amount: string;
}

/** Resultado de cerrar: el empleado solo recibe lo suyo; encargado y dueño, el detalle. */
export type CloseResult =
  | { kind: 'public'; session: CashSessionClosedPublic }
  | { kind: 'detail'; session: CashSessionDetail };
