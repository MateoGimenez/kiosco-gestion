// Resumen de la venta recién cobrada. Es lo único que el empleado ve de una venta (H-40).
import { formatMoney, formatQuantity } from '@kiosco/shared';
import { Button } from '../Button';
import type { CreateSaleResponse } from '../../lib/sales/types';

interface SaleSummaryProps {
  result: CreateSaleResponse;
  onClose: () => void;
}

export function SaleSummary({ result, onClose }: SaleSummaryProps) {
  const { sale, change, stockWarnings, isReplay } = result;
  return (
    <section className="summary-card" aria-label={`Venta ${sale.id} cobrada`} role="status">
      <div className="summary-card__head">
        <h2>Venta #{sale.id} cobrada</h2>
        <strong className="summary-card__total">{formatMoney(sale.total)}</strong>
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </div>
      {isReplay && (
        <p className="summary-card__note">Esta venta ya estaba guardada: no se cobró de nuevo.</p>
      )}
      {change !== null && Number(change) > 0 && (
        <p className="summary-card__change">
          Vuelto <strong>{formatMoney(change)}</strong>
        </p>
      )}
      <ul className="summary-card__payments">
        {sale.payments.map((p) => (
          <li key={p.id}>
            <span>{p.paymentMethod.name}</span>
            <span>
              {formatMoney(p.chargedAmount)}
              {Number(p.surchargeAmount) > 0 &&
                ` (incluye ${formatMoney(p.surchargeAmount)} de recargo)`}
            </span>
          </li>
        ))}
      </ul>
      {sale.discountAmount !== '0.00' && Number(sale.discountAmount) > 0 && (
        <p className="summary-card__note">
          Descuento aplicado: {formatMoney(sale.discountAmount)}.
        </p>
      )}
      {stockWarnings.length > 0 && (
        <div className="notice notice--warning">
          <p>Quedó con stock negativo (se vendió igual):</p>
          <ul className="summary-card__warnings">
            {stockWarnings.map((w) => (
              <li key={w.productId}>
                {w.productName}: {formatQuantity(w.stockAfter, w.saleUnit)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
