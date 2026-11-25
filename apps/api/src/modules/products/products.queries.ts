// Consultas con SQL propio: búsqueda por nombre sin mayúsculas ni acentos y listas con columnas
// comparadas entre sí (stock <= mínimo). TODO valor del usuario va como PARÁMETRO (template tag de
// Prisma); lo único que se arma como texto son nombres de columna de una lista fija (`Prisma.raw`).
import { Prisma } from '../../generated/client';
import { escapeLike, type Tx } from '../../lib/db';

/** Máximo de palabras que se usan al buscar por nombre (alcanza y evita consultas gigantes). */
const MAX_WORDS = 8;

/**
 * Cada palabra de `text` tiene que aparecer en el nombre, sin mayúsculas ni acentos.
 * Es la MISMA expresión del índice de trigramas: f_unaccent(lower(name)).
 * Los `%`, `_` y `\` escritos por el usuario se escapan: se buscan como texto.
 */
export function nameMatches(text: string): Prisma.Sql {
  const words = text.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  if (words.length === 0) return Prisma.sql`TRUE`;
  const conditions = words.map(
    (w) =>
      Prisma.sql`f_unaccent(lower(p.name)) ILIKE '%' || f_unaccent(lower(${escapeLike(w)})) || '%'`,
  );
  return Prisma.join(conditions, ' AND ');
}

/** Orden "primero los que EMPIEZAN con el texto, después alfabético". */
export function nameStartsWithFirst(text: string): Prisma.Sql {
  return Prisma.sql`CASE WHEN f_unaccent(lower(p.name)) ILIKE f_unaccent(lower(${escapeLike(text.trim())})) || '%' THEN 0 ELSE 1 END`;
}

/** Ids de productos ACTIVOS cuyo nombre contiene todas las palabras de `text` (búsqueda del mostrador). */
export async function searchActiveProductIdsByName(
  db: Tx,
  text: string,
  limit: number,
): Promise<number[]> {
  const rows = await db.$queryRaw<{ id: number }[]>`
    SELECT p.id
    FROM products p
    WHERE p.is_active AND ${nameMatches(text)}
    ORDER BY ${nameStartsWithFirst(text)}, lower(p.name), p.id
    LIMIT ${limit}`;
  return rows.map((r) => r.id);
}

export interface ProductFilters {
  search?: string | undefined;
  categoryId?: number | undefined;
  subcategoryId?: number | undefined;
  isActive?: boolean | undefined;
  saleUnit?: 'UNIT' | 'KG' | undefined;
  needsRestock?: boolean | undefined;
  /** Condiciones fijas de la lista (por ejemplo, "para reponer"). */
  extra?: Prisma.Sql[];
}

/** Condiciones WHERE (unidas con AND) de una lista de productos. Las tablas son `products p` y `subcategories s`. */
export function productConditions(f: ProductFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.search) {
    // Nombre (como en la búsqueda) o código de barras que EMPIEZA con el texto.
    parts.push(
      Prisma.sql`((${nameMatches(f.search)}) OR p.barcode LIKE ${escapeLike(f.search)} || '%')`,
    );
  }
  if (f.categoryId !== undefined) parts.push(Prisma.sql`s.category_id = ${f.categoryId}`);
  if (f.subcategoryId !== undefined) parts.push(Prisma.sql`p.subcategory_id = ${f.subcategoryId}`);
  if (f.isActive !== undefined) parts.push(Prisma.sql`p.is_active = ${f.isActive}`);
  if (f.saleUnit !== undefined) parts.push(Prisma.sql`p.sale_unit = ${f.saleUnit}::sale_unit`);
  if (f.needsRestock !== undefined) {
    parts.push(
      f.needsRestock
        ? Prisma.sql`(NOT p.is_miscellaneous AND p.stock_quantity <= p.min_stock)`
        : Prisma.sql`(p.is_miscellaneous OR p.stock_quantity > p.min_stock)`,
    );
  }
  for (const e of f.extra ?? []) parts.push(e);
  return Prisma.join(parts, ' AND ');
}

/** Columnas por las que se puede ordenar la lista del ABM (lista fija: nunca texto del usuario). */
const SORT_COLUMNS = {
  name: 'lower(p.name)',
  barcode: 'p.barcode',
  salePrice: 'p.sale_price',
  stockQuantity: 'p.stock_quantity',
  updatedAt: 'p.updated_at',
} as const;
export type ProductSortField = keyof typeof SORT_COLUMNS;

export function productOrderBy(field: ProductSortField, order: 'asc' | 'desc'): Prisma.Sql {
  const column = Prisma.raw(SORT_COLUMNS[field]);
  const direction = Prisma.raw(order === 'desc' ? 'DESC' : 'ASC');
  return Prisma.sql`${column} ${direction} NULLS LAST, p.id ASC`;
}

/** Una página de ids (ya ordenados) y el total. */
export async function pageProductIds(
  db: Tx,
  where: Prisma.Sql,
  orderBy: Prisma.Sql,
  page: number,
  pageSize: number,
): Promise<{ ids: number[]; total: number }> {
  const offset = (page - 1) * pageSize;
  const [rows, totals] = await Promise.all([
    db.$queryRaw<{ id: number }[]>`
      SELECT p.id FROM products p JOIN subcategories s ON s.id = p.subcategory_id
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${pageSize} OFFSET ${offset}`,
    db.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM products p JOIN subcategories s ON s.id = p.subcategory_id
      WHERE ${where}`,
  ]);
  return { ids: rows.map((r) => r.id), total: totals[0]?.total ?? 0 };
}
