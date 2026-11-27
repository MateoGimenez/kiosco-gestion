// Asignar un proveedor como habitual de varios productos a la vez (PA-04, desde el proveedor).
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { TextField } from '../components/TextField';
import { catalogApi, keys, type ProductListParams } from '../lib/catalog/api';
import { supplierKeys, suppliersApi } from '../lib/purchases/api';
import type { AssignProductsResponse } from '../lib/purchases/types';
import { friendlyMessage } from '../lib/apiMessages';

const MAX_PER_REQUEST = 200;

export function SupplierProductsPage() {
  const supplierId = Number(useParams().id);
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [onlyFree, setOnlyFree] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Map<number, string>>(new Map());
  const [result, setResult] = useState<AssignProductsResponse | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const supplier = useQuery({
    queryKey: supplierKeys.detail(supplierId),
    queryFn: ({ signal }) => suppliersApi.get(supplierId, signal),
  });

  const params: ProductListParams = { page, pageSize: 25, isActive: 'true' };
  if (q) params.search = q;
  if (onlyFree) params.withoutSupplier = 'true';
  const products = useQuery({
    queryKey: [...keys.products, 'for-supplier', params],
    queryFn: ({ signal }) => catalogApi.products(params, signal),
    placeholderData: (previous) => previous,
  });

  const assign = useMutation({
    mutationFn: () => suppliersApi.assignProducts(supplierId, [...selected.keys()]),
    onSuccess: async (response) => {
      setResult(response);
      setSelected(new Map());
      await queryClient.invalidateQueries({ queryKey: keys.products });
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
    },
  });

  function toggle(id: number, name: string) {
    setResult(null);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, name);
      return next;
    });
  }

  if (supplier.isPending) return <LoadingState label="Cargando el proveedor…" />;
  if (supplier.isError) {
    return (
      <div className="page">
        <ErrorMessage
          title="No se pudo cargar el proveedor"
          error={supplier.error}
          onRetry={() => void supplier.refetch()}
        />
      </div>
    );
  }
  const s = supplier.data;
  const changed = result?.products.filter((p) => p.previousSupplier) ?? [];

  return (
    <div className="page">
      <Link to={`/proveedores/${s.id}`} className="back-link">
        ‹ Volver a {s.name}
      </Link>
      <h1>Productos habituales de {s.name}</h1>
      <p className="page__sub">
        Tildá los productos que le comprás normalmente a este proveedor. Cada producto tiene un solo
        proveedor habitual: si ya tenía otro, se reemplaza.
      </p>

      {!s.isActive && (
        <Notice variant="warning">
          Este proveedor está desactivado: reactivalo para asignarle productos.
        </Notice>
      )}
      {result && (
        <Notice variant="success">
          {result.products.length === 0
            ? 'No había nada que cambiar: esos productos ya eran de este proveedor.'
            : `Listo: ${result.products.length} ${result.products.length === 1 ? 'producto asignado' : 'productos asignados'} a ${s.name}.`}
          {changed.length > 0 && (
            <>
              {' '}
              {changed
                .map((p) => `${p.name} estaba con ${p.previousSupplier?.name ?? ''}`)
                .join('; ')}
              .
            </>
          )}
        </Notice>
      )}

      <div className="searchbar">
        <div className="searchbar__field">
          <TextField
            label="Buscar por código de barras o nombre"
            type="search"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={onlyFree}
            onChange={(e) => {
              setOnlyFree(e.target.checked);
              setPage(1);
            }}
          />
          Solo los que no tienen proveedor habitual
        </label>
      </div>

      {products.isPending && <LoadingState label="Cargando los productos…" />}
      {products.isError && (
        <ErrorMessage
          title="No se pudieron cargar los productos"
          error={products.error}
          onRetry={() => void products.refetch()}
        />
      )}
      {products.isSuccess && products.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">No hay productos que coincidan.</p>
          <p>Probá con otro nombre o código.</p>
        </div>
      )}
      {products.isSuccess && products.data.items.length > 0 && (
        <>
          <ul className="plist plist--pick" aria-label="Productos">
            {products.data.items.map((p) => {
              const mine = p.defaultSupplier?.id === s.id;
              const checked = selected.has(p.id);
              return (
                <li key={p.id} className="plist__row">
                  <label className="check plist__pick">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={mine || p.isMiscellaneous}
                      onChange={() => toggle(p.id, p.name)}
                    />
                    <span className="plist__who">
                      <span className="plist__name">{p.name}</span>
                      <span className="plist__sub">
                        {p.category.name} · {p.subcategory.name}
                      </span>
                    </span>
                  </label>
                  <div className="plist__state">
                    {mine ? (
                      <Badge tone="ok">Ya es de {s.name}</Badge>
                    ) : p.defaultSupplier ? (
                      <span className="plist__sub">Habitual: {p.defaultSupplier.name}</span>
                    ) : (
                      <span className="plist__sub">Sin proveedor habitual</span>
                    )}
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

      <div className="stickybar" role="region" aria-label="Asignar">
        <p aria-live="polite">
          {selected.size === 0
            ? 'No elegiste ningún producto.'
            : `${selected.size} ${selected.size === 1 ? 'producto elegido' : 'productos elegidos'}.`}
        </p>
        <Button
          large
          loading={assign.isPending}
          disabled={selected.size === 0 || selected.size > MAX_PER_REQUEST || !s.isActive}
          onClick={() => assign.mutate()}
        >
          Asignar a {s.name}
        </Button>
      </div>
      {selected.size > MAX_PER_REQUEST && (
        <ErrorMessage
          title="Elegiste demasiados productos"
          message={`Se pueden asignar hasta ${MAX_PER_REQUEST} por vez.`}
        />
      )}
      {assign.isError && (
        <ErrorMessage title="No se pudo asignar" message={friendlyMessage(assign.error)} />
      )}
    </div>
  );
}
