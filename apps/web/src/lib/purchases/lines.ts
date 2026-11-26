// Líneas de la compra en la pantalla: lo que se escribe, su control y su paso al pedido y al cálculo.
import { Decimal } from '@kiosco/shared';
import { exceedsDecimals, numberFormatError, parseDecimal, toApiNumber, toInputText } from '../catalog/decimalInput';
import { checkMoney, checkQuantity } from '../catalog/validation';
import type { CalcLine } from './calculate';
import type { PurchaseLineBody, QuantityMode, SaleUnit } from './types';

/** Producto elegido para la línea (de la ficha completa: trae el IVA y las unidades por bulto). */
export interface LineProduct {
  id: number;
  name: string;
  saleUnit: SaleUnit;
  vatRatePercent: string;
  unitsPerPack: string | null;
  stockQuantity: string;
  defaultSupplier: { id: number; name: string } | null;
}

export interface LineDraft {
  key: string;
  product: LineProduct;
  mode: QuantityMode;
  quantity: string;
  unitNetCost: string;
  packCount: string;
  unitsPerPack: string;
  packNetCost: string;
  vat: string;
}

export function newLine(key: string, product: LineProduct): LineDraft {
  const hasPack = product.unitsPerPack !== null && product.saleUnit === 'UNIT';
  return {
    key,
    product,
    // Si el producto ya tiene bulto cargado, se sugiere comprar por bulto (se puede cambiar).
    mode: hasPack ? 'PACK' : 'UNIT',
    quantity: '',
    unitNetCost: '',
    packCount: '',
    unitsPerPack: product.unitsPerPack ? toInputText(product.unitsPerPack) : '',
    packNetCost: '',
    vat: new Decimal(product.vatRatePercent).toFixed(),
  };
}

export type LineField = 'quantity' | 'unitNetCost' | 'packCount' | 'unitsPerPack' | 'packNetCost';

export interface LineCheck {
  errors: Partial<Record<LineField, string>>;
  calc: CalcLine | null;
  body: PurchaseLineBody | null;
}

function requiredMoney(text: string, label: string) {
  if (text.trim() === '') return { error: `${label}: escribí el costo (puede ser 0).` };
  const check = checkMoney(text, label);
  return check.error ? { error: check.error } : { value: check.value! };
}

function requiredPositive(text: string, unit: SaleUnit, label: string) {
  if (text.trim() === '') return { error: `${label}: escribí la cantidad.` };
  const check = checkQuantity(text, unit, label);
  if (check.error) return { error: check.error };
  if (!check.value!.gt(0)) return { error: `${label}: tiene que ser mayor que cero.` };
  return { value: check.value! };
}

/** Controla una línea. Si está completa y bien, devuelve lo necesario para calcular y para enviar. */
export function checkLine(line: LineDraft): LineCheck {
  const errors: LineCheck['errors'] = {};
  const unit = line.product.saleUnit;
  if (line.mode === 'UNIT') {
    const quantity = requiredPositive(line.quantity, unit, 'La cantidad');
    const cost = requiredMoney(line.unitNetCost, 'El costo');
    if ('error' in quantity) errors.quantity = quantity.error;
    if ('error' in cost) errors.unitNetCost = cost.error;
    if ('value' in quantity && 'value' in cost) {
      return {
        errors,
        calc: {
          mode: 'UNIT',
          quantity: quantity.value,
          unitNetCost: cost.value,
          vatRatePercent: line.vat,
        },
        body: {
          productId: line.product.id,
          quantityMode: 'UNIT',
          quantity: toApiNumber(quantity.value),
          unitNetCost: toApiNumber(cost.value),
          vatRatePercent: line.vat,
        },
      };
    }
    return { errors, calc: null, body: null };
  }

  // Bultos: se cuentan enteros (un bulto no se parte).
  let count: Decimal | undefined;
  if (line.packCount.trim() === '') errors.packCount = 'Escribí cuántos bultos.';
  else {
    const parsed = parseDecimal(line.packCount);
    if (parsed === null) {
      errors.packCount = numberFormatError(line.packCount, 'Los bultos: escribí solo números.');
    } else if (!parsed.isInteger() || parsed.lt(1)) {
      errors.packCount = 'Los bultos se cuentan enteros (1 o más). Para media caja, cargá por unidad.';
    } else if (exceedsDecimals(parsed, 0) || parsed.gt(999999)) {
      errors.packCount = 'Son demasiados bultos. Revisá el número.';
    } else count = parsed;
  }
  const perPack = requiredPositive(line.unitsPerPack, unit, 'Las unidades por bulto');
  const cost = requiredMoney(line.packNetCost, 'El costo del bulto');
  if ('error' in perPack) errors.unitsPerPack = perPack.error;
  if ('error' in cost) errors.packNetCost = cost.error;
  if (count && 'value' in perPack && 'value' in cost) {
    return {
      errors,
      calc: {
        mode: 'PACK',
        packCount: count,
        unitsPerPack: perPack.value,
        packNetCost: cost.value,
        vatRatePercent: line.vat,
      },
      body: {
        productId: line.product.id,
        quantityMode: 'PACK',
        packCount: toApiNumber(count),
        unitsPerPack: toApiNumber(perPack.value),
        packNetCost: toApiNumber(cost.value),
        vatRatePercent: line.vat,
      },
    };
  }
  return { errors, calc: null, body: null };
}
