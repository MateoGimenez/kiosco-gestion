// Historial de movimientos de stock de un producto (encargado y dueño).
// El dueño también ve el costo unitario del movimiento.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoneyWithCents } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { catalogApi, keys } from '../lib/catalog/api';
import { MOVEMENT_TYPE_LABELS, quantityText, signedQuantityText } from '../lib/catalog/labels';
import { REASON_LABELS } from '../lib/catalog/stockAdjustment';
import { formatDateTime } from '../lib/format';
import { useRole } from '../lib/useRole';

export function StockMovementsPage() {
  const { id } = useParams();
  const productId = Number(id);
  const isOwner = useRole() === 'OWNER';
  const [page, setPage] = useState(1);
  const valid = Number.isInteger(productId) && productId > 0;

  const product = useQuery({
    queryKey: keys.product(productId),
    queryFn: ({ signal }) => catalogApi.product(productId, signal),
    enabled: valid,
  });
  const movements = useQuery({
    queryKey: [...keys.movements(productId), page],
    queryFn: ({ signal }) => catalogApi.movements(productId, page, signal),
    enabled: valid,
    placeholderData: (previous) => previous,
  });
  const unit = product.data?.saleUnit ?? 'UNIT';

  return (
    <div className="page">
      <Link to={`/productos/${productId}`} className="back-link">
        ‹ Volver a la ficha
      </Link>
      <div>
        <h1>Movimientos de stock</h1>
        {product.data && (
          <p className="page__sub">
            {product.data.name} · Hay ahora {quantityText(product.data.stockQuantity, unit)}
          </p>
        )}
      </div>

      {movements.isPending && <LoadingState label="Cargando movimientos…" />}
      {movements.isError && (
        <ErrorMessage
          title="No se pudo cargar el historial"
          error={movements.error}
          onRetry={() => void movements.refetch()}
        />
      )}
      {movements.isSuccess && movements.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">Este producto todavía no tiene movimientos.</p>
          <p>Cada ajuste, venta o compra va a quedar registrado acá.</p>
        </div>
      )}
      {movements.isSuccess && movements.data.items.length > 0 && (
        <>
          <ul className="mlist" aria-label="Movimientos">
            {movements.data.items.map((m) => (
              <li key={m.id} className="mlist__row">
                <div className="mlist__when">
                  <span>{formatDateTime(m.createdAt)}</span>
                  <span className="plist__sub">{m.user.fullName}</span>
                </div>
                <div className="mlist__what">
                  <span className="mlist__type">
                    {MOVEMENT_TYPE_LABELS[m.type]}
                    {m.adjustmentReason ? `: ${REASON_LABELS[m.adjustmentReason]}` : ''}
                  </span>
                  {m.note && <span className="plist__sub">{m.note}</span>}
                  {isOwner && m.unitNetCost != null && (
                    <span className="plist__sub">
                      Costo sin IVA: {formatMoneyWithCents(m.unitNetCost)}
                    </span>
                  )}
                </div>
                <div className="mlist__qty">
                  <Badge tone={m.quantity.startsWith('-') ? 'bad' : 'ok'}>
                    {signedQuantityText(m.quantity, unit)}
                  </Badge>
                </div>
                <div className="mlist__after">
                  <span className="plist__label">Quedó en</span>
                  {quantityText(m.stockAfter, unit)}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={movements.data.page}
            pageSize={movements.data.pageSize}
            total={movements.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
