// Tipos de proveedores, compras y cuenta corriente: salen de los esquemas Zod de @kiosco/shared
// (el mismo contrato que valida el backend, docs/api/proveedores.md y compras.md).
// Acá solo se les da el nombre corto que usan las pantallas y se agregan los filtros de las listas.
import type {
  CreateSupplierPaymentRequest,
  CreatePurchaseRequest,
  PayNowInput,
  PurchaseDocumentType,
  PurchaseLineInput,
  PurchaseQuantityMode,
  SupplierAccountEntry,
  SupplierAccountResponse,
  SupplierEntryResponse,
  SupplierEntryType,
  SupplierPaymentResponse,
  SupplierPaymentSource,
  SuggestedOrderResponse,
  UpdateSupplierRequest,
} from '@kiosco/shared';

export type {
  AssignProductsResponse,
  CostChange,
  CreatePurchaseResponse,
  Paginated,
  Purchase,
  PurchaseAttachment,
  PurchaseItem,
  PurchaseListItem,
  PurchasePayNow,
  PurchaseStatus,
  SaleUnit,
  Supplier,
  VoidPurchaseResponse,
  Weekday,
} from '@kiosco/shared';

export type PaymentSource = SupplierPaymentSource;
export type EntryType = SupplierEntryType;
export type DocumentType = PurchaseDocumentType;
export type QuantityMode = PurchaseQuantityMode;
export type AccountEntry = SupplierAccountEntry;
export type AccountResponse = SupplierAccountResponse;
export type PaymentBody = CreateSupplierPaymentRequest;
export type PaymentResponse = SupplierPaymentResponse;
export type EntryResponse = SupplierEntryResponse;
export type SuggestedOrder = SuggestedOrderResponse;
export type SuggestedOrderItem = SuggestedOrderResponse['items'][number];
export type SupplierBody = UpdateSupplierRequest;
export type PurchaseLineBody = PurchaseLineInput;
export type PayNowBody = PayNowInput;
export type CreatePurchaseBody = CreatePurchaseRequest;

export interface SupplierListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: 'true' | 'false';
  hasBalance?: 'true' | 'false';
  sortBy?: 'name' | 'balance';
  sortOrder?: 'asc' | 'desc';
}

export interface PurchaseListParams {
  page?: number;
  from?: string;
  to?: string;
  supplierId?: number;
  documentNumber?: string;
}
