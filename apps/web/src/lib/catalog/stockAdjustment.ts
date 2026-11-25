// Reglas del formulario de ajuste de stock (docs/api/productos-stock.md 8.2, H-28 y H-29).
// La persona siempre escribe un número positivo; el sistema pone el signo según el motivo.
import { CreateStockAdjustmentRequestSchema, Decimal } from '@kiosco/shared';
import { exceedsDecimals, numberFormatError, parseDecimal, toApiNumber } from './decimalInput';
import type { CreateStockAdjustmentRequest, SaleUnit, StockAdjustmentReason } from './types';

/** Cómo se interpreta lo que escribe la persona. */
export type AdjustmentMode = 'SUBTRACT' | 'ADD' | 'COUNT' | 'EITHER';

export interface ReasonInfo {
  value: StockAdjustmentReason;
  label: string;
  /** Una línea que explica qué hace el motivo en el stock. */
  effect: string;
  mode: AdjustmentMode;
}

// Orden pensado para el uso real: primero lo más común.
export const REASONS: readonly ReasonInfo[] = [
  { value: 'BREAKAGE', label: 'Rotura', effect: 'Resta del stock', mode: 'SUBTRACT' },
  {
    value: 'MISSING',
    label: 'Faltante (robo o pérdida)',
    effect: 'Resta del stock',
    mode: 'SUBTRACT',
  },
  {
    value: 'OWN_CONSUMPTION',
    label: 'Consumo propio',
    effect: 'Resta del stock',
    mode: 'SUBTRACT',
  },
  {
    value: 'COUNT_CORRECTION',
    label: 'Corrección por conteo',
    effect: 'Escribís lo que contaste y el sistema calcula la diferencia',
    mode: 'COUNT',
  },
  { value: 'INITIAL_LOAD', label: 'Carga inicial', effect: 'Suma al stock', mode: 'ADD' },
  { value: 'OTHER', label: 'Otro (con nota)', effect: 'Podés sumar o restar', mode: 'EITHER' },
];

export const REASON_LABELS: Record<StockAdjustmentReason, string> = Object.fromEntries(
  REASONS.map((r) => [r.value, r.label]),
) as Record<StockAdjustmentReason, string>;

export function reasonInfo(reason: StockAdjustmentReason): ReasonInfo {
  return REASONS.find((r) => r.value === reason) ?? REASONS[0]!;
}

export const NOTE_MAX = 500;

export interface AdjustmentInput {
  reason: StockAdjustmentReason;
  /** Lo que escribió la persona en el campo de cantidad. */
  amount: string;
  /** Solo en "Otro": hacia dónde va. */
  direction: 'ADD' | 'SUBTRACT';
  note: string;
  saleUnit: SaleUnit;
  currentStock: string;
}

export interface AdjustmentResult {
  errors: { amount?: string; note?: string };
  /** Diferencia con signo (lo que se suma o resta al stock). */
  delta: Decimal | null;
  /** Stock que va a quedar. */
  after: Decimal | null;
  request: CreateStockAdjustmentRequest | null;
}

/** Nombre del campo de cantidad según el motivo (H-28). */
export function amountLabel(reason: StockAdjustmentReason, direction: 'ADD' | 'SUBTRACT'): string {
  const mode = reasonInfo(reason).mode;
  if (mode === 'COUNT') return '¿Cuántos contaste?';
  if (mode === 'SUBTRACT') return 'Cantidad a restar';
  if (mode === 'ADD') return 'Cantidad a sumar';
  return direction === 'ADD' ? 'Cantidad a sumar' : 'Cantidad a restar';
}

/** Valida el formulario y arma el pedido con los signos que corresponden. */
export function evaluateAdjustment(input: AdjustmentInput): AdjustmentResult {
  const errors: AdjustmentResult['errors'] = {};
  const info = reasonInfo(input.reason);
  const note = input.note.trim();

  if (note.length > NOTE_MAX) errors.note = `La nota puede tener hasta ${NOTE_MAX} caracteres.`;
  if (input.reason === 'OTHER' && note === '') {
    errors.note = 'Escribí una nota para el motivo "otro": qué pasó con el producto.';
  }

  const amount = parseDecimal(input.amount);
  if (input.amount.trim() === '') {
    errors.amount = info.mode === 'COUNT' ? 'Escribí cuántos contaste.' : 'Escribí la cantidad.';
  } else if (amount === null) {
    errors.amount = numberFormatError(input.amount, 'Escribí solo números. Por ejemplo: 3 o 0,5.');
  } else if (amount.isNegative()) {
    errors.amount =
      info.mode === 'COUNT'
        ? 'Lo contado no puede ser negativo.'
        : 'Escribí el número sin signo: el sistema sabe si suma o resta.';
  } else if (input.saleUnit === 'UNIT' && !amount.isInteger()) {
    errors.amount = 'Este producto se vende por unidad: usá números enteros.';
  } else if (exceedsDecimals(amount, 3)) {
    errors.amount = 'Podés usar hasta 3 decimales (por ejemplo, 0,350).';
  } else if (amount.gte(new Decimal('1000000000'))) {
    errors.amount = 'Ese número es demasiado grande.';
  } else if (info.mode !== 'COUNT' && amount.isZero()) {
    errors.amount = 'La cantidad tiene que ser mayor que cero.';
  }

  const current = new Decimal(input.currentStock);
  if (errors.amount || amount === null) {
    return { errors, delta: null, after: null, request: null };
  }

  let delta: Decimal;
  if (info.mode === 'COUNT') {
    delta = amount.minus(current);
    if (delta.isZero()) {
      errors.amount = 'Lo contado es igual al stock actual: no hay nada que corregir.';
    }
  } else if (
    info.mode === 'SUBTRACT' ||
    (info.mode === 'EITHER' && input.direction === 'SUBTRACT')
  ) {
    delta = amount.negated();
  } else {
    delta = amount;
  }

  const after = current.plus(delta);
  if (Object.keys(errors).length > 0) return { errors, delta, after, request: null };

  const noteField = note === '' ? {} : { note };
  const candidate =
    info.mode === 'COUNT'
      ? { reason: input.reason, countedQuantity: toApiNumber(amount), ...noteField }
      : { reason: input.reason, quantity: toApiNumber(delta), ...noteField };
  // Última red de seguridad: el mismo esquema que valida el servidor (H-28, H-29, STK-05).
  const parsed = CreateStockAdjustmentRequestSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === 'note' ? 'note' : 'amount';
      errors[field] ??= issue.message;
    }
    return { errors, delta, after, request: null };
  }
  return { errors, delta, after, request: parsed.data };
}
