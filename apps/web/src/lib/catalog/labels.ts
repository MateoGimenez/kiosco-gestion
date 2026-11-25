// Textos de la interfaz para valores del contrato.
import { formatQuantity } from '@kiosco/shared';
import type { SaleUnit, StockMovementType } from './types';

export const SALE_UNIT_LABELS: Record<SaleUnit, string> = { UNIT: 'Por unidad', KG: 'Por kg' };

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  SALE: 'Venta',
  SALE_VOID: 'Venta anulada',
  PURCHASE: 'Compra',
  PURCHASE_VOID: 'Compra anulada',
  ADJUSTMENT: 'Ajuste',
};

/** Cantidad con su unidad: "12" para unidades, "0,350 kg" para peso. */
export function quantityText(value: string, unit: SaleUnit): string {
  return formatQuantity(value, unit);
}

/** Cantidad con signo explícito para los movimientos: "+3" o "-2" (con el signo menos real). */
export function signedQuantityText(value: string, unit: SaleUnit): string {
  const text = formatQuantity(value, unit);
  return text.startsWith('-') || text === formatQuantity('0', unit) ? text : `+${text}`;
}

export function isNegative(value: string): boolean {
  return value.trim().startsWith('-') && !/^-0*(\.0*)?$/.test(value.trim());
}
