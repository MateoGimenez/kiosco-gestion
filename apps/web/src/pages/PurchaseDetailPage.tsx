// Detalle de una compra: líneas, totales, pagos, fotos de la factura y anulación.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoneyWithCents, formatPercent, formatQuantity } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormDialog } from '../components/FormDialog';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextAreaField } from '../components/TextAreaField';
import { AttachmentGallery } from '../components/purchases/AttachmentGallery';
import { friendlyMessage } from '../lib/apiMessages';
import { formatDateTime } from '../lib/format';
import { keys } from '../lib/catalog/api';
import { purchaseKeys, purchasesApi, supplierKeys } from '../lib/purchases/api';
import {
  DOCUMENT_TYPE_LABELS,
  PAYMENT_SOURCE_LABELS,
  formatDateOnly,
} from '../lib/purchases/labels';
import type { VoidPurchaseResponse } from '../lib/purchases/types';
import { Decimal } from '@kiosco/shared';

export function PurchaseDetailPage() {
  const purchaseId = Number(useParams().id);
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [voided, setVoided] = useState<VoidPurchaseResponse | null>(null);

  const purchase = useQuery({
    queryKey: purchaseKeys.detail(purchaseId),
    queryFn: ({ signal }) => purchasesApi.get(purchaseId, signal),
  });

  const voidMutation = useMutation({
    mutationFn: () => purchasesApi.void(purchaseId, reason.trim()),
    onSuccess: async (response) => {
      setVoided(response);
      setVoiding(false);
      await queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: keys.stockLists });
    },
  });

  if (purchase.isPending) return <LoadingState label="Cargando la compra…" />;
  if (purchase.isError) {
    return (
      <div className="page">
        <Link to="/compras" className="back-link">
          ‹ Volver a Compras
        </Link>
        <ErrorMessage
          title="No se pudo cargar la compra"
          error={purchase.error}
          onRetry={() => void purchase.refetch()}
        />
      </div>
    );
  }
  const p = purchase.data;
  const isVoided = p.status === 'VOIDED';
  const paid = p.payNowPayments.reduce((sum, x) => sum.plus(x.amount), new Decimal(0));

  function submitVoid() {
    if (reason.trim() === '') {
      setReasonError('Contá por qué anulás la compra.');
      return;
    }
    setReasonError(undefined);
    voidMutation.mutate();
  }

  return (
    <div className="page">
      <Link to="/compras" className="back-link">
        ‹ Volver a Compras
      </Link>
      <div className="page__header">
        <div className="titleblock">
          <h1>
            {DOCUMENT_TYPE_LABELS[p.documentType]}
            {p.documentNumber ? ` ${p.documentNumber}` : ''} · {p.supplier.name}
          </h1>
          <div className="titleblock__badges">
            {isVoided ? <Badge tone="off">Anulada</Badge> : <Badge tone="ok">Confirmada</Badge>}
          </div>
        </div>
        {!isVoided && (
          <div className="page__actions">
            <Button
              variant="danger"
              onClick={() => {
                voidMutation.reset();
                setVoiding(true);
              }}
            >
              Anular la compra
            </Button>
          </div>
        )}
      </div>

      {voided && (
        <Notice variant="success">
          Compra anulada: el stock y la deuda volvieron atrás. Saldo con {p.supplier.name}:{' '}
          {formatMoneyWithCents(voided.supplierBalance)}.
          {voided.stockWarnings.length > 0 &&
            ` ${voided.stockWarnings.length === 1 ? 'Un producto quedó' : `${voided.stockWarnings.length} productos quedaron`} con stock negativo: revisalo en "Para reponer".`}
        </Notice>
      )}
      {isVoided && (
        <Notice variant="warning">
          Anulada el {p.voidedAt ? formatDateTime(p.voidedAt) : ''}
          {p.voidedBy ? ` por ${p.voidedBy.fullName}` : ''}. Motivo: {p.voidReason}. Los costos y
          precios quedan como los dejó la compra.
        </Notice>
      )}

      <section className="panel panel--wide" aria-label="Datos de la compra">
        <dl className="facts">
          <div>
            <dt>Proveedor</dt>
            <dd>
              <Link to={`/proveedores/${p.supplier.id}`}>{p.supplier.name}</Link>
            </dd>
          </div>
          <div>
            <dt>Fecha del comprobante</dt>
            <dd>{formatDateOnly(p.documentDate)}</dd>
          </div>
          <div>
            <dt>Cargada por</dt>
            <dd>
              {p.user.fullName}, {formatDateTime(p.createdAt)}
            </dd>
          </div>
          <div>
            <dt>Compra n.º</dt>
            <dd>{p.id}</dd>
          </div>
          {p.notes && (
            <div>
              <dt>Notas</dt>
              <dd>{p.notes}</dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="items-title" className="stack">
        <h2 id="items-title">Productos</h2>
        <ul className="plist plist--items" aria-label="Productos de la compra">
          <li className="plist__head" aria-hidden="true">
            <span>Producto</span>
            <span className="plist__num">Cantidad</span>
            <span className="plist__num">Costo sin IVA</span>
            <span className="plist__num">Subtotal sin IVA</span>
          </li>
          {p.items.map((item) => (
            <li key={item.id} className="plist__row">
              <div className="plist__who">
                <Link to={`/productos/${item.productId}`} className="plist__name">
                  {item.productName}
                </Link>
                <span className="plist__sub">IVA {formatPercent(item.vatRatePercent)}</span>
              </div>
              <div className="plist__num">
                <span className="plist__label">Cantidad</span>
                {item.quantityMode === 'PACK' && item.packCount && item.unitsPerPack
                  ? `${formatQuantity(item.packCount)} × ${formatQuantity(item.unitsPerPack, item.saleUnit)} = `
                  : ''}
                {formatQuantity(item.quantity, item.saleUnit)}
              </div>
              <div className="plist__num">
                <span className="plist__label">Costo sin IVA</span>
                {item.quantityMode === 'PACK' && item.packNetCost
                  ? `${formatMoneyWithCents(item.packNetCost)} el bulto`
                  : formatMoneyWithCents(item.unitNetCost)}
                <span className="plist__sub">
                  Antes: {formatMoneyWithCents(item.previousNetCostPrice)}
                </span>
              </div>
              <div className="plist__num">
                <span className="plist__label">Subtotal sin IVA</span>
                {formatMoneyWithCents(item.lineNetTotal)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel" aria-labelledby="totals-title">
        <h2 id="totals-title">Totales</h2>
        <dl className="totals__list">
          <div>
            <dt>Neto (sin IVA)</dt>
            <dd>{formatMoneyWithCents(p.netTotal)}</dd>
          </div>
          {p.vatBreakdown.map((row) => (
            <div key={row.vatRatePercent}>
              <dt>IVA {formatPercent(row.vatRatePercent)}</dt>
              <dd>{formatMoneyWithCents(row.vatAmount)}</dd>
            </div>
          ))}
          <div>
            <dt>Otros cargos</dt>
            <dd>{formatMoneyWithCents(p.otherChargesAmount)}</dd>
          </div>
          <div className="totals__total">
            <dt>Total</dt>
            <dd>{formatMoneyWithCents(p.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="panel" aria-labelledby="pays-title">
        <h2 id="pays-title">Pagado al cargarla</h2>
        {p.payNowPayments.length === 0 ? (
          <p>No se pagó nada al cargarla: el total quedó como deuda.</p>
        ) : (
          <ul className="summary">
            {p.payNowPayments.map((pay) => (
              <li key={pay.entryId}>
                {formatMoneyWithCents(pay.amount)} · {PAYMENT_SOURCE_LABELS[pay.source]}
                {pay.reference ? ` (${pay.reference})` : ''} · {formatDateOnly(pay.entryDate)}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AttachmentGallery purchaseId={p.id} attachments={p.attachments} />

      {voiding && (
        <FormDialog
          title="Anular la compra"
          submitLabel="Anular la compra"
          busy={voidMutation.isPending}
          error={voidMutation.error ? friendlyMessage(voidMutation.error) : undefined}
          onSubmit={submitVoid}
          onCancel={() => setVoiding(false)}
        >
          <p>
            El stock baja lo que había sumado la compra y la deuda baja su total. Los costos y
            precios <strong>no</strong> vuelven atrás. Si la compra estaba mal cargada, después
            cargala de nuevo.
          </p>
          {!paid.isZero() && (
            <Notice variant="warning">
              Esta compra se pagó al cargarla ({formatMoneyWithCents(paid)}). Los pagos no se
              deshacen: el saldo puede quedar a favor del kiosco hasta que cargues la compra
              corregida.
            </Notice>
          )}
          <TextAreaField
            label="Motivo"
            hint="Es obligatorio. Queda registrado."
            rows={3}
            maxLength={200}
            value={reason}
            error={reasonError}
            data-autofocus
            onChange={(e) => setReason(e.target.value)}
          />
        </FormDialog>
      )}
    </div>
  );
}
