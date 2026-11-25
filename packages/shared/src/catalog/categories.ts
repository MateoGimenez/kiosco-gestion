// Categorías y subcategorías (docs/api/productos-stock.md, secciones 3 y 5).
import { z } from 'zod';
import { PercentInputSchema } from '../common/schemas';

export const CategoryNameSchema = z.string().trim().min(1, 'Ingresá el nombre.').max(60);
export const SubcategoryNameSchema = CategoryNameSchema;

// --- Respuestas (no estrictas: Zod descarta las claves de más, sección 2.3) ----------------

export const SubcategoryPublicSchema = z.object({
  id: z.number().int(),
  categoryId: z.number().int(),
  name: z.string(),
  isActive: z.boolean(),
});
export type SubcategoryPublic = z.infer<typeof SubcategoryPublicSchema>;

export const SubcategoryWithMarginSchema = SubcategoryPublicSchema.extend({
  /** null = usa el de la categoría (PA-22). */
  marginPercent: z.string().nullable(),
  activeProductCount: z.number().int(),
});
export type SubcategoryWithMargin = z.infer<typeof SubcategoryWithMarginSchema>;

/** Lo que ve el empleado: sin márgenes ni conteos. */
export const CategoryPublicSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isActive: z.boolean(),
  subcategories: z.array(SubcategoryPublicSchema),
});
export type CategoryPublic = z.infer<typeof CategoryPublicSchema>;

export const CategoryWithMarginSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  isActive: z.boolean(),
  marginPercent: z.string(),
  activeProductCount: z.number().int(),
  /** true en la categoría de "Varios" (no se desactiva). */
  hasMiscellaneousProduct: z.boolean(),
  subcategories: z.array(SubcategoryWithMarginSchema),
});
export type CategoryWithMargin = z.infer<typeof CategoryWithMarginSchema>;

export const CategoryListResponseSchema = z.object({
  items: z.array(z.union([CategoryWithMarginSchema, CategoryPublicSchema])),
});
export type CategoryListResponse = z.infer<typeof CategoryListResponseSchema>;

// --- Requests (estrictos) ---------------------------------------------------------------

const atLeastOne = (v: object) => Object.values(v).some((x) => x !== undefined);
const AT_LEAST_ONE = { message: 'Mandá al menos un campo para cambiar.' };

export const CategoryListQuerySchema = z.strictObject({
  isActive: z.enum(['true', 'false']).optional(),
});
export type CategoryListQuery = z.infer<typeof CategoryListQuerySchema>;

/** El margen es obligatorio (PRE-02); el encargado también lo manda: es el margen inicial (H-23). */
export const CreateCategoryRequestSchema = z.strictObject({
  name: CategoryNameSchema,
  marginPercent: PercentInputSchema,
});
export type CreateCategoryRequest = z.infer<typeof CreateCategoryRequestSchema>;

export const UpdateCategoryRequestSchema = z
  .strictObject({
    name: CategoryNameSchema.optional(),
    marginPercent: PercentInputSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export type UpdateCategoryRequest = z.infer<typeof UpdateCategoryRequestSchema>;

export const CreateSubcategoryRequestSchema = z.strictObject({
  name: SubcategoryNameSchema,
  marginPercent: PercentInputSchema.nullable().optional(),
});
export type CreateSubcategoryRequest = z.infer<typeof CreateSubcategoryRequestSchema>;

export const UpdateSubcategoryRequestSchema = z
  .strictObject({
    name: SubcategoryNameSchema.optional(),
    /** null = vuelve a usar el de la categoría. */
    marginPercent: PercentInputSchema.nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .refine(atLeastOne, AT_LEAST_ONE);
export type UpdateSubcategoryRequest = z.infer<typeof UpdateSubcategoryRequestSchema>;
