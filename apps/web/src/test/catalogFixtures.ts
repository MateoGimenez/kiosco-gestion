// Datos de ejemplo con la forma del contrato (docs/api/productos-stock.md) para los tests.
import type {
  Category,
  ProductPricing,
  ProductPublic,
  ProductWithCost,
  Settings,
} from '../lib/catalog/types';

export const SETTINGS: Settings = {
  storeName: 'Kiosco Don Pepe',
  priceRoundingStep: '10.00',
  businessDayCutoff: '06:00',
  updatedAt: '2026-11-25T13:00:00.000Z',
  updatedBy: null,
};

export const CATEGORIES: Category[] = [
  {
    id: 2,
    name: 'Golosinas',
    isActive: true,
    marginPercent: '40.00',
    activeProductCount: 12,
    hasMiscellaneousProduct: false,
    subcategories: [
      {
        id: 4,
        categoryId: 2,
        name: 'Chocolates',
        isActive: true,
        marginPercent: '50.00',
        activeProductCount: 12,
      },
      {
        id: 5,
        categoryId: 2,
        name: 'Caramelos',
        isActive: true,
        marginPercent: null,
        activeProductCount: 0,
      },
    ],
  },
];

export const PRODUCT_PUBLIC: ProductPublic = {
  id: 51,
  name: 'Chocolate con leche 100 g',
  barcode: '7790580123456',
  saleUnit: 'UNIT',
  category: { id: 2, name: 'Golosinas' },
  subcategory: { id: 4, name: 'Chocolates' },
  salePrice: '1820.00',
  vatRatePercent: '21.00',
  stockQuantity: '24.000',
  minStock: '6.000',
  needsRestock: false,
  unitsPerPack: null,
  isMiscellaneous: false,
  isActive: true,
  createdAt: '2026-11-25T13:10:00.000Z',
  updatedAt: '2026-11-25T13:10:00.000Z',
};

export const PRODUCT_WITH_COST: ProductWithCost = {
  ...PRODUCT_PUBLIC,
  netCostPrice: '1000.00',
  costPrice: '1210.00',
  marginPercent: null,
  effectiveMarginPercent: '50.00',
  marginSource: 'SUBCATEGORY',
  suggestedPrice: '1820.00',
  realMarginPercent: '50.41',
  defaultSupplier: null,
};

export const PRODUCT_KG: ProductPublic = {
  ...PRODUCT_PUBLIC,
  id: 52,
  name: 'Jamón cocido',
  barcode: null,
  saleUnit: 'KG',
  stockQuantity: '3.500',
  salePrice: '4990.00',
};

export const PRICING: ProductPricing = {
  productId: 51,
  name: 'Chocolate con leche 100 g',
  saleUnit: 'UNIT',
  isMiscellaneous: false,
  vatRatePercent: '21.00',
  netCostPrice: '1000.00',
  costPrice: '1210.00',
  marginPercent: null,
  subcategoryMarginPercent: '50.00',
  categoryMarginPercent: '40.00',
  effectiveMarginPercent: '50.00',
  marginSource: 'SUBCATEGORY',
  priceRoundingStep: '10.00',
  suggestedPrice: '1820.00',
  salePrice: '1820.00',
  realMarginPercent: '50.41',
  matchesSuggestedPrice: true,
  updatedAt: '2026-11-25T13:20:00.000Z',
};

export function page<T>(items: T[]) {
  return { items, page: 1, pageSize: 25, total: items.length };
}
