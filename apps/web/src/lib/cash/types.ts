// Tipos de la API de caja de la etapa 4: salen de `@kiosco/shared` (docs/api/caja.md, sección 2).
import type { CashSessionStatus, Shift } from '@kiosco/shared';

export type {
  CashDirection,
  CashMovement,
  CashMovementReason as CashReason,
  CashSession,
  CashSessionClosedPublic,
  CashSessionDetail,
  CashSessionListItem,
  CashSessionNote,
  CashSessionPublic,
  CashSessionStatus,
  CashSummary,
  CashSessionSalesSummary,
  CreateCashMovementRequest as CreateCashMovementBody,
  ManualCashReason,
  PaymentMethodSummary,
  PreviousClosing,
  Shift,
} from '@kiosco/shared';

import type { CashSessionClosedPublic, CashSessionDetail } from '@kiosco/shared';

export interface CashListParams {
  page?: number;
  from?: string;
  to?: string;
  status?: CashSessionStatus;
  shift?: Shift;
  hasDifference?: boolean;
  hasOpeningDifference?: boolean;
}

export interface CloseCashBody {
  countedCash: string;
  closingNote?: string;
}

/** Resultado de cerrar: el empleado solo recibe lo suyo; encargado y dueño, el detalle. */
export type CloseResult =
  | { kind: 'public'; session: CashSessionClosedPublic }
  | { kind: 'detail'; session: CashSessionDetail };
