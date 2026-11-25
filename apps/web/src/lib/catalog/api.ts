// Pedidos a la API de productos, categorías, precios, stock y configuración.
// Rutas y formas: docs/api/productos-stock.md. Las claves de caché están acá para que
// cada pantalla sepa qué invalidar.
import { api } from '../api';
import type {
  CategoryListResponse,
  CreateProductRequest,
  CreateStockAdjustmentRequest,
  Paginated,
  Product,
  ProductPricing,
  Settings,
  StockAdjustmentResponse,
  StockListItem,
  StockMovementView,
  UpdatePricingRequest,
  UpdateProductRequest,
  Category,
  Subcategory,
  ProductWithCost,
} from './types';

export const keys = {
  settings: ['settings'] as const,
  categories: ['categories'] as const,
  products: ['products'] as const,
  product: (id: number) => ['products', 'detail', id] as const,
  pricing: (id: number) => ['pricing', id] as const,
  movements: (id: number) => ['movements', id] as const,
  stockLists: ['stock-lists'] as const,
};

/** Arma "?a=1&b=2" salteando lo vacío. */
export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

export interface ProductListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  categoryId?: number;
  subcategoryId?: number;
  isActive?: 'true' | 'false';
  needsRestock?: 'true' | 'false';
}

export const catalogApi = {
  settings: (signal?: AbortSignal) => api.get<Settings>('/api/settings', signal),
  updateSettings: (
    body: Partial<Pick<Settings, 'storeName' | 'priceRoundingStep' | 'businessDayCutoff'>>,
  ) => api.patch<Settings>('/api/settings', body),

  categories: (signal?: AbortSignal) => api.get<CategoryListResponse>('/api/categories', signal),
  createCategory: (body: { name: string; marginPercent: string }) =>
    api.post<Category>('/api/categories', body),
  updateCategory: (
    id: number,
    body: { name?: string; marginPercent?: string; isActive?: boolean },
  ) => api.patch<Category>(`/api/categories/${id}`, body),
  createSubcategory: (categoryId: number, body: { name: string; marginPercent?: string | null }) =>
    api.post<Subcategory>(`/api/categories/${categoryId}/subcategories`, body),
  updateSubcategory: (
    id: number,
    body: { name?: string; marginPercent?: string | null; isActive?: boolean },
  ) => api.patch<Subcategory>(`/api/subcategories/${id}`, body),

  products: (params: ProductListParams, signal?: AbortSignal) =>
    api.get<Paginated<Product>>(`/api/products${toQuery({ ...params })}`, signal),
  product: (id: number, signal?: AbortSignal) => api.get<Product>(`/api/products/${id}`, signal),
  createProduct: (body: CreateProductRequest) => api.post<ProductWithCost>('/api/products', body),
  updateProduct: (id: number, body: UpdateProductRequest) =>
    api.patch<Product>(`/api/products/${id}`, body),

  pricing: (id: number, signal?: AbortSignal) =>
    api.get<ProductPricing>(`/api/products/${id}/pricing`, signal),
  updatePricing: (id: number, body: UpdatePricingRequest) =>
    api.patch<ProductPricing>(`/api/products/${id}/pricing`, body),

  movements: (id: number, page: number, signal?: AbortSignal) =>
    api.get<Paginated<StockMovementView>>(
      `/api/products/${id}/stock-movements${toQuery({ page, pageSize: 20 })}`,
      signal,
    ),
  adjust: (id: number, body: CreateStockAdjustmentRequest) =>
    api.post<StockAdjustmentResponse>(`/api/products/${id}/stock-adjustments`, body),

  stockList: (
    kind: 'restock' | 'negative',
    params: { page: number; search?: string },
    signal?: AbortSignal,
  ) =>
    api.get<Paginated<StockListItem>>(
      `/api/stock/${kind}${toQuery({ page: params.page, pageSize: 25, search: params.search })}`,
      signal,
    ),
};
