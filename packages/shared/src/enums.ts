// Enums compartidos del modelo (docs/modelo-datos.md 2.22).
// Se definen como objeto constante + tipo, así sirven en tiempo de ejecución y de compilación.

/** Rol de un usuario (permisos: docs/requisitos.md, sección 3). */
export const USER_ROLES = ['OWNER', 'MANAGER', 'EMPLOYEE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Alícuotas de IVA permitidas (ARCA). Se usa en la validación de compras y productos. */
export const VAT_RATES = ['0', '2.5', '5', '10.5', '21', '27'] as const;
export type VatRate = (typeof VAT_RATES)[number];

/** Unidad de venta de un producto (UNIT = por unidad, cantidades enteras; KG = por peso). */
export const SALE_UNITS = ['UNIT', 'KG'] as const;
export type SaleUnit = (typeof SALE_UNITS)[number];

/** Tipos de movimiento de stock (en la etapa 2 solo se crean ADJUSTMENT). */
export const STOCK_MOVEMENT_TYPES = [
  'SALE',
  'SALE_VOID',
  'PURCHASE',
  'PURCHASE_VOID',
  'ADJUSTMENT',
] as const;
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

/** Motivos de un ajuste de stock (PA-27). */
export const STOCK_ADJUSTMENT_REASONS = [
  'BREAKAGE',
  'MISSING',
  'COUNT_CORRECTION',
  'INITIAL_LOAD',
  'OWN_CONSUMPTION',
  'OTHER',
] as const;
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number];

/** De dónde salió el margen que se usa para el precio sugerido (PA-22). */
export const MARGIN_SOURCES = ['PRODUCT', 'SUBCATEGORY', 'CATEGORY'] as const;
export type MarginSource = (typeof MARGIN_SOURCES)[number];

/** Medios de pago (uno por tipo). El "efectivo" del sistema es el de tipo CASH (docs/api/ventas.md 5). */
export const PAYMENT_METHOD_KINDS = [
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'QR',
  'TRANSFER',
] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

/** Estado de una venta. */
export const SALE_STATUSES = ['COMPLETED', 'VOIDED'] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

/** Turnos de la caja (PA-32): Mañana, Tarde, Noche. */
export const SHIFTS = ['MORNING', 'AFTERNOON', 'NIGHT'] as const;
export type Shift = (typeof SHIFTS)[number];

/** Estado de una caja. */
export const CASH_SESSION_STATUSES = ['OPEN', 'CLOSED'] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

/** Tipo de descuento de una venta: monto fijo o porcentaje. */
export const DISCOUNT_TYPES = ['AMOUNT', 'PERCENT'] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

/** Sentido de un movimiento de efectivo de la caja. */
export const CASH_DIRECTIONS = ['IN', 'OUT'] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

/** Motivos de un movimiento de efectivo (PA-29). */
export const CASH_MOVEMENT_REASONS = [
  'SUPPLIER_PAYMENT',
  'OWNER_WITHDRAWAL',
  'EXPENSE',
  'CASH_CONTRIBUTION',
  'SALE_VOID_REFUND',
  'OTHER',
] as const;
export type CashMovementReason = (typeof CASH_MOVEMENT_REASONS)[number];

/** Días de la semana (días de visita de un proveedor), de lunes a domingo. */
export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Comprobante de una compra: factura, remito u otro. */
export const PURCHASE_DOCUMENT_TYPES = ['INVOICE', 'DELIVERY_NOTE', 'OTHER'] as const;
export type PurchaseDocumentType = (typeof PURCHASE_DOCUMENT_TYPES)[number];

/** Estado de una compra. */
export const PURCHASE_STATUSES = ['CONFIRMED', 'VOIDED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** Cómo se cargó una línea de compra: por unidad (o kg) o por bulto (PA-06). */
export const PURCHASE_QUANTITY_MODES = ['UNIT', 'PACK'] as const;
export type PurchaseQuantityMode = (typeof PURCHASE_QUANTITY_MODES)[number];

/** Tipos de movimiento de la cuenta corriente de un proveedor. */
export const SUPPLIER_ENTRY_TYPES = [
  'OPENING_BALANCE',
  'PURCHASE',
  'PURCHASE_VOID',
  'PAYMENT',
  'ADJUSTMENT',
] as const;
export type SupplierEntryType = (typeof SUPPLIER_ENTRY_TYPES)[number];

/** De dónde sale la plata de un pago a un proveedor (PA-08). */
export const SUPPLIER_PAYMENT_SOURCES = [
  'CASH_REGISTER',
  'CASH_OUTSIDE_REGISTER',
  'BANK_TRANSFER',
  'OTHER',
] as const;
export type SupplierPaymentSource = (typeof SUPPLIER_PAYMENT_SOURCES)[number];

/** Tipos de archivo que se aceptan como adjunto de una compra (ADR 005). */
export const ATTACHMENT_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];
