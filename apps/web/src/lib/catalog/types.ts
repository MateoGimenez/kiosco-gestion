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
  CreateStockAdjustmentRequest,
  MarginSource,
  Paginated,
  ProductPricing,
  ProductPublic,
  ProductSearchResponse,
  ProductWithCost,
  SaleUnit,
  Settings,
  StockAdjustmentReason,
  StockAdjustmentResponse,
  StockListItem,
  StockMovementType,
  UpdateProductPricingRequest as UpdatePricingRequest,
} from '@kiosco/shared';
import type {
  CreateProductRequest as SharedCreateProductRequest,
  UpdateProductRequest as SharedUpdateProductRequest,
} from '@kiosco/shared';

// TODO(etapa 5): cuando shared sume `defaultSupplierId` a los pedidos de producto, quitar esto.
export type CreateProductRequest = SharedCreateProductRequest & {
  defaultSupplierId?: number | null;
};
export type UpdateProductRequest = SharedUpdateProductRequest & {
  defaultSupplierId?: number | null;
};

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

/** Proveedor habitual: solo lo reciben encargado y dueño (proveedores.md 6.1). */
export interface DefaultSupplierRef {
  id: number;
  name: string;
  isActive: boolean;
}

export type Product = (ProductPublic | ProductWithCost) & {
  defaultSupplier?: DefaultSupplierRef | null;
};

export function hasCost(product: Product): product is ProductWithCost {
  return 'netCostPrice' in product;
}

export type Page<T> = Paginated<T>;
