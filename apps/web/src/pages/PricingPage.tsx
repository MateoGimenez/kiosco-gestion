// Precios (/pricing): lista para elegir un producto. Encargado y dueño.
// El dueño ve acá el sugerido; el encargado ve el costo recién al entrar al producto.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Decimal } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { catalogApi, keys } from '../lib/catalog/api';
import { formatPrice } from '../lib/catalog/pricing';
import { hasCost } from '../lib/catalog/types';
import { useRole } from '../lib/useRole';

const PAGE_SIZE = 25;

export function PricingPage() {
  const role = useRole();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const params = {
    page,
    pageSize: PAGE_SIZE,
    isActive: 'true' as const,
    ...(q ? { search: q } : {}),
  };
  const products = useQuery({
    queryKey: [...keys.products, 'pricing-list', params],
    queryFn: ({ signal }) => catalogApi.products(params, signal),
    placeholderData: (previous) => previous,
  });
  const items = products.data?.items ?? [];

  return (
    <div className="page">
      <div>
        <h1>Precios</h1>
        <p className="page__sub">
          Elegí un producto para ver su costo, su margen y su precio sugerido.
        </p>
      </div>

      <div className="field searchbar__field">
        <label className="field__label" htmlFor="pricing-search">
          Buscar por código de barras o nombre
        </label>
        <input
          id="pricing-search"
          ref={ref}
          className="field__input"
          type="search"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      {products.isPending && <LoadingState label="Cargando productos…" />}
      {products.isError && (
        <ErrorMessage
          title="No se pudo cargar la lista"
          error={products.error}
          onRetry={() => void products.refetch()}
        />
      )}
      {products.isSuccess && items.length === 0 && (
        <div className="empty">
          <p className="empty__title">No hay productos que coincidan.</p>
          <p>Probá con otro nombre o con el código de barras.</p>
        </div>
      )}
      {products.isSuccess && items.length > 0 && (
        <>
          <ul className="plist plist--pricing" aria-label="Productos">
            <li className="plist__head" aria-hidden="true">
              <span>Producto</span>
              <span className="plist__num">Precio actual</span>
              <span className="plist__num">{role === 'OWNER' ? 'Sugerido' : ''}</span>
              <span />
            </li>
            {items.map((p) => {
              const suggested = role === 'OWNER' && hasCost(p) ? p.suggestedPrice : null;
              const differs = suggested !== null && !new Decimal(suggested).eq(p.salePrice);
              return (
                <li key={p.id} className="plist__row">
                  <div className="plist__who">
                    <Link to={`/pricing/${p.id}`} className="plist__name">
                      {p.name}
                    </Link>
                    <span className="plist__sub">
                      {p.category.name} · {p.subcategory.name}
                    </span>
                  </div>
                  <div className="plist__num">
                    <span className="plist__label">Precio actual</span>
                    {p.isMiscellaneous ? 'A mano' : formatPrice(p.salePrice)}
                  </div>
                  <div className="plist__num">
                    {suggested !== null && (
                      <>
                        <span className="plist__label">Sugerido</span>
                        {formatPrice(suggested)}
                      </>
                    )}
                  </div>
                  <div className="plist__state">
                    {differs && <Badge tone="warn">Distinto del sugerido</Badge>}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination
            page={products.data.page}
            pageSize={products.data.pageSize}
            total={products.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
