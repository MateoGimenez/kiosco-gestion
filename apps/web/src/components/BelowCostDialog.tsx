import { formatMoneyWithCents, formatPercent } from '@kiosco/shared';
import type { BelowCostDetails } from '../lib/catalog/belowCost';
import { formatPrice } from '../lib/catalog/pricing';
import { ConfirmDialog } from './ConfirmDialog';

interface BelowCostDialogProps {
  details: BelowCostDetails;
  busy: boolean;
  error?: unknown;
  /** Vuelve al formulario para corregir el precio. */
  onReview: () => void;
  /** Reenvía el pedido con `confirmBelowCost: true`. */
  onConfirm: () => void;
}

/** Aviso de venta a pérdida: el foco arranca en "Revisar precio" (lo seguro). */
export function BelowCostDialog({
  details,
  busy,
  error,
  onReview,
  onConfirm,
}: BelowCostDialogProps) {
  return (
    <ConfirmDialog
      title="Estás vendiendo a pérdida"
      confirmLabel="Vender igual a pérdida"
      cancelLabel="Revisar precio"
      danger
      busy={busy}
      error={error}
      onCancel={onReview}
      onConfirm={onConfirm}
    >
      <p>El precio de venta es menor que lo que te cuesta el producto.</p>
      <ul className="summary">
        <li>Precio de venta: {formatPrice(details.salePrice)}</li>
        <li>Costo con IVA: {formatMoneyWithCents(details.costPrice)}</li>
        <li>
          <strong className="text-bad">
            Margen real: {formatPercent(details.realMarginPercent)}
          </strong>
        </li>
      </ul>
      <p>Por cada venta perdés plata. Si es a propósito, confirmalo; si no, revisá el precio.</p>
    </ConfirmDialog>
  );
}
