// Detalle de una venta y anulación (encargado y dueño). Costos y ganancia, solo para el dueño.
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoney, formatMoneyWithCents, formatQuantity } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { FormDialog } from '../components/FormDialog';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextAreaField } from '../components/TextAreaField';
import { ApiError } from '../lib/api';
import { friendlyMessage } from '../lib/apiMessages';
import { formatDateTime } from '../lib/format';
import { useIsRemote, useRole } from '../lib/useRole';
import { salesApi, salesKeys } from '../lib/sales/api';
import { SHIFT_LABELS } from '../lib/sales/labels';
import { hasCosts, type VoidSaleResponse } from '../lib/sales/types';

export function SaleDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const role = useRole();
  const remote = useIsRemote();
  const queryClient = useQueryClient();
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [result, setResult] = useState<VoidSaleResponse | null>(null);

  const sale = useQuery({
    queryKey: salesKeys.sale(id),
    queryFn: ({ signal }) => salesApi.get(id, signal),
    enabled: Number.isInteger(id) && id > 0,
  });

  const voidSale = useMutation({
    mutationFn: (text: string) => salesApi.void(id, text),
    onSuccess: (data) => {
      setResult(data);
      setVoiding(false);
      queryClient.setQueryData(salesKeys.sale(id), data.sale);
      void queryClient.invalidateQueries({ queryKey: [...salesKeys.sales, 'list'] });
    },
  });

  function submitVoid() {
    const text = reason.trim();
    if (text === '') return setReasonError('Escribí el motivo de la anulación.');
    if (text.length > 200) return setReasonError('Puede tener hasta 200 caracteres.');
    voidSale.mutate(text);
  }

  const back = (
    <Link className="back-link" to="/ventas">
      ← Volver a las ventas
    </Link>
  );

  if (sale.isPending && sale.fetchStatus !== 'idle') {
    return (
      <div className="page">
        {back}
        <LoadingState label="Cargando la venta…" />
      </div>
    );
  }
  if (sale.isError || !sale.data) {
    const notFound = sale.error instanceof ApiError && sale.error.status === 404;
    return (
      <div className="page">
        {back}
        <ErrorMessage
          title={notFound ? 'No existe esa venta' : 'No se pudo cargar la venta'}
          error={sale.error}
          {...(notFound
            ? { message: 'Revisá el número o volvé a la lista.' }
            : { onRetry: () => void sale.refetch() })}
        />
      </div>
    );
  }

  const s = sale.data;
  const isOwner = role === 'OWNER';
  const withCost = hasCosts(s) ? s : null;
  const voided = s.status === 'VOIDED';
  const voidError = voidSale.error;
  const needsCash = voidError instanceof ApiError && voidError.code === 'CASH_SESSION_REQUIRED';

  return (
    <div className="page">
      {back}
      <div className="page__header">
        <div>
          <h1>Venta #{s.id}</h1>
          <p className="page__sub">
            {formatDateTime(s.createdAt)} · {s.user.fullName} · caja{' '}
            {SHIFT_LABELS[s.cashSession.shift].toLowerCase()}
          </p>
        </div>
        {voided ? <Badge tone="bad">Anulada</Badge> : <Badge tone="ok">Cobrada</Badge>}
      </div>

      {result && (
        <Notice variant="success">
          La venta se anuló y el stock volvió.{' '}
          {result.cashRefund
            ? `Salieron ${formatMoney(result.cashRefund.amount)} en efectivo de la caja abierta: ya quedó registrado.`
            : ''}
          {result.otherRefunds.length > 0 && (
            <>
              {' '}
              Devolvé por fuera:{' '}
              {result.otherRefunds
                .map((r) => `${r.paymentMethod.name} ${formatMoney(r.chargedAmount)}`)
                .join(', ')}
              .
            </>
          )}
        </Notice>
      )}
      {voided && !result && (
        <Notice variant="warning">
          Anulada el {s.voidedAt ? formatDateTime(s.voidedAt) : ''}
          {s.voidedBy ? ` por ${s.voidedBy.fullName}` : ''}. Motivo: {s.voidReason}
        </Notice>
      )}

      <section className="panel panel--wide" aria-labelledby="items-title">
        <h2 id="items-title">Productos</h2>
        <table className="detail-table">
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="cart__num">
                Cantidad
              </th>
              <th scope="col" className="cart__num">
                Precio
              </th>
              <th scope="col" className="cart__num">
                Importe
              </th>
              {isOwner && (
                <th scope="col" className="cart__num">
                  Costo
                </th>
              )}
              {isOwner && (
                <th scope="col" className="cart__num">
                  Ganancia
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {s.items.map((item, index) => {
              const costItem = withCost?.items[index];
              return (
                <tr key={item.id}>
                  <th scope="row">
                    {item.productName}
                    {item.customDescription ? `: ${item.customDescription}` : ''}
                    {Number(item.discountAmount) > 0 && (
                      <span className="sales-row__sub">
                        Descuento −{formatMoneyWithCents(item.discountAmount)}
                      </span>
                    )}
                  </th>
                  <td className="cart__num">{formatQuantity(item.quantity, item.saleUnit)}</td>
                  <td className="cart__num">{formatMoney(item.unitPrice)}</td>
                  <td className="cart__num">{formatMoney(item.lineSubtotal)}</td>
                  {isOwner && (
                    <td className="cart__num">
                      {costItem ? formatMoneyWithCents(costItem.unitNetCost) : '—'}
                    </td>
                  )}
                  {isOwner && (
                    <td className="cart__num">
                      {!costItem
                        ? '—'
                        : costItem.lineProfit === null
                          ? 'No cuenta'
                          : formatMoneyWithCents(costItem.lineProfit)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel panel--wide" aria-labelledby="pay-title">
        <h2 id="pay-title">Cobro</h2>
        <dl className="receipt">
          <dt>Subtotal</dt>
          <dd>{formatMoney(s.subtotal)}</dd>
          {Number(s.discountAmount) > 0 && (
            <>
              <dt>Descuento{s.discountReason ? ` (${s.discountReason})` : ''}</dt>
              <dd>−{formatMoney(s.discountAmount)}</dd>
            </>
          )}
          {Number(s.surchargeAmount) > 0 && (
            <>
              <dt>Recargo de crédito</dt>
              <dd>+{formatMoney(s.surchargeAmount)}</dd>
            </>
          )}
          <dt>Total cobrado</dt>
          <dd className="receipt__big">{formatMoney(s.total)}</dd>
          {s.payments.map((p) => (
            <div key={p.id} className="receipt__pair">
              <dt>{p.paymentMethod.name}</dt>
              <dd>{formatMoney(p.chargedAmount)}</dd>
            </div>
          ))}
          {isOwner && withCost && (
            <>
              <dt>Ganancia bruta (sin recargo)</dt>
              <dd>{formatMoneyWithCents(withCost.grossProfit)}</dd>
            </>
          )}
        </dl>
      </section>

      {!voided && (
        <div className="form__actions">
          <Button
            variant="danger"
            large
            disabled={remote}
            onClick={() => {
              setReason('');
              setReasonError(undefined);
              voidSale.reset();
              setVoiding(true);
            }}
          >
            {remote ? 'Anular: solo desde el local' : 'Anular esta venta'}
          </Button>
        </div>
      )}

      {voiding && (
        <FormDialog
          title={`Anular la venta #${s.id}`}
          submitLabel="Sí, anular la venta"
          busy={voidSale.isPending}
          onSubmit={submitVoid}
          onCancel={() => setVoiding(false)}
          error={
            voidError ? (
              needsCash ? (
                <p>
                  Para anular hay que abrir la caja primero. Abrila desde «Vender» y probá de nuevo.
                </p>
              ) : (
                <p>{friendlyMessage(voidError)}</p>
              )
            ) : undefined
          }
        >
          <p>
            Vuelven los productos al stock
            {s.payments.some((p) => p.paymentMethod.kind === 'CASH')
              ? ' y el efectivo se devuelve desde la caja abierta'
              : ''}
            . Lo cobrado con otros medios se devuelve por fuera, en el posnet o en Mercado Pago.
          </p>
          <TextAreaField
            label="Motivo (obligatorio)"
            value={reason}
            maxLength={200}
            error={reasonError}
            onChange={(e) => {
              setReason(e.target.value);
              setReasonError(undefined);
            }}
          />
        </FormDialog>
      )}
    </div>
  );
}
