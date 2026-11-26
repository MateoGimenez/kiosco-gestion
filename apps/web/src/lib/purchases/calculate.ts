// Cálculo de la compra que ve la pantalla (neto, IVA por alícuota, otros cargos y total).
//
// TODO(etapa 5): reemplazar TODO este archivo por `calculatePurchase` de @kiosco/shared apenas
// backend la publique (compras.md sección 4). La pantalla solo usa `calculatePurchaseView`: es el
// único punto de contacto, así el cambio es de un archivo y no se repiten fórmulas en las pantallas.
// Mientras tanto, esto sigue al pie de la letra la sección 4 del contrato (mismo redondeo R-1).
import { Decimal, finalFromNet, roundToCents } from '@kiosco/shared';

export type CalcLine =
  | { mode: 'UNIT'; quantity: Decimal; unitNetCost: Decimal; vatRatePercent: string }
  | {
      mode: 'PACK';
      packCount: Decimal;
      unitsPerPack: Decimal;
      packNetCost: Decimal;
      vatRatePercent: string;
    };

export interface CalcLineResult {
  quantity: Decimal;
  unitNetCost: Decimal;
  unitCost: Decimal;
  lineNetTotal: Decimal;
  lineTotal: Decimal;
}

export interface CalcResult {
  lines: CalcLineResult[];
  netTotal: Decimal;
  vatBreakdown: { vatRatePercent: string; netAmount: Decimal; vatAmount: Decimal }[];
  vatTotal: Decimal;
  otherChargesAmount: Decimal;
  total: Decimal;
}

function calcLine(line: CalcLine): CalcLineResult {
  if (line.mode === 'UNIT') {
    const lineNetTotal = roundToCents(line.quantity.times(line.unitNetCost));
    return {
      quantity: line.quantity,
      unitNetCost: line.unitNetCost,
      unitCost: finalFromNet(line.unitNetCost, line.vatRatePercent),
      lineNetTotal,
      lineTotal: finalFromNet(lineNetTotal, line.vatRatePercent),
    };
  }
  // Por bulto: el total de la línea es exacto (bultos × costo del bulto); el costo por unidad se redondea.
  const unitNetCost = roundToCents(line.packNetCost.div(line.unitsPerPack));
  const lineNetTotal = line.packCount.times(line.packNetCost);
  return {
    quantity: line.packCount.times(line.unitsPerPack),
    unitNetCost,
    unitCost: finalFromNet(unitNetCost, line.vatRatePercent),
    lineNetTotal,
    lineTotal: finalFromNet(lineNetTotal, line.vatRatePercent),
  };
}

export function calculatePurchaseView(lines: CalcLine[], otherCharges: Decimal): CalcResult {
  const results = lines.map(calcLine);
  const byRate = new Map<string, Decimal>();
  lines.forEach((line, i) => {
    const key = new Decimal(line.vatRatePercent).toFixed();
    byRate.set(key, (byRate.get(key) ?? new Decimal(0)).plus(results[i]!.lineNetTotal));
  });
  const vatBreakdown = [...byRate.entries()]
    .map(([vatRatePercent, netAmount]) => ({
      vatRatePercent,
      netAmount,
      vatAmount: roundToCents(netAmount.times(vatRatePercent).div(100)),
    }))
    .sort((a, b) => Number(b.vatRatePercent) - Number(a.vatRatePercent));
  const netTotal = results.reduce((sum, r) => sum.plus(r.lineNetTotal), new Decimal(0));
  const vatTotal = vatBreakdown.reduce((sum, r) => sum.plus(r.vatAmount), new Decimal(0));
  return {
    lines: results,
    netTotal,
    vatBreakdown,
    vatTotal,
    otherChargesAmount: otherCharges,
    total: netTotal.plus(vatTotal).plus(otherCharges),
  };
}
