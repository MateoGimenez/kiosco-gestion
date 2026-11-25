// Tipos de las respuestas y pedidos de Productos, precios, stock y configuración.
// Salen de los esquemas Zod de @kiosco/shared (el mismo contrato que valida el backend,
// docs/api/productos-stock.md). Acá solo se agregan las vistas que la interfaz necesita.
import type {
  CategoryPublic,
  CategoryWithMargin,
  Paginated,
  ProductPublic,
  ProductWithCost,
  StockMovement,
  StockMovementWithCost,
  SubcategoryPublic,
  SubcategoryWithMargin,
} from '@kiosco/shared';

export type {
  CreateProductRequest,
  CreateStockAdjustmentRequest,
  MarginSource,
  Paginated,
  ProductPricing,
  ProductPublic,
  ProductWithCost,
  SaleUnit,
  Settings,
  StockAdjustmentReason,
  StockAdjustmentResponse,
  StockListItem,
  StockMovementType,
  UpdateProductPricingRequest as UpdatePricingRequest,
  UpdateProductRequest,
} from '@kiosco/shared';

/** Subcategoría tal como la ve cada rol: el empleado no recibe márgenes ni conteos. */
export type Subcategory = SubcategoryPublic &
  Partial<Omit<SubcategoryWithMargin, keyof SubcategoryPublic>>;

/** Categoría tal como la ve cada rol: el empleado no recibe márgenes ni conteos. */
export type Category = Omit<CategoryPublic, 'subcategories'> &
  Partial<Omit<CategoryWithMargin, keyof CategoryPublic>> & { subcategories: Subcategory[] };

export interface CategoryListResponse {
  items: Category[];
}

/** Movimiento de stock; el costo unitario solo llega al dueño. */
export type StockMovementView = StockMovement & Partial<Pick<StockMovementWithCost, 'unitNetCost'>>;

export type Product = ProductPublic | ProductWithCost;

export function hasCost(product: Product): product is ProductWithCost {
  return 'netCostPrice' in product;
}

export type Page<T> = Paginated<T>;
