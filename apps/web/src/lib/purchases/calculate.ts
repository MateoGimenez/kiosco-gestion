// Cálculo de la compra que ve la pantalla (neto, IVA por alícuota, otros cargos y total).
// Usa la misma función que el servidor (`calculatePurchase` de @kiosco/shared, compras.md sección 4):
// acá solo se adapta la forma de las líneas de la pantalla.
import { Decimal, calculatePurchase } from '@kiosco/shared';

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

export function calculatePurchaseView(lines: CalcLine[], otherCharges: Decimal): CalcResult {
  const result = calculatePurchase({
    lines: lines.map((line) =>
      line.mode === 'UNIT'
        ? {
            quantityMode: 'UNIT' as const,
            quantity: line.quantity,
            unitNetCost: line.unitNetCost,
            vatRatePercent: line.vatRatePercent,
          }
        : {
            quantityMode: 'PACK' as const,
            packCount: line.packCount,
            unitsPerPack: line.unitsPerPack,
            packNetCost: line.packNetCost,
            vatRatePercent: line.vatRatePercent,
          },
    ),
    otherChargesAmount: otherCharges,
  });
  return {
    ...result,
    vatBreakdown: result.vatBreakdown.map((row) => ({
      ...row,
      vatRatePercent: row.vatRatePercent.toFixed(),
    })),
  };
}
