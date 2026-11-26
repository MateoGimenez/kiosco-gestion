// Cálculo de una compra: UNA sola función pura que usan la pantalla y el servidor
// (docs/api/compras.md, sección 4; ADR 002). Todo con Decimal, nunca con `number`.
//
// - Línea por unidad: neto de la línea = R-1(cantidad × costo neto unitario).
// - Línea por bulto: costo neto unitario = R-1(costo del bulto ÷ unidades por bulto) y neto de la
//   línea = bultos × costo del bulto (exacto, es lo que dice la factura).
// - IVA por alícuota sobre la SUMA de los netos (como una factura A), no línea por línea.
// - Otros cargos: suman a la deuda, no al costo ni al IVA.
import { Decimal, toDecimal, type DecimalInput } from '../decimal';
import { finalFromNet, roundToCents } from '../money';

export type PurchaseLineCalcInput =
  | {
      quantityMode: 'UNIT';
      /** Unidades (o kg). */
      quantity: DecimalInput;
      /** Costo NETO de una unidad (o de un kg). */
      unitNetCost: DecimalInput;
      vatRatePercent: DecimalInput;
    }
  | {
      quantityMode: 'PACK';
      packCount: DecimalInput;
      unitsPerPack: DecimalInput;
      /** Costo NETO de UN bulto. */
      packNetCost: DecimalInput;
      vatRatePercent: DecimalInput;
    };

export interface PurchaseLineCalculation {
  quantityMode: 'UNIT' | 'PACK';
  packCount: Decimal | null;
  unitsPerPack: Decimal | null;
  packNetCost: Decimal | null;
  /** En unidades de venta (o kg): lo que suma al stock. */
  quantity: Decimal;
  /** Costo neto por unidad, al centavo. */
  unitNetCost: Decimal;
  vatRatePercent: Decimal;
  /** Costo final por unidad (neto + IVA de la línea), al centavo. */
  unitCost: Decimal;
  lineNetTotal: Decimal;
  /** Informativo: la compra calcula el IVA por alícuota (no es la suma de estos). */
  lineTotal: Decimal;
}

export interface VatBreakdownRow {
  vatRatePercent: Decimal;
  netAmount: Decimal;
  vatAmount: Decimal;
}

export interface PurchaseCalculation {
  lines: PurchaseLineCalculation[];
  netTotal: Decimal;
  /** Una fila por alícuota, de la más alta a la más baja. */
  vatBreakdown: VatBreakdownRow[];
  vatTotal: Decimal;
  otherChargesAmount: Decimal;
  /** netTotal + vatTotal + otherChargesAmount: lo que se le debe al proveedor. */
  total: Decimal;
}

export interface PurchaseCalculationInput {
  lines: PurchaseLineCalcInput[];
  otherChargesAmount?: DecimalInput | null | undefined;
}

/** Cuentas de UNA línea (sección 4.1 del contrato). */
export function calculatePurchaseLine(line: PurchaseLineCalcInput): PurchaseLineCalculation {
  const vat = toDecimal(line.vatRatePercent);
  if (line.quantityMode === 'PACK') {
    const packCount = toDecimal(line.packCount);
    const unitsPerPack = toDecimal(line.unitsPerPack);
    const packNetCost = toDecimal(line.packNetCost);
    if (unitsPerPack.lte(0)) throw new RangeError('Las unidades por bulto tienen que ser > 0.');
    const unitNetCost = roundToCents(packNetCost.div(unitsPerPack));
    const lineNetTotal = packCount.times(packNetCost);
    return {
      quantityMode: 'PACK',
      packCount,
      unitsPerPack,
      packNetCost,
      quantity: packCount.times(unitsPerPack),
      unitNetCost,
      vatRatePercent: vat,
      unitCost: finalFromNet(unitNetCost, vat),
      lineNetTotal,
      lineTotal: finalFromNet(lineNetTotal, vat),
    };
  }
  const quantity = toDecimal(line.quantity);
  const unitNetCost = toDecimal(line.unitNetCost);
  const lineNetTotal = roundToCents(quantity.times(unitNetCost));
  return {
    quantityMode: 'UNIT',
    packCount: null,
    unitsPerPack: null,
    packNetCost: null,
    quantity,
    unitNetCost,
    vatRatePercent: vat,
    unitCost: finalFromNet(unitNetCost, vat),
    lineNetTotal,
    lineTotal: finalFromNet(lineNetTotal, vat),
  };
}

/** Cuentas de toda la compra (sección 4.2 del contrato). */
export function calculatePurchase(input: PurchaseCalculationInput): PurchaseCalculation {
  const lines = input.lines.map(calculatePurchaseLine);
  const netTotal = lines.reduce((acc, l) => acc.plus(l.lineNetTotal), new Decimal(0));

  // Una fila por alícuota (clave normalizada a 2 decimales: "21" y "21.00" son la misma).
  const byRate = new Map<string, { rate: Decimal; net: Decimal }>();
  for (const l of lines) {
    const key = l.vatRatePercent.toFixed(2);
    const row = byRate.get(key) ?? { rate: toDecimal(key), net: new Decimal(0) };
    row.net = row.net.plus(l.lineNetTotal);
    byRate.set(key, row);
  }
  const vatBreakdown: VatBreakdownRow[] = [...byRate.values()]
    .sort((a, b) => b.rate.comparedTo(a.rate))
    .map(({ rate, net }) => ({
      vatRatePercent: rate,
      netAmount: net,
      vatAmount: roundToCents(net.times(rate).div(100)),
    }));
  const vatTotal = vatBreakdown.reduce((acc, r) => acc.plus(r.vatAmount), new Decimal(0));
  const otherChargesAmount = toDecimal(input.otherChargesAmount ?? '0');
  return {
    lines,
    netTotal,
    vatBreakdown,
    vatTotal,
    otherChargesAmount,
    total: netTotal.plus(vatTotal).plus(otherChargesAmount),
  };
}

/** Variación del costo neto en %: (nuevo − anterior) ÷ anterior × 100, a 2 decimales; null si el anterior era 0. */
export function netCostChangePercent(previous: DecimalInput, next: DecimalInput): Decimal | null {
  const prev = toDecimal(previous);
  if (prev.isZero()) return null;
  return roundToCents(toDecimal(next).minus(prev).div(prev).times(100));
}
