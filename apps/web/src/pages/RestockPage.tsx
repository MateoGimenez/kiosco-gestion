// "Para reponer" y "Stock negativo": listas simples con acceso rápido a ajustar (encargado y dueño).
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { TextField } from '../components/TextField';
import { catalogApi, keys } from '../lib/catalog/api';
import { quantityText } from '../lib/catalog/labels';

export function RestockPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get('lista') === 'negativo' ? 'negative' : 'restock';
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const list = useQuery({
    queryKey: [...keys.stockLists, kind, q, page],
    queryFn: ({ signal }) => catalogApi.stockList(kind, q ? { page, search: q } : { page }, signal),
    placeholderData: (previous) => previous,
  });

  function choose(next: 'restock' | 'negative') {
    setPage(1);
    setParams(next === 'negative' ? { lista: 'negativo' } : {}, { replace: true });
  }

  return (
    <div className="page">
      <h1>{kind === 'restock' ? 'Para reponer' : 'Stock negativo'}</h1>

      <div className="tabs" role="group" aria-label="Qué lista ver">
        <button
          type="button"
          className="tabs__tab"
          aria-pressed={kind === 'restock'}
          onClick={() => choose('restock')}
        >
          Para reponer
        </button>
        <button
          type="button"
          className="tabs__tab"
          aria-pressed={kind === 'negative'}
          onClick={() => choose('negative')}
        >
          Stock negativo
        </button>
      </div>

      <p className="page__sub">
        {kind === 'restock'
          ? 'Productos con el stock en el mínimo o por debajo. Los que más faltan, primero.'
          : 'Productos que figuran con menos de cero. Se corrigen con un ajuste, por ejemplo una corrección por conteo.'}
      </p>

      <TextField
        label="Buscar por código de barras o nombre"
        type="search"
        autoComplete="off"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      {list.isPending && <LoadingState label="Cargando la lista…" />}
      {list.isError && (
        <ErrorMessage
          title="No se pudo cargar la lista"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.isSuccess && list.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">
            {q
              ? 'No hay productos que coincidan.'
              : kind === 'restock'
                ? 'No hay nada para reponer por ahora.'
                : 'No hay productos con stock negativo.'}
          </p>
          <p>{q ? 'Probá con otro nombre o código.' : 'Todo está en orden.'}</p>
        </div>
      )}
      {list.isSuccess && list.data.items.length > 0 && (
        <>
          <ul className="plist plist--stock" aria-label="Productos">
            <li className="plist__head" aria-hidden="true">
              <span>Producto</span>
              <span className="plist__num">Hay</span>
              <span className="plist__num">{kind === 'restock' ? 'Mínimo · Falta' : 'Mínimo'}</span>
              <span />
            </li>
            {list.data.items.map((item) => (
              <li key={item.id} className="plist__row">
                <div className="plist__who">
                  <Link to={`/productos/${item.id}`} className="plist__name">
                    {item.name}
                  </Link>
                  <span className="plist__sub">
                    {item.categoryName} · {item.subcategoryName}
                  </span>
                  {!item.isActive && <Badge tone="off">Desactivado</Badge>}
                </div>
                <div
                  className={`plist__num${item.stockQuantity.startsWith('-') ? ' text-bad' : ''}`}
                >
                  <span className="plist__label">Hay</span>
                  {quantityText(item.stockQuantity, item.saleUnit)}
                </div>
                <div className="plist__num">
                  <span className="plist__label">
                    {kind === 'restock' ? 'Mínimo · Falta' : 'Mínimo'}
                  </span>
                  {quantityText(item.minStock, item.saleUnit)}
                  {kind === 'restock' && <> · {quantityText(item.shortfall, item.saleUnit)}</>}
                </div>
                <div className="plist__state">
                  <Link
                    to={
                      kind === 'negative'
                        ? `/productos/${item.id}/ajustar?motivo=COUNT_CORRECTION`
                        : `/productos/${item.id}/ajustar`
                    }
                    className="btn btn--secondary"
                    aria-label={`Ajustar ${item.name}`}
                  >
                    Ajustar
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
