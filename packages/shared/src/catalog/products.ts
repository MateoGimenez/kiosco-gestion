// Productos y precios (docs/api/productos-stock.md, secciones 3, 6 y 7).
import { z } from 'zod';
import { MARGIN_SOURCES, SALE_UNITS } from '../enums';
import {
  MoneyInputSchema,
  PaginationQueryShape,
  PercentInputSchema,
  QuantityInputSchema,
  QueryBooleanSchema,
  QueryIdSchema,
  VatRateInputSchema,
} from '../common/schemas';

export const SaleUnitSchema = z.enum(SALE_UNITS);
export const MarginSourceSchema = z.enum(MARGIN_SOURCES);

export const ProductNameSchema = z.string().trim().min(1, 'Ingresá el nombre.').max(120);

/** Código de barras: 1 a 50 caracteres imprimibles sin espacios. "" = sin código (null). */
export const BarcodeSchema = z
  .string('Tiene que ser un texto.')
  .trim()
  .pipe(
    z.union([
      z.literal('').transform(() => null),
      z.string().regex(/^[\x21-\x7E]{1,50}$/, 'Usá de 1 a 50 caracteres, sin espacios.'),
    ]),
  );

// --- Respuestas (no estrictas) -------------------------------------------------------------

const NamedRefSchema = z.object({ id: z.number().int(), name: z.string() });

/** Mostrador: lo mínimo para agregar a la venta. Nunca costo, ni siquiera para el dueño. */
export const ProductSaleItemSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  barcode: z.string().nullable(),
  saleUnit: SaleUnitSchema,
  salePrice: z.string(),
  stockQuantity: z.string(),
  isMiscellaneous: z.boolean(),
});
export type ProductSaleItem = z.infer<typeof ProductSaleItemSchema>;

export const ProductSearchResponseSchema = z.object({
  matchedBy: z.enum(['BARCODE', 'NAME']),
  items: z.array(ProductSaleItemSchema),
  isInactiveBarcode: z.boolean(),
});
export type ProductSearchResponse = z.infer<typeof ProductSearchResponseSchema>;

/** Ficha y lista para cualquier rol. NO tiene ningún campo de costo ni de margen. */
export const ProductPublicSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  barcode: z.string().nullable(),
  saleUnit: SaleUnitSchema,
  category: NamedRefSchema,
  subcategory: NamedRefSchema,
  salePrice: z.string(),
  vatRatePercent: z.string(),
  stockQuantity: z.string(),
  minStock: z.string(),
  needsRestock: z.boolean(),
  unitsPerPack: z.string().nullable(),
  isMiscellaneous: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProductPublic = z.infer<typeof ProductPublicSchema>;

/** Encargado (etapa 5): `ProductPublic` + proveedor habitual. El empleado nunca recibe el campo. */
export const ProductBackofficeSchema = ProductPublicSchema.extend({
  defaultSupplier: z
    .object({ id: z.number().int(), name: z.string(), isActive: z.boolean() })
    .nullable()
    // La API siempre lo manda; es opcional en el tipo para no romper los datos de prueba de la pantalla.
    .optional(),
});
export type ProductBackoffice = z.infer<typeof ProductBackofficeSchema>;

/** Solo dueño (y encargado en el alta): `ProductBackoffice` + datos de precio. */
export const ProductWithCostSchema = ProductBackofficeSchema.extend({
  netCostPrice: z.string(),
  costPrice: z.string(),
  marginPercent: z.string().nullable(),
  effectiveMarginPercent: z.string(),
  marginSource: MarginSourceSchema,
  suggestedPrice: z.string().nullable(),
  realMarginPercent: z.string().nullable(),
});
export type ProductWithCost = z.infer<typeof ProductWithCostSchema>;

/** Pantalla de precios de un producto (dueño y encargado). */
export const ProductPricingSchema = z.object({
  productId: z.number().int(),
  name: z.string(),
  saleUnit: SaleUnitSchema,
  isMiscellaneous: z.boolean(),
  vatRatePercent: z.string(),
  netCostPrice: z.string(),
  costPrice: z.string(),
  marginPercent: z.string().nullable(),
  subcategoryMarginPercent: z.string().nullable(),
  categoryMarginPercent: z.string(),
  effectiveMarginPercent: z.string(),
  marginSource: MarginSourceSchema,
  priceRoundingStep: z.string(),
  suggestedPrice: z.string().nullable(),
  salePrice: z.string(),
  realMarginPercent: z.string().nullable(),
  matchesSuggestedPrice: z.boolean(),
  updatedAt: z.string(),
});
export type ProductPricing = z.infer<typeof ProductPricingSchema>;

export const ProductPublicPageSchema = z.object({
  items: z.array(ProductPublicSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const ProductBackofficePageSchema = z.object({
  items: z.array(ProductBackofficeSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export const ProductWithCostPageSchema = z.object({
  items: z.array(ProductWithCostSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});

// --- Requests (estrictos) -------------------------------------------------------------------

const atLeastOne = (v: object) => Object.values(v).some((x) => x !== undefined);
const AT_LEAST_ONE = { message: 'Mandá al menos un campo para cambiar.' };

// Mayor que 0: un texto sin ningún dígito distinto de cero ("0", "0.000") no sirve.
const UnitsPerPackSchema = QuantityInputSchema.refine(
  (v) => /[1-9]/.test(v),
  'Tiene que ser mayor que 0.',
);

export const ProductSearchQuerySchema = z.strictObject({
  q: z.string().trim().min(1, 'Escribí qué buscar.').max(100),
  limit: z
    .string()
    .regex(/^\d{1,2}$/, 'Tiene que ser un número entre 1 y 50.')
    .transform(Number)
    .refine((n) => n >= 1 && n <= 50, 'Tiene que ser un número entre 1 y 50.')
    .default(20),
});
export type ProductSearchQuery = z.infer<typeof ProductSearchQuerySchema>;

export const PRODUCT_SORT_FIELDS = [
  'name',
  'barcode',
  'salePrice',
  'stockQuantity',
  'updatedAt',
] as const;

export const ProductListQuerySchema = z
  .strictObject({
    ...PaginationQueryShape,
    /** Solo encargado y dueño (el empleado: 403). */
    supplierId: QueryIdSchema.optional(),
    withoutSupplier: z.enum(['true']).optional(),
    search: z.string().trim().min(1).max(100).optional(),
    categoryId: QueryIdSchema.optional(),
    subcategoryId: QueryIdSchema.optional(),
    isActive: QueryBooleanSchema.optional(),
    saleUnit: SaleUnitSchema.optional(),
    needsRestock: QueryBooleanSchema.optional(),
    sortBy: z.enum(PRODUCT_SORT_FIELDS).default('name'),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  })
  .refine((v) => v.supplierId === undefined || v.withoutSupplier === undefined, {
    path: ['withoutSupplier'],
    message: 'No mandes supplierId y withoutSupplier juntos.',
  });
export type ProductListQuery = z.infer<typeof ProductListQuerySchema>;

export const CreateProductRequestSchema = z.strictObject({
  name: ProductNameSchema,
  barcode: BarcodeSchema.nullable().optional(),
  saleUnit: SaleUnitSchema,
  subcategoryId: z.number().int().positive().max(2_147_483_647),
  vatRatePercent: VatRateInputSchema.optional(),
  netCostPrice: MoneyInputSchema.optional(),
  /** Solo el dueño (H-05). */
  marginPercent: PercentInputSchema.nullable().optional(),
  salePrice: MoneyInputSchema,
  minStock: QuantityInputSchema.optional(),
  unitsPerPack: UnitsPerPackSchema.nullable().optional(),
  /** Proveedor habitual (etapa 5). */
  defaultSupplierId: z.number().int().positive().max(2_147_483_647).nullable().optional(),
  initialStock: QuantityInputSchema.optional(),
  /** Confirma guardar un precio por debajo del costo (si no, 422 PRICE_BELOW_COST). */
  confirmBelowCost: z.boolean().optional(),
});
export type CreateProductRequest = z.infer<typeof CreateProductRequestSchema>;

export const UpdateProductRequestSchema = z
  .strictObject({
    name: ProductNameSchema.optional(),
    barcode: BarcodeSchema.nullable().optional(),
    saleUnit: SaleUnitSchema.optional(),
    subcategoryId: z.number().int().positive().max(2_147_483_647).optional(),
    vatRatePercent: VatRateInputSchema.optional(),
    minStock: QuantityInputSchema.optional(),
    unitsPerPack: UnitsPerPackSchema.nullable().optional(),
    defaultSupplierId: z.number().int().positive().max(2_147_483_647).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export type UpdateProductRequest = z.infer<typeof UpdateProductRequestSchema>;

export const UpdateProductPricingRequestSchema = z
  .strictObject({
    salePrice: MoneyInputSchema.optional(),
    netCostPrice: MoneyInputSchema.optional(),
    /** Solo el dueño (H-05); null = vuelve a heredar. */
    marginPercent: PercentInputSchema.nullable().optional(),
    /** Confirma guardar un precio por debajo del costo (si no, 422 PRICE_BELOW_COST). */
    confirmBelowCost: z.boolean().optional(),
  })
  .refine(
    (v) => Object.entries(v).some(([k, x]) => k !== 'confirmBelowCost' && x !== undefined),
    AT_LEAST_ONE,
  );
export type UpdateProductPricingRequest = z.infer<typeof UpdateProductPricingRequestSchema>;
