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
