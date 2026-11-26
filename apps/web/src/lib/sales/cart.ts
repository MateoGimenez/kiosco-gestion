// Carrito de la venta: estado puro (sin pantalla) para poder probarlo fácil.
import {
  Decimal,
  SaleCalculationError,
  calculateSale,
  lineSubtotal,
  type CalcDiscountInput,
  type CalcPaymentInput,
  type ProductSaleItem,
  type SaleCalculation,
  type SaleCalculationErrorCode,
} from '@kiosco/shared';
import { toApiNumber } from '../catalog/decimalInput';
import type { CreateSaleLine, SaleUnit } from './types';

export interface CartLine {
  key: number;
  productId: number;
  name: string;
  saleUnit: SaleUnit;
  isMiscellaneous: boolean;
  /** Precio de lista (o el que se escribió en "Varios"), con punto decimal. */
  unitPrice: string;
  quantity: string;
  description: string;
  /** Stock que había al buscarlo; null en "Varios" (no lleva stock). */
  stockQuantity: string | null;
  /** El servidor dijo que el producto se desactivó (H-34): hay que quitarlo para cobrar. */
  unavailable: boolean;
}

export interface CartState {
  lines: CartLine[];
  nextKey: number;
  /** Línea elegida (para cambiar la cantidad o quitarla con el teclado). */
  selectedKey: number | null;
}

export const EMPTY_CART: CartState = { lines: [], nextKey: 1, selectedKey: null };

export type CartAction =
  | { type: 'add'; product: ProductSaleItem; quantity: string; mode: 'sum' | 'set' }
  | { type: 'addMisc'; product: ProductSaleItem; unitPrice: string; description: string }
  | { type: 'setQuantity'; key: number; quantity: string }
  | { type: 'remove'; key: number }
  | { type: 'select'; key: number }
  | { type: 'moveSelection'; delta: 1 | -1 }
  | { type: 'clear' }
  | { type: 'reprice'; prices: { productId: number; unitPrice: string }[] }
  | { type: 'markUnavailable'; productIds: number[] };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      const { product, quantity, mode } = action;
      const existing = state.lines.find((l) => l.productId === product.id && !l.isMiscellaneous);
      if (existing) {
        const next =
          mode === 'sum' ? new Decimal(existing.quantity).plus(quantity) : new Decimal(quantity);
        return {
          ...state,
          lines: state.lines.map((l) =>
            l.key === existing.key ? { ...l, quantity: toApiNumber(next) } : l,
          ),
          selectedKey: existing.key,
        };
      }
      const line: CartLine = {
        key: state.nextKey,
        productId: product.id,
        name: product.name,
        saleUnit: product.saleUnit,
        isMiscellaneous: false,
        unitPrice: product.salePrice,
        quantity,
        description: '',
        stockQuantity: product.stockQuantity,
        unavailable: false,
      };
      return { lines: [...state.lines, line], nextKey: state.nextKey + 1, selectedKey: line.key };
    }
    case 'addMisc': {
      const line: CartLine = {
        key: state.nextKey,
        productId: action.product.id,
        name: action.product.name,
        saleUnit: 'UNIT',
        isMiscellaneous: true,
        unitPrice: action.unitPrice,
        quantity: '1',
        description: action.description,
        stockQuantity: null,
        unavailable: false,
      };
      return { lines: [...state.lines, line], nextKey: state.nextKey + 1, selectedKey: line.key };
    }
    case 'setQuantity':
      return {
        ...state,
        selectedKey: action.key,
        lines: state.lines.map((l) =>
          l.key === action.key ? { ...l, quantity: action.quantity } : l,
        ),
      };
    case 'remove': {
      const lines = state.lines.filter((l) => l.key !== action.key);
      const selectedKey =
        state.selectedKey === action.key
          ? (lines[lines.length - 1]?.key ?? null)
          : state.selectedKey;
      return { ...state, lines, selectedKey };
    }
    case 'select':
      return { ...state, selectedKey: action.key };
    case 'moveSelection': {
      if (state.lines.length === 0) return state;
      const index = state.lines.findIndex((l) => l.key === state.selectedKey);
      const next = Math.min(
        Math.max((index === -1 ? state.lines.length - 1 : index) + action.delta, 0),
        state.lines.length - 1,
      );
      return { ...state, selectedKey: state.lines[next]?.key ?? null };
    }
    case 'clear':
      return { ...state, lines: [], selectedKey: null };
    case 'reprice':
      return {
        ...state,
        lines: state.lines.map((l) => {
          const price = action.prices.find((p) => p.productId === l.productId);
          return price && !l.isMiscellaneous ? { ...l, unitPrice: price.unitPrice } : l;
        }),
      };
    case 'markUnavailable':
      return {
        ...state,
        lines: state.lines.map((l) =>
          action.productIds.includes(l.productId) ? { ...l, unavailable: true } : l,
        ),
      };
  }
}

/** ¿La cantidad pedida supera lo que había en stock? (VEN-06: se avisa, no se frena). */
export function exceedsStock(line: CartLine): boolean {
  if (line.stockQuantity === null) return false;
  return new Decimal(line.quantity).gt(line.stockQuantity);
}

/** Una línea que redondea a $ 0 no se puede vender (H-35). */
export function isZeroLine(line: CartLine): boolean {
  return lineSubtotal(line.quantity, line.unitPrice).isZero();
}

export type CartTotals =
  | { ok: true; calc: SaleCalculation }
  | { ok: false; code: SaleCalculationErrorCode; calc: SaleCalculation };

/**
 * Totales del carrito con `calculateSale`. Si una regla falla (descuento demasiado alto, línea en
 * $ 0) devuelve el código y los totales sin descuento, para que la pantalla no quede en blanco.
 */
export function computeCart(
  lines: readonly CartLine[],
  discount: CalcDiscountInput | null,
  payments: CalcPaymentInput[] = [],
): CartTotals {
  // El IVA no cambia nada de lo que se muestra al cobrar: se manda 0.
  const calcLines = lines.map((l) => ({
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    vatRatePercent: '0',
  }));
  try {
    return { ok: true, calc: calculateSale({ lines: calcLines, discount, payments }) };
  } catch (error) {
    if (!(error instanceof SaleCalculationError)) throw error;
    // Sin las líneas en $ 0 y sin descuento, para mostrar al menos el subtotal.
    const usable = calcLines.filter((l) => !lineSubtotal(l.quantity, l.unitPrice).isZero());
    const calc = calculateSale({ lines: usable, discount: null, payments: [] });
    return { ok: false, code: error.code, calc };
  }
}

/** Líneas del pedido de cobro. El precio solo viaja en "Varios" (ventas.md 2.1). */
export function toSaleLines(lines: readonly CartLine[]): CreateSaleLine[] {
  return lines.map((l) => {
    const line: CreateSaleLine = { productId: l.productId, quantity: l.quantity };
    if (l.isMiscellaneous) {
      line.unitPrice = l.unitPrice;
      if (l.description.trim() !== '') line.customDescription = l.description.trim();
    }
    return line;
  });
}

/** Descuento pedido en el carrito. El motivo es opcional (PA-15). */
export interface CartDiscount {
  type: 'AMOUNT' | 'PERCENT';
  value: string;
  reason: string;
}
