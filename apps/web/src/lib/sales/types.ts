// Tipos de la API de ventas y caja (docs/api/ventas.md y docs/api/caja.md).
import type {
  CashSession,
  CurrentCashSessionResponse as SharedCurrentCashResponse,
  CashSessionPublic,
  SaleLineInput,
  Paginated,
  ProductSaleItem,
  Sale,
  SaleStatus,
  SaleUnit,
  SaleWithCost,
} from '@kiosco/shared';

export type { Paginated, ProductSaleItem, SaleUnit };

export type {
  CashSession,
  CashSessionPublic,
  CreateSaleRequest,
  CreateSaleResponse,
  OpenCashSessionRequest,
  PaymentMethod,
  PaymentMethodKind,
  Sale,
  SaleItem,
  SaleListItem,
  SalePayment,
  SaleStatus,
  SaleWithCost,
  Shift,
  StockWarning,
  VoidSaleResponse,
} from '@kiosco/shared';

export type CreateSaleLine = SaleLineInput;

export type PersonRef = { id: number; fullName: string };

/** Lo que devuelve `GET /api/sales/:id`: el dueño recibe además costos y ganancia. */
export type SaleDetail = Sale | SaleWithCost;

/** Detalle de un 409 SALE_TOTAL_CHANGED (ventas.md 6.3). */
export interface TotalChangedDetails {
  expectedTotal: string;
  total: string;
  subtotal: string;
  discountAmount: string;
  items: { index: number; productId: number; unitPrice: string; lineSubtotal: string }[];
  payments: {
    index: number;
    paymentMethodId: number;
    surchargePercent: string;
    surchargeAmount: string;
    chargedAmount: string;
  }[];
}

export interface SaleListParams {
  page?: number;
  from?: string;
  to?: string;
  cashSessionId?: number;
  status?: SaleStatus;
}

/** ¿La venta trae costos y ganancia? Solo el dueño las recibe. */
export function hasCosts(sale: SaleDetail): sale is SaleWithCost {
  return 'grossProfit' in sale;
}

/** ¿La caja trae el efectivo inicial? El empleado no lo recibe (H-40). */
export function hasOpeningCash(session: CashSession | CashSessionPublic): session is CashSession {
  return 'openingCash' in session;
}

/**
 * Respuesta de `GET /api/cash-sessions/current`. Incluye los campos de la etapa 4 (caja vieja y
 * "puedo cerrarla", caja.md 3).
 * TODO: usar el esquema de `@kiosco/shared` cuando backend lo actualice.
 */
export type CurrentCashSessionResponse = SharedCurrentCashResponse & {
  isFromPreviousBusinessDay: boolean;
  canClose: boolean;
};
