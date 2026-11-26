// Ficha de un producto. Todos los roles la ven; los costos y márgenes solo los ve el dueño.
// El encargado los ve en la pantalla de precios (PA-03, PRE-08).
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatMoneyWithCents, formatPercent } from '@kiosco/shared';
import { AdjustStockAction } from '../components/AdjustStockAction';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { ApiError } from '../lib/api';
import { catalogApi, keys } from '../lib/catalog/api';
import { SALE_UNIT_LABELS, isNegative, quantityText } from '../lib/catalog/labels';
import { formatPrice } from '../lib/catalog/pricing';
import { hasCost } from '../lib/catalog/types';
import { formatDateTime } from '../lib/format';
import { isManagerOrOwner, useIsRemote, useRole } from '../lib/useRole';

const MARGIN_SOURCE_LABELS = {
  PRODUCT: 'propio del producto',
  SUBCATEGORY: 'de la subcategoría',
  CATEGORY: 'de la categoría',
} as const;

export function ProductDetailPage() {
  const { id } = useParams();
  const productId = Number(id);
  const role = useRole();
  const canManage = isManagerOrOwner(role);
  const isRemote = useIsRemote();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const [confirmOff, setConfirmOff] = useState(false);

  const product = useQuery({
    queryKey: keys.product(productId),
    queryFn: ({ signal }) => catalogApi.product(productId, signal),
    enabled: Number.isInteger(productId) && productId > 0,
  });

  const setActive = useMutation({
    mutationFn: (isActive: boolean) => catalogApi.updateProduct(productId, { isActive }),
    onSuccess: async (_data, isActive) => {
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: keys.stockLists });
      setConfirmOff(false);
      setNotice(isActive ? 'Se reactivó el producto.' : 'Se desactivó el producto.');
    },
  });

  if (product.isPending) return <LoadingState label="Cargando el producto…" />;
  if (product.isError) {
    const notFound = product.error instanceof ApiError && product.error.status === 404;
    return (
      <div className="page">
        <Link to="/productos" className="back-link">
          ‹ Volver a Productos
        </Link>
        <ErrorMessage
          title={notFound ? 'No encontramos ese producto' : 'No se pudo cargar el producto'}
          error={product.error}
          {...(notFound ? {} : { onRetry: () => void product.refetch() })}
        />
      </div>
    );
  }

  const p = product.data;
  // Los costos se muestran solo al dueño y solo si el servidor los mandó.
  const showCost = role === 'OWNER' && hasCost(p);
  const negative = isNegative(p.stockQuantity);

  return (
    <div className="page">
      <Link to="/productos" className="back-link">
        ‹ Volver a Productos
      </Link>

      <div className="page__header">
        <div className="titleblock">
          <h1>{p.name}</h1>
          <div className="titleblock__badges">
            {!p.isActive && <Badge tone="off">Desactivado</Badge>}
            {p.isActive && negative && !p.isMiscellaneous && (
              <Badge tone="bad">Stock negativo</Badge>
            )}
            {p.isActive && !negative && p.needsRestock && <Badge tone="warn">Para reponer</Badge>}
            {p.isMiscellaneous && <Badge tone="off">Producto "Varios"</Badge>}
          </div>
        </div>
        {canManage && (
          <div className="page__actions">
            <Link to={`/productos/${p.id}/editar`} className="btn btn--secondary">
              Editar datos
            </Link>
            {!p.isMiscellaneous && (
              <AdjustStockAction
                to={`/productos/${p.id}/ajustar`}
                label="Ajustar stock"
                remote={isRemote}
                noteId="adjust-remote-note"
                primary
              />
            )}
            {isRemote && !p.isMiscellaneous && (
              <p className="page__note" id="adjust-remote-note">
                Solo desde el local.
              </p>
            )}
          </div>
        )}
      </div>

      {notice && <Notice variant="success">{notice}</Notice>}
      {setActive.isError && !confirmOff && (
        <ErrorMessage title="No se pudo cambiar el estado" error={setActive.error} />
      )}

      <div className="detail-grid">
        <section className="panel panel--wide" aria-labelledby="sale-title">
          <h2 id="sale-title">Venta</h2>
          <dl className="facts">
            <div>
              <dt>Precio de venta</dt>
              <dd className="facts__big">
                {p.isMiscellaneous ? 'Se escribe al vender' : formatPrice(p.salePrice)}
              </dd>
            </div>
            <div>
              <dt>IVA</dt>
              <dd>{formatPercent(p.vatRatePercent)}</dd>
            </div>
            <div>
              <dt>Se vende</dt>
              <dd>{SALE_UNIT_LABELS[p.saleUnit]}</dd>
            </div>
            <div>
              <dt>Código de barras</dt>
              <dd>{p.barcode ?? 'Sin código'}</dd>
            </div>
            <div>
              <dt>Categoría</dt>
              <dd>
                {p.category.name} · {p.subcategory.name}
              </dd>
            </div>
          </dl>
        </section>

        {!p.isMiscellaneous && (
          <section className="panel panel--wide" aria-labelledby="stock-title">
            <h2 id="stock-title">Stock</h2>
            <dl className="facts">
              <div>
                <dt>Hay ahora</dt>
                <dd className={`facts__big${negative ? ' facts__big--bad' : ''}`}>
                  {quantityText(p.stockQuantity, p.saleUnit)}
                </dd>
              </div>
              <div>
                <dt>Mínimo</dt>
                <dd>{quantityText(p.minStock, p.saleUnit)}</dd>
              </div>
              <div>
                <dt>Unidades por bulto</dt>
                <dd>{p.unitsPerPack ? quantityText(p.unitsPerPack, p.saleUnit) : 'Sin dato'}</dd>
              </div>
              {canManage && (
                <div>
                  <dt>Proveedor habitual</dt>
                  <dd>
                    {p.defaultSupplier ? (
                      <Link to={`/proveedores/${p.defaultSupplier.id}`}>
                        {p.defaultSupplier.name}
                      </Link>
                    ) : (
                      'Sin proveedor habitual'
                    )}
                  </dd>
                </div>
              )}
            </dl>
            {canManage && (
              <div className="page__actions">
                <Link to={`/productos/${p.id}/movimientos`} className="btn btn--secondary">
                  Ver movimientos
                </Link>
              </div>
            )}
          </section>
        )}

        {showCost && (
          <section className="panel panel--wide" aria-labelledby="cost-title">
            <h2 id="cost-title">Costo y margen</h2>
            <dl className="facts">
              <div>
                <dt>Costo sin IVA</dt>
                <dd>{formatMoneyWithCents(p.netCostPrice)}</dd>
              </div>
              <div>
                <dt>Costo con IVA</dt>
                <dd>{formatMoneyWithCents(p.costPrice)}</dd>
              </div>
              <div>
                <dt>Margen que se usa</dt>
                <dd>
                  {formatPercent(p.effectiveMarginPercent)}{' '}
                  <span className="facts__aside">({MARGIN_SOURCE_LABELS[p.marginSource]})</span>
                </dd>
              </div>
              <div>
                <dt>Precio sugerido</dt>
                <dd>{p.suggestedPrice ? formatPrice(p.suggestedPrice) : 'Sin costo cargado'}</dd>
              </div>
              <div>
                <dt>Margen real del precio actual</dt>
                <dd>
                  {p.realMarginPercent ? formatPercent(p.realMarginPercent) : 'Sin costo cargado'}
                </dd>
              </div>
            </dl>
          </section>
        )}

        {canManage && !p.isMiscellaneous && (
          <section className="panel panel--wide" aria-labelledby="prices-title">
            <h2 id="prices-title">Precios</h2>
            <p>
              {role === 'OWNER'
                ? 'Cambiá el costo, el margen o el precio de venta.'
                : 'Acá ves el costo, el precio sugerido y podés cambiar el precio de venta.'}
            </p>
            <div className="page__actions">
              <Link to={`/pricing/${p.id}`} className="btn btn--secondary">
                Ir a precios
              </Link>
            </div>
          </section>
        )}
      </div>

      <p className="page__note">Última modificación: {formatDateTime(p.updatedAt)}</p>

      {canManage && !p.isMiscellaneous && (
        <div className="page__actions">
          {p.isActive ? (
            <Button
              variant="secondary"
              onClick={() => {
                setActive.reset();
                setConfirmOff(true);
              }}
            >
              Desactivar producto
            </Button>
          ) : (
            <Button
              variant="secondary"
              loading={setActive.isPending}
              onClick={() => setActive.mutate(true)}
            >
              Reactivar producto
            </Button>
          )}
        </div>
      )}

      {confirmOff && (
        <ConfirmDialog
          title={`¿Desactivar ${p.name}?`}
          confirmLabel="Desactivar"
          danger
          busy={setActive.isPending}
          error={setActive.isError ? setActive.error : undefined}
          onCancel={() => setConfirmOff(false)}
          onConfirm={() => setActive.mutate(false)}
        >
          <p>
            Deja de aparecer para vender. Su historial se conserva y lo podés reactivar cuando
            quieras.
          </p>
          {!p.stockQuantity.match(/^-?0+(\.0+)?$/) && (
            <p>
              Todavía tiene stock ({quantityText(p.stockQuantity, p.saleUnit)}): se queda como está
              y lo podés seguir ajustando.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
