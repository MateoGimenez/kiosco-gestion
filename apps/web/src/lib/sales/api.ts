// Pedidos a la API de ventas, caja y medios de pago (docs/api/ventas.md y caja.md).
import { api } from '../api';
import { toQuery } from '../catalog/api';
import type {
  CashSession,
  CreateSaleRequest,
  CreateSaleResponse,
  CurrentCashSessionResponse,
  OpenCashSessionRequest,
  Paginated,
  PaymentMethod,
  ProductSaleItem,
  Sale,
  SaleListItem,
  SaleListParams,
  VoidSaleResponse,
} from './types';

export const salesKeys = {
  currentCash: ['cash-sessions', 'current'] as const,
  cashSessions: (from: string, to: string) => ['cash-sessions', 'list', from, to] as const,
  paymentMethods: ['payment-methods'] as const,
  miscellaneous: ['products', 'miscellaneous'] as const,
  sales: ['sales'] as const,
  sale: (id: number) => ['sales', 'detail', id] as const,
};

export const salesApi = {
  currentCash: (signal?: AbortSignal) =>
    api.get<CurrentCashSessionResponse>('/api/cash-sessions/current', signal),
  openCash: (body: OpenCashSessionRequest) => api.post<CashSession>('/api/cash-sessions', body),
  cashSessions: (from: string, to: string, signal?: AbortSignal) =>
    api.get<Paginated<CashSession>>(
      `/api/cash-sessions${toQuery({ from, to, pageSize: 50 })}`,
      signal,
    ),

  paymentMethods: (signal?: AbortSignal) =>
    api.get<{ items: PaymentMethod[] }>('/api/payment-methods', signal),
  updatePaymentMethod: (
    id: number,
    body: { surchargePercent?: string; isActive?: boolean; sortOrder?: number },
  ) => api.patch<PaymentMethod>(`/api/payment-methods/${id}`, body),

  miscellaneous: (signal?: AbortSignal) =>
    api.get<ProductSaleItem>('/api/products/miscellaneous', signal),

  create: (body: CreateSaleRequest) => api.post<CreateSaleResponse>('/api/sales', body),
  list: (params: SaleListParams, signal?: AbortSignal) =>
    api.get<Paginated<SaleListItem>>(`/api/sales${toQuery({ pageSize: 25, ...params })}`, signal),
  get: (id: number, signal?: AbortSignal) => api.get<Sale>(`/api/sales/${id}`, signal),
  void: (id: number, reason: string) =>
    api.post<VoidSaleResponse>(`/api/sales/${id}/void`, { reason }),
};
