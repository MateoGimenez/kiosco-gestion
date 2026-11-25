// Categorías y subcategorías (docs/api/productos-stock.md, sección 5).
import type { Request } from 'express';
import {
  CategoryPublicSchema,
  CategoryWithMarginSchema,
  ERROR_CODES,
  SubcategoryWithMarginSchema,
  type CategoryListQuery,
  type CategoryListResponse,
  type CategoryPublic,
  type CategoryWithMargin,
  type CreateCategoryRequest,
  type CreateSubcategoryRequest,
  type SubcategoryWithMargin,
  type UpdateCategoryRequest,
  type UpdateSubcategoryRequest,
  type UserRole,
} from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError, parseResponse } from '../../errors';
import type { Category, Prisma, Subcategory } from '../../generated/client';
import { dec, isUniqueViolation, lockCategory, lockSubcategory, pct, type Tx } from '../../lib/db';

type CategoryWithSubs = Category & { subcategories: Subcategory[] };

interface Counts {
  /** Productos activos por subcategoría. */
  bySubcategory: Map<number, number>;
  /** Subcategoría del producto "Varios" (si existe) y su categoría. */
  miscSubcategoryId: number | null;
  miscCategoryId: number | null;
}

async function loadCounts(db: Tx): Promise<Counts> {
  const groups = await db.product.groupBy({
    by: ['subcategoryId'],
    where: { isActive: true },
    _count: { _all: true },
  });
  const misc = await db.product.findFirst({
    where: { isMiscellaneous: true },
    select: { subcategoryId: true, subcategory: { select: { categoryId: true } } },
  });
  return {
    bySubcategory: new Map(groups.map((g) => [g.subcategoryId, g._count._all])),
    miscSubcategoryId: misc?.subcategoryId ?? null,
    miscCategoryId: misc?.subcategory.categoryId ?? null,
  };
}

function toSubcategoryWithMargin(s: Subcategory, counts: Counts): SubcategoryWithMargin {
  return parseResponse(SubcategoryWithMarginSchema, {
    id: s.id,
    categoryId: s.categoryId,
    name: s.name,
    isActive: s.isActive,
    marginPercent: s.marginPercent === null ? null : pct(s.marginPercent),
    activeProductCount: counts.bySubcategory.get(s.id) ?? 0,
  });
}

function toCategoryWithMargin(c: CategoryWithSubs, counts: Counts): CategoryWithMargin {
  const subs = c.subcategories.map((s) => toSubcategoryWithMargin(s, counts));
  return parseResponse(CategoryWithMarginSchema, {
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    marginPercent: pct(c.marginPercent),
    activeProductCount: subs.reduce((n, s) => n + s.activeProductCount, 0),
    hasMiscellaneousProduct: counts.miscCategoryId === c.id,
    subcategories: subs,
  });
}

/** Empleado: sin márgenes ni conteos (el esquema no tiene esos campos). */
function toCategoryPublic(c: CategoryWithSubs): CategoryPublic {
  return parseResponse(CategoryPublicSchema, {
    id: c.id,
    name: c.name,
    isActive: c.isActive,
    subcategories: c.subcategories.map((s) => ({
      id: s.id,
      categoryId: s.categoryId,
      name: s.name,
      isActive: s.isActive,
    })),
  });
}

const SUBS_ORDER: { orderBy: Prisma.SubcategoryOrderByWithRelationInput[] } = {
  orderBy: [{ name: 'asc' }, { id: 'asc' }],
};

export async function listCategories(
  ctx: AppContext,
  role: UserRole,
  query: CategoryListQuery,
): Promise<CategoryListResponse> {
  const active = query.isActive === undefined ? undefined : query.isActive === 'true';
  const categories = await ctx.prisma.category.findMany({
    where: active === undefined ? {} : { isActive: active },
    include: {
      subcategories: {
        ...(active === undefined ? {} : { where: { isActive: active } }),
        ...SUBS_ORDER,
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
  if (role === 'EMPLOYEE') return { items: categories.map(toCategoryPublic) };
  const counts = await loadCounts(ctx.prisma);
  return { items: categories.map((c) => toCategoryWithMargin(c, counts)) };
}

// --- Reglas comunes --------------------------------------------------------------------------

async function categoryNameTaken(tx: Tx, name: string, excludeId = 0): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM categories WHERE lower(name) = lower(${name}) AND id <> ${excludeId} LIMIT 1`;
  return rows.length > 0;
}

async function subcategoryNameTaken(
  tx: Tx,
  categoryId: number,
  name: string,
  excludeId = 0,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM subcategories
    WHERE category_id = ${categoryId} AND lower(name) = lower(${name}) AND id <> ${excludeId}
    LIMIT 1`;
  return rows.length > 0;
}

const categoryNameError = () =>
  new AppError(409, ERROR_CODES.CATEGORY_NAME_TAKEN, 'Ya existe una categoría con ese nombre.', {
    field: 'name',
  });
const subcategoryNameError = () =>
  new AppError(
    409,
    ERROR_CODES.SUBCATEGORY_NAME_TAKEN,
    'Ya existe una subcategoría con ese nombre en esta categoría.',
    { field: 'name' },
  );

async function activeProductsInCategory(tx: Tx, categoryId: number): Promise<number> {
  return tx.product.count({ where: { isActive: true, subcategory: { categoryId } } });
}

/** Cambios de un objeto (solo lo que cambió) para la auditoría. */
function diff<T extends Record<string, string | boolean | null>>(
  current: T,
  wanted: Partial<T>,
): { before: Partial<T>; after: Partial<T> } {
  const before: Partial<T> = {};
  const after: Partial<T> = {};
  for (const key of Object.keys(wanted) as (keyof T)[]) {
    const next = wanted[key];
    if (next === undefined) continue;
    if (current[key] !== next) {
      before[key] = current[key];
      after[key] = next;
    }
  }
  return { before, after };
}

/** Compara márgenes como números (no como texto: "40" y "40.00" son lo mismo). */
function sameMargin(current: { toString(): string } | null, next: string | null): boolean {
  if (current === null || next === null) return current === next;
  return dec(current).eq(dec(next));
}

// --- Categorías --------------------------------------------------------------------------------

async function readCategory(tx: Tx, id: number): Promise<CategoryWithSubs> {
  const c = await tx.category.findUnique({
    where: { id },
    include: { subcategories: SUBS_ORDER },
  });
  if (!c) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La categoría no existe.');
  return c;
}

export async function createCategory(
  ctx: AppContext,
  req: Request,
  input: CreateCategoryRequest,
): Promise<CategoryWithMargin> {
  const audit = auditContext(req);
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      if (await categoryNameTaken(tx, input.name)) throw categoryNameError();
      const created = await tx.category.create({
        data: { name: input.name, marginPercent: input.marginPercent },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'CATEGORY_CREATE',
        entityType: 'Category',
        entityId: created.id,
        // H-23: queda registrado quién puso el margen inicial (el `userId` de la fila).
        details: { after: { name: created.name, marginPercent: pct(created.marginPercent) } },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return toCategoryWithMargin({ ...created, subcategories: [] }, await loadCounts(tx));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw categoryNameError();
    throw err;
  }
}

export async function updateCategory(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateCategoryRequest,
): Promise<CategoryWithMargin> {
  const audit = auditContext(req);
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      await lockCategory(tx, id);
      const current = await readCategory(tx, id);

      const currentView = {
        name: current.name,
        marginPercent: pct(current.marginPercent),
        isActive: current.isActive,
      };
      const wanted: Partial<typeof currentView> = {};
      if (input.name !== undefined) wanted.name = input.name;
      if (input.isActive !== undefined) wanted.isActive = input.isActive;
      if (
        input.marginPercent !== undefined &&
        !sameMargin(current.marginPercent, input.marginPercent)
      )
        wanted.marginPercent = pct(input.marginPercent);
      const { before, after } = diff(currentView, wanted);

      if (Object.keys(after).length === 0)
        return toCategoryWithMargin(current, await loadCounts(tx));

      if (after.name !== undefined && (await categoryNameTaken(tx, after.name, id)))
        throw categoryNameError();

      // Desactivar: no la de "Varios" (H-09) y no con productos activos adentro (H-27).
      if (after.isActive === false) {
        const counts = await loadCounts(tx);
        if (counts.miscCategoryId === id)
          throw new AppError(
            422,
            ERROR_CODES.MISC_CATEGORY_LOCKED,
            'La categoría de "Varios" no se puede desactivar.',
          );
        const activeProductCount = await activeProductsInCategory(tx, id);
        if (activeProductCount > 0)
          throw new AppError(
            422,
            ERROR_CODES.CATEGORY_HAS_ACTIVE_PRODUCTS,
            'La categoría tiene productos activos: movelos o desactivalos primero.',
            { activeProductCount },
          );
      }

      await tx.category.update({
        where: { id },
        data: {
          ...(after.name !== undefined ? { name: after.name } : {}),
          ...(after.marginPercent !== undefined ? { marginPercent: after.marginPercent } : {}),
          ...(after.isActive !== undefined ? { isActive: after.isActive } : {}),
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'CATEGORY_UPDATE',
        entityType: 'Category',
        entityId: id,
        details: { before, after },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return toCategoryWithMargin(await readCategory(tx, id), await loadCounts(tx));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw categoryNameError();
    throw err;
  }
}

// --- Subcategorías -----------------------------------------------------------------------------

export async function createSubcategory(
  ctx: AppContext,
  req: Request,
  categoryId: number,
  input: CreateSubcategoryRequest,
): Promise<SubcategoryWithMargin> {
  const audit = auditContext(req);
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      await lockCategory(tx, categoryId);
      const category = await tx.category.findUnique({ where: { id: categoryId } });
      if (!category) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La categoría no existe.');
      if (!category.isActive)
        throw new AppError(422, ERROR_CODES.CATEGORY_INACTIVE, 'La categoría está desactivada.');
      if (await subcategoryNameTaken(tx, categoryId, input.name)) throw subcategoryNameError();

      const created = await tx.subcategory.create({
        data: {
          categoryId,
          name: input.name,
          marginPercent: input.marginPercent ?? null,
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'SUBCATEGORY_CREATE',
        entityType: 'Subcategory',
        entityId: created.id,
        details: {
          after: {
            categoryId,
            name: created.name,
            marginPercent: created.marginPercent === null ? null : pct(created.marginPercent),
          },
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return toSubcategoryWithMargin(created, await loadCounts(tx));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw subcategoryNameError();
    throw err;
  }
}

export async function updateSubcategory(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateSubcategoryRequest,
): Promise<SubcategoryWithMargin> {
  const audit = auditContext(req);
  try {
    return await ctx.prisma.$transaction(async (tx) => {
      // Orden fijo de bloqueos (categoría y después subcategoría): así no hay interbloqueos con
      // el alta o la reactivación de productos, que bloquean en el mismo orden.
      const found = await tx.subcategory.findUnique({
        where: { id },
        select: { categoryId: true },
      });
      if (!found) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La subcategoría no existe.');
      await lockCategory(tx, found.categoryId);
      await lockSubcategory(tx, id);
      const current = await tx.subcategory.findUnique({
        where: { id },
        include: { category: true },
      });
      if (!current) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'La subcategoría no existe.');

      const currentView = {
        name: current.name,
        marginPercent: current.marginPercent === null ? null : pct(current.marginPercent),
        isActive: current.isActive,
      };
      const wanted: Partial<typeof currentView> = {};
      if (input.name !== undefined) wanted.name = input.name;
      if (input.isActive !== undefined) wanted.isActive = input.isActive;
      if (
        input.marginPercent !== undefined &&
        !sameMargin(current.marginPercent, input.marginPercent)
      )
        wanted.marginPercent = input.marginPercent === null ? null : pct(input.marginPercent);
      // `diff` ignora los `undefined`, pero `null` ("vuelve a heredar") sí es un cambio.
      const { before, after } = diff(currentView, wanted);

      if (Object.keys(after).length === 0)
        return toSubcategoryWithMargin(current, await loadCounts(tx));

      if (
        after.name !== undefined &&
        (await subcategoryNameTaken(tx, current.categoryId, after.name, id))
      )
        throw subcategoryNameError();

      if (after.isActive === false) {
        const counts = await loadCounts(tx);
        if (counts.miscSubcategoryId === id)
          throw new AppError(
            422,
            ERROR_CODES.MISC_CATEGORY_LOCKED,
            'La subcategoría de "Varios" no se puede desactivar.',
          );
        const activeProductCount = await tx.product.count({
          where: { subcategoryId: id, isActive: true },
        });
        if (activeProductCount > 0)
          throw new AppError(
            422,
            ERROR_CODES.SUBCATEGORY_HAS_ACTIVE_PRODUCTS,
            'La subcategoría tiene productos activos: movelos o desactivalos primero.',
            { activeProductCount },
          );
      }
      // H-26: una subcategoría de una categoría desactivada no se reactiva.
      if (after.isActive === true && !current.category.isActive)
        throw new AppError(
          422,
          ERROR_CODES.CATEGORY_INACTIVE,
          'La categoría está desactivada: reactivala primero.',
        );

      const updated = await tx.subcategory.update({
        where: { id },
        data: {
          ...(after.name !== undefined ? { name: after.name } : {}),
          ...('marginPercent' in after ? { marginPercent: after.marginPercent ?? null } : {}),
          ...(after.isActive !== undefined ? { isActive: after.isActive } : {}),
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'SUBCATEGORY_UPDATE',
        entityType: 'Subcategory',
        entityId: id,
        details: { before, after },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return toSubcategoryWithMargin(updated, await loadCounts(tx));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw subcategoryNameError();
    throw err;
  }
}
