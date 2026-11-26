// Tipos de proveedores, compras y cuenta corriente, según docs/api/proveedores.md y compras.md.
// TODO(etapa 5): cuando backend publique los esquemas en @kiosco/shared (carpetas suppliers/ y
// purchases/), reemplazar estas definiciones por los tipos inferidos de Zod.
import type { Paginated, SaleUnit } from '@kiosco/shared';

export type { Paginated, SaleUnit };

export type Weekday = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type PaymentSource = 'CASH_REGISTER' | 'CASH_OUTSIDE_REGISTER' | 'BANK_TRANSFER' | 'OTHER';
export type EntryType = 'OPENING_BALANCE' | 'PURCHASE' | 'PURCHASE_VOID' | 'PAYMENT' | 'ADJUSTMENT';
export type DocumentType = 'INVOICE' | 'DELIVERY_NOTE' | 'OTHER';
export type PurchaseStatus = 'CONFIRMED' | 'VOIDED';
export type QuantityMode = 'UNIT' | 'PACK';

export interface UserRef {
  id: number;
  fullName: string;
}

export interface Supplier {
  id: number;
  name: string;
  phone: string | null;
  whatsappPhone: string | null;
  email: string | null;
  taxId: string | null;
  visitDays: Weekday[];
  notes: string | null;
  isActive: boolean;
  balance: string;
  hasOpeningBalance: boolean;
  defaultProductCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: 'true' | 'false';
  hasBalance?: 'true' | 'false';
  sortBy?: 'name' | 'balance';
  sortOrder?: 'asc' | 'desc';
}

export interface SupplierBody {
  name?: string;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  visitDays?: Weekday[];
  notes?: string | null;
  isActive?: boolean;
  confirmDuplicateTaxId?: boolean;
}

export interface AccountEntry {
  id: number;
  supplierId: number;
  type: EntryType;
  amount: string;
  entryDate: string;
  balanceAfter: string;
  purchase: {
    id: number;
    documentType: DocumentType;
    documentNumber: string | null;
    status: PurchaseStatus;
  } | null;
  paymentSource: PaymentSource | null;
  reference: string | null;
  description: string | null;
  cashMovement: { id: number; cashSessionId: number } | null;
  user: UserRef;
  createdAt: string;
}

export interface AccountResponse {
  supplier: { id: number; name: string; isActive: boolean };
  balance: string;
  items: AccountEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PaymentBody {
  clientRequestId: string;
  amount: string;
  source: PaymentSource;
  entryDate?: string | null;
  reference?: string | null;
  description?: string | null;
  confirmOverpayment?: boolean;
}

export interface PaymentResponse {
  entry: AccountEntry;
  balance: string;
  isReplay: boolean;
}

export interface EntryResponse {
  entry: AccountEntry;
  balance: string;
}

export interface AssignProductsResponse {
  supplierId: number;
  products: { id: number; name: string; previousSupplier: { id: number; name: string } | null }[];
}

export interface SuggestedOrderItem {
  productId: number;
  name: string;
  barcode: string | null;
  saleUnit: SaleUnit;
  stockQuantity: string;
  minStock: string;
  shortfall: string;
  suggestedQuantity: string;
  unitsPerPack: string | null;
}

export interface SuggestedOrder {
  supplier: { id: number; name: string; isActive: boolean; whatsappPhone: string | null };
  storeName: string;
  items: SuggestedOrderItem[];
  isTruncated: boolean;
  text: string;
  whatsappUrl: string | null;
}

// ---- Compras ----

export type PurchaseLineBody =
  | {
      productId: number;
      quantityMode: 'UNIT';
      quantity: string;
      unitNetCost: string;
      vatRatePercent: string;
    }
  | {
      productId: number;
      quantityMode: 'PACK';
      packCount: string;
      unitsPerPack: string;
      packNetCost: string;
      vatRatePercent: string;
    };

export interface PayNowBody {
  source: PaymentSource;
  amount: string;
  reference?: string | null;
}

export interface CreatePurchaseBody {
  clientRequestId: string;
  supplierId: number;
  documentType: DocumentType;
  documentNumber?: string | null;
  documentDate: string;
  items: PurchaseLineBody[];
  otherChargesAmount?: string;
  notes?: string | null;
  payNow?: PayNowBody | null;
  confirmDuplicateDocument?: boolean;
  confirmOverpayment?: boolean;
}

export interface PurchaseItem {
  id: number;
  productId: number;
  productName: string;
  saleUnit: SaleUnit;
  quantityMode: QuantityMode;
  packCount: string | null;
  unitsPerPack: string | null;
  packNetCost: string | null;
  quantity: string;
  unitNetCost: string;
  vatRatePercent: string;
  unitCost: string;
  lineNetTotal: string;
  lineTotal: string;
  previousNetCostPrice: string;
  previousCostPrice: string;
}

export interface VatBreakdownRow {
  vatRatePercent: string;
  netAmount: string;
  vatAmount: string;
}

export interface PurchaseAttachment {
  id: number;
  purchaseId: number;
  originalFileName: string;
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  uploadedBy: UserRef;
  createdAt: string;
  url: string;
}

export interface PurchasePayNow {
  entryId: number;
  amount: string;
  source: PaymentSource;
  reference: string | null;
  entryDate: string;
  cashMovement: { id: number; cashSessionId: number } | null;
}

export interface Purchase {
  id: number;
  status: PurchaseStatus;
  supplier: { id: number; name: string };
  documentType: DocumentType;
  documentNumber: string | null;
  documentDate: string;
  netTotal: string;
  vatTotal: string;
  vatBreakdown: VatBreakdownRow[];
  otherChargesAmount: string;
  total: string;
  notes: string | null;
  user: UserRef;
  createdAt: string;
  voidedAt: string | null;
  voidedBy: UserRef | null;
  voidReason: string | null;
  items: PurchaseItem[];
  attachments: PurchaseAttachment[];
  payNowPayments: PurchasePayNow[];
}

export interface CostChange {
  productId: number;
  productName: string;
  previousNetCostPrice: string;
  newNetCostPrice: string;
  previousCostPrice: string;
  newCostPrice: string;
  netCostChangePercent: string | null;
  salePrice: string;
}

export interface CreatePurchaseResponse {
  purchase: Purchase;
  isReplay: boolean;
  costChanges: CostChange[];
  supplierBalance: string;
}

export interface PurchaseListItem {
  id: number;
  status: PurchaseStatus;
  supplier: { id: number; name: string };
  documentType: DocumentType;
  documentNumber: string | null;
  documentDate: string;
  netTotal: string;
  vatTotal: string;
  otherChargesAmount: string;
  total: string;
  paidNowAmount: string;
  itemCount: number;
  attachmentCount: number;
  user: UserRef;
  createdAt: string;
  voidedAt: string | null;
}

export interface PurchaseListParams {
  page?: number;
  from?: string;
  to?: string;
  supplierId?: number;
  documentNumber?: string;
}

export interface VoidPurchaseResponse {
  purchase: Purchase;
  stockWarnings: { productId: number; productName?: string; stockQuantity?: string }[];
  supplierBalance: string;
}
