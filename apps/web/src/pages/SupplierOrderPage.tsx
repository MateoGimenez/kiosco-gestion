// Pedido sugerido por proveedor (PRV-05): lista editable, "Copiar" y "Abrir WhatsApp".
// Nada se guarda: es solo armar el mensaje. El usuario lo envía desde WhatsApp.
import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { quantityText } from '../lib/catalog/labels';
import { toInputText } from '../lib/catalog/decimalInput';
import { checkQuantity } from '../lib/catalog/validation';
import { supplierKeys, suppliersApi } from '../lib/purchases/api';
import { copyText } from '../lib/purchases/clipboard';
import { buildOrderText, buildWhatsAppLink } from '../lib/purchases/orderText';
import type { SuggestedOrder } from '../lib/purchases/types';


export function SupplierOrderPage() {
  const supplierId = Number(useParams().id);
  const order = useQuery({
    queryKey: supplierKeys.order(supplierId),
    queryFn: ({ signal }) => suppliersApi.suggestedOrder(supplierId, signal),
    // El pedido se arma con el stock de ahora: no se reusa uno viejo.
    staleTime: 0,
    gcTime: 0,
  });
  if (order.isPending) return <LoadingState label="Armando el pedido…" />;
  if (order.isError) {
    return (
      <div className="page">
        <Link to={`/proveedores/${supplierId}`} className="back-link">
          ‹ Volver al proveedor
        </Link>
        <ErrorMessage
          title="No se pudo armar el pedido"
          error={order.error}
          onRetry={() => void order.refetch()}
        />
      </div>
    );
  }
  return <OrderEditor order={order.data} supplierId={supplierId} />;
}

function OrderEditor({ order, supplierId }: { order: SuggestedOrder; supplierId: number }) {
  const [quantities, setQuantities] = useState<Record<number, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i.productId, toInputText(i.suggestedQuantity)])),
  );
  const [copied, setCopied] = useState<'ok' | 'manual' | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const checks = order.items.map((item) => ({
    item,
    check: checkQuantity(quantities[item.productId] ?? '', item.saleUnit, 'La cantidad'),
  }));
  const hasErrors = checks.some((c) => c.check.error);
  const lines = checks
    .filter((c) => !c.check.error)
    .map((c) => ({
      name: c.item.name,
      saleUnit: c.item.saleUnit,
      quantity: c.check.value ?? new Decimal(0),
    }));
  const count = lines.filter((l) => l.quantity.gt(0)).length;

  // El texto y el link se rearman con lo que se ve en pantalla, así "Copiar" y WhatsApp llevan lo mismo.
  const text = useMemo(
    () =>
      buildOrderText({
        storeName: order.storeName,
        supplierName: order.supplier.name,
        lines,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [order, quantities],
  );
  const whatsappUrl = buildWhatsAppLink(order.supplier.whatsappPhone, text);
  const canSend = count > 0 && !hasErrors;

  async function onCopy() {
    const ok = await copyText(text);
    if (ok) setCopied('ok');
    else {
      // Sin portapapeles (por ejemplo HTTP en la tablet): se deja el texto elegido para copiarlo a mano.
      setCopied('manual');
      textRef.current?.focus();
      textRef.current?.select();
    }
  }

  return (
    <div className="page">
      <Link to={`/proveedores/${supplierId}`} className="back-link">
        ‹ Volver a {order.supplier.name}
      </Link>
      <h1>Pedido sugerido para {order.supplier.name}</h1>
      <p className="page__sub">
        Productos de este proveedor que están en el mínimo o por debajo. Cambiá las cantidades si
        querés; poné 0 para sacar uno del pedido.
      </p>

      {!order.supplier.isActive && (
        <Notice variant="warning">Este proveedor está desactivado. El pedido es solo para ver.</Notice>
      )}
      {order.isTruncated && (
        <Notice variant="warning">
          Hay más de 500 productos para reponer: se muestran los primeros. Armá el resto en otro
          pedido.
        </Notice>
      )}

      {order.items.length === 0 ? (
        <div className="empty">
          <p className="empty__title">No hay nada para reponer de este proveedor.</p>
          <p>
            Si esperabas ver productos, revisá que tengan a {order.supplier.name} como proveedor
            habitual.
          </p>
          <Link to={`/proveedores/${supplierId}/productos`} className="btn btn--secondary">
            Asignar productos
          </Link>
        </div>
      ) : (
        <ul className="plist plist--order" aria-label="Productos del pedido">
          <li className="plist__head" aria-hidden="true">
            <span>Producto</span>
            <span className="plist__num">Hay · Mínimo</span>
            <span className="plist__num">Pedir</span>
          </li>
          {checks.map(({ item, check }) => (
            <li key={item.productId} className="plist__row">
              <div className="plist__who">
                <span className="plist__name">{item.name}</span>
                {item.unitsPerPack && (
                  <span className="plist__sub">
                    Bulto de {quantityText(item.unitsPerPack, item.saleUnit)}
                  </span>
                )}
              </div>
              <div
                className={`plist__num${item.stockQuantity.startsWith('-') ? ' text-bad' : ''}`}
              >
                <span className="plist__label">Hay · Mínimo</span>
                {quantityText(item.stockQuantity, item.saleUnit)} ·{' '}
                {quantityText(item.minStock, item.saleUnit)}
              </div>
              <div className="plist__qty">
                <label className="sr-only" htmlFor={`qty-${item.productId}`}>
                  Cantidad a pedir de {item.name}
                </label>
                <input
                  id={`qty-${item.productId}`}
                  className="field__input plist__qty-input"
                  inputMode="decimal"
                  autoComplete="off"
                  value={quantities[item.productId] ?? ''}
                  aria-invalid={check.error ? true : undefined}
                  aria-describedby={check.error ? `qty-${item.productId}-err` : undefined}
                  onChange={(e) =>
                    setQuantities((prev) => ({ ...prev, [item.productId]: e.target.value }))
                  }
                />
                {check.error && (
                  <span className="field__error" id={`qty-${item.productId}-err`} role="alert">
                    {check.error}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {order.items.length > 0 && (
        <section className="panel panel--wide" aria-labelledby="order-text-title">
          <h2 id="order-text-title">Mensaje</h2>
          <textarea
            ref={textRef}
            className="field__input field__textarea order__text"
            readOnly
            rows={Math.min(14, Math.max(4, text.split('\n').length))}
            value={text}
            aria-label="Texto del pedido"
          />
          <div className="form__actions">
            <Button large variant="secondary" disabled={!canSend} onClick={() => void onCopy()}>
              Copiar
            </Button>
            {whatsappUrl ? (
              <a
                className={`btn btn--primary btn--large${canSend ? '' : ' is-disabled'}`}
                href={canSend ? whatsappUrl : undefined}
                aria-disabled={!canSend || undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir WhatsApp
              </a>
            ) : null}
          </div>
          <div aria-live="polite">
            {copied === 'ok' && <Notice variant="success">Copiado. Ya lo podés pegar donde quieras.</Notice>}
            {copied === 'manual' && (
              <Notice variant="warning">
                Este equipo no deja copiar con el botón. El texto quedó elegido: copialo con el
                menú de tu celular o con Ctrl+C.
              </Notice>
            )}
          </div>
          {!whatsappUrl && (
            <p className="field__hint">
              Este proveedor no tiene teléfono.{' '}
              <Link to={`/proveedores/${supplierId}/editar`}>Cargá el teléfono</Link> para enviarlo
              por WhatsApp.
            </p>
          )}
          {hasErrors && (
            <p className="field__error" role="alert">
              Revisá las cantidades marcadas para poder copiar o enviar el pedido.
            </p>
          )}
          {!hasErrors && count === 0 && (
            <p className="field__hint">Todas las cantidades están en 0: no hay nada para pedir.</p>
          )}
          <p className="field__hint">
            WhatsApp se abre con el mensaje escrito; vos lo enviás. El sistema no manda nada solo.
          </p>
        </section>
      )}
    </div>
  );
}
