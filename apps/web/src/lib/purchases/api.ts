// Pedidos a la API de proveedores y compras (docs/api/proveedores.md y compras.md).
import { api } from '../api';
import { toQuery } from '../catalog/api';
import type {
  AccountResponse,
  AssignProductsResponse,
  CreatePurchaseBody,
  CreatePurchaseResponse,
  EntryResponse,
  Paginated,
  PaymentBody,
  PaymentResponse,
  Purchase,
  PurchaseAttachment,
  PurchaseListItem,
  PurchaseListParams,
  Supplier,
  SupplierBody,
  SupplierListParams,
  SuggestedOrder,
  VoidPurchaseResponse,
} from './types';

export const supplierKeys = {
  all: ['suppliers'] as const,
  list: (params: SupplierListParams) => ['suppliers', 'list', params] as const,
  options: ['suppliers', 'options'] as const,
  detail: (id: number) => ['suppliers', 'detail', id] as const,
  account: (id: number, page: number) => ['suppliers', 'account', id, page] as const,
  order: (id: number) => ['suppliers', 'order', id] as const,
};
export const purchaseKeys = {
  all: ['purchases'] as const,
  list: (params: PurchaseListParams) => ['purchases', 'list', params] as const,
  detail: (id: number) => ['purchases', 'detail', id] as const,
};

export const suppliersApi = {
  list: (params: SupplierListParams, signal?: AbortSignal) =>
    api.get<Paginated<Supplier>>(`/api/suppliers${toQuery({ ...params })}`, signal),
  get: (id: number, signal?: AbortSignal) => api.get<Supplier>(`/api/suppliers/${id}`, signal),
  create: (body: SupplierBody) => api.post<Supplier>('/api/suppliers', body),
  update: (id: number, body: SupplierBody) => api.patch<Supplier>(`/api/suppliers/${id}`, body),
  assignProducts: (id: number, productIds: number[]) =>
    api.post<AssignProductsResponse>(`/api/suppliers/${id}/assign-products`, { productIds }),
  account: (id: number, page: number, signal?: AbortSignal) =>
    api.get<AccountResponse>(
      `/api/suppliers/${id}/account${toQuery({ page, pageSize: 50 })}`,
      signal,
    ),
  pay: (id: number, body: PaymentBody) =>
    api.post<PaymentResponse>(`/api/suppliers/${id}/payments`, body),
  openingBalance: (id: number, body: { amount: string; entryDate: string; description?: string }) =>
    api.post<EntryResponse>(`/api/suppliers/${id}/opening-balance`, body),
  adjust: (id: number, body: { amount: string; reason: string }) =>
    api.post<EntryResponse>(`/api/suppliers/${id}/adjustments`, body),
  suggestedOrder: (id: number, signal?: AbortSignal) =>
    api.get<SuggestedOrder>(`/api/suppliers/${id}/suggested-order`, signal),
};

export const purchasesApi = {
  list: (params: PurchaseListParams, signal?: AbortSignal) =>
    api.get<Paginated<PurchaseListItem>>(
      `/api/purchases${toQuery({ pageSize: 25, ...params })}`,
      signal,
    ),
  get: (id: number, signal?: AbortSignal) => api.get<Purchase>(`/api/purchases/${id}`, signal),
  create: (body: CreatePurchaseBody) => api.post<CreatePurchaseResponse>('/api/purchases', body),
  void: (id: number, reason: string) =>
    api.post<VoidPurchaseResponse>(`/api/purchases/${id}/void`, { reason }),
  upload: (id: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<PurchaseAttachment>(`/api/purchases/${id}/attachments`, form);
  },
  deleteAttachment: (id: number, attachmentId: number) =>
    api.delete<undefined>(`/api/purchases/${id}/attachments/${attachmentId}`),
};
