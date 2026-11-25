// Lista de productos: búsqueda rápida (código o nombre), filtros y acceso a la ficha.
// La ven los tres roles. Nunca muestra costos ni márgenes.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { SelectField } from '../components/SelectField';
import { catalogApi, keys, type ProductListParams } from '../lib/catalog/api';
import { isNegative, quantityText } from '../lib/catalog/labels';
import { formatPrice } from '../lib/catalog/pricing';
import { isManagerOrOwner, useRole } from '../lib/useRole';

const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: 'active', label: 'Solo activos' },
  { value: 'inactive', label: 'Solo desactivados' },
  { value: 'all', label: 'Todos' },
];

/** Un código de barras se reconoce porque son solo números y son varios. */
function looksLikeBarcode(text: string): boolean {
  return /^\d{4,}$/.test(text.trim());
}

export function ProductsPage() {
  const role = useRole();
  const canEdit = isManagerOrOwner(role);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const subcategory = params.get('subcategory') ?? '';
  const status = params.get('status') ?? 'active';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);

  const [text, setText] = useState(q);
  const [codeMissing, setCodeMissing] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Foco inicial en el buscador: el lector de código "escribe" directo ahí.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  function update(changes: Record<string, string | null>, keepPage = false) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key);
          else next.set(key, value);
        }
        if (!keepPage) next.delete('page');
        return next;
      },
      { replace: true },
    );
  }

  // La búsqueda por nombre se manda un instante después de dejar de escribir.
  useEffect(() => {
    if (text.trim() === q) return;
    const timer = setTimeout(() => update({ q: text.trim() }), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, q]);

  const categories = useQuery({
    queryKey: keys.categories,
    queryFn: ({ signal }) => catalogApi.categories(signal),
  });
  const subcategories =
    categories.data?.items.find((c) => String(c.id) === category)?.subcategories ?? [];

  const listParams: ProductListParams = { page, pageSize: PAGE_SIZE };
  if (q) listParams.search = q;
  if (category) listParams.categoryId = Number(category);
  if (subcategory) listParams.subcategoryId = Number(subcategory);
  if (status === 'active') listParams.isActive = 'true';
  if (status === 'inactive') listParams.isActive = 'false';

  const products = useQuery({
    queryKey: [...keys.products, 'list', listParams],
    queryFn: ({ signal }) => catalogApi.products(listParams, signal),
    placeholderData: (previous) => previous,
  });

  // Enter con un código de barras: abre la ficha del producto que tiene ese código exacto.
  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    setCodeMissing(null);
    if (!looksLikeBarcode(value)) {
      update({ q: value });
      return;
    }
    try {
      // La búsqueda del mostrador prioriza el código exacto (solo productos activos).
      const result = await queryClient.fetchQuery({
        queryKey: [...keys.products, 'barcode', value],
        queryFn: ({ signal }) => catalogApi.search(value, signal),
        staleTime: 0,
      });
      const exact = result.matchedBy === 'BARCODE' ? result.items[0] : undefined;
      if (exact) {
        void navigate(`/productos/${exact.id}`);
        return;
      }
      // Si el código es de un producto desactivado, se lo busca en la lista (la ficha existe).
      if (result.isInactiveBarcode) {
        const inactive = await queryClient.fetchQuery({
          queryKey: [...keys.products, 'barcode-inactive', value],
          queryFn: ({ signal }) =>
            catalogApi.products({ search: value, isActive: 'false', pageSize: 50 }, signal),
          staleTime: 0,
        });
        const match = inactive.items.find((p) => p.barcode === value);
        if (match) {
          void navigate(`/productos/${match.id}`);
          return;
        }
      }
      setCodeMissing(value);
      update({ q: value });
    } catch {
      update({ q: value });
    }
  }

  const items = products.data?.items ?? [];

  return (
    <div className="page">
      <div className="page__header">
        <h1>Productos</h1>
        {canEdit && (
          <div className="page__actions">
            <Link to="/productos/nuevo" className="btn btn--primary">
              Nuevo producto
            </Link>
          </div>
        )}
      </div>

      <form className="searchbar" role="search" onSubmit={(e) => void onSubmit(e)}>
        <div className="field searchbar__field">
          <label className="field__label" htmlFor="product-search">
            Buscar por código de barras o nombre
          </label>
          <input
            id="product-search"
            ref={searchRef}
            className="field__input"
            type="search"
            inputMode="search"
            autoComplete="off"
            placeholder="Código o nombre"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCodeMissing(null);
            }}
          />
        </div>
        <Button type="submit" large>
          Buscar
        </Button>
      </form>

      <div className="filters">
        <SelectField
          label="Categoría"
          value={category}
          placeholder="Todas"
          options={(categories.data?.items ?? []).map((c) => ({
            value: String(c.id),
            label: c.isActive ? c.name : `${c.name} (desactivada)`,
          }))}
          onChange={(e) => update({ category: e.target.value, subcategory: null })}
        />
        <SelectField
          label="Subcategoría"
          value={subcategory}
          placeholder="Todas"
          disabled={!category}
          hint={category ? undefined : 'Elegí primero una categoría.'}
          options={subcategories.map((s) => ({
            value: String(s.id),
            label: s.isActive ? s.name : `${s.name} (desactivada)`,
          }))}
          onChange={(e) => update({ subcategory: e.target.value })}
        />
        <SelectField
          label="Estado"
          value={status}
          options={STATUS_OPTIONS}
          onChange={(e) => update({ status: e.target.value === 'active' ? null : e.target.value })}
        />
      </div>

      {categories.isError && (
        <ErrorMessage
          title="No se pudieron cargar las categorías"
          error={categories.error}
          onRetry={() => void categories.refetch()}
        />
      )}

      {codeMissing && (
        <Notice variant="warning">
          No hay ningún producto con el código {codeMissing}.{' '}
          {canEdit && (
            <Link to={`/productos/nuevo?barcode=${encodeURIComponent(codeMissing)}`}>
              Crear un producto con este código
            </Link>
          )}
        </Notice>
      )}

      {products.isPending && <LoadingState label="Cargando productos…" />}
      {products.isError && (
        <ErrorMessage
          title="No se pudo cargar la lista de productos"
          error={products.error}
          onRetry={() => void products.refetch()}
        />
      )}
      {products.isSuccess && items.length === 0 && (
        <div className="empty">
          <p className="empty__title">
            {q || category || subcategory || status !== 'active'
              ? 'No hay productos que coincidan con la búsqueda.'
              : 'Todavía no hay productos cargados.'}
          </p>
          {q || category || subcategory || status !== 'active' ? (
            <p>Probá con otro nombre, o quitá los filtros.</p>
          ) : (
            canEdit && <p>Cargá el primero con el botón "Nuevo producto".</p>
          )}
        </div>
      )}
      {products.isSuccess && items.length > 0 && (
        <>
          <ul className="plist" aria-label="Productos">
            <li className="plist__head" aria-hidden="true">
              <span>Producto</span>
              <span className="plist__num">Precio</span>
              <span className="plist__num">Stock</span>
              <span>Estado</span>
            </li>
            {items.map((p) => (
              <li key={p.id} className={`plist__row${p.isActive ? '' : ' plist__row--inactive'}`}>
                <div className="plist__who">
                  <Link to={`/productos/${p.id}`} className="plist__name">
                    {p.name}
                  </Link>
                  <span className="plist__sub">
                    {p.category.name} · {p.subcategory.name}
                    {p.barcode ? ` · ${p.barcode}` : ''}
                  </span>
                </div>
                <div className="plist__num">
                  <span className="plist__label">Precio</span>
                  {p.isMiscellaneous ? 'A mano' : formatPrice(p.salePrice)}
                </div>
                <div className="plist__num">
                  <span className="plist__label">Stock</span>
                  {p.isMiscellaneous ? '—' : quantityText(p.stockQuantity, p.saleUnit)}
                </div>
                <div className="plist__state">
                  {!p.isActive && <Badge tone="off">Desactivado</Badge>}
                  {p.isActive && isNegative(p.stockQuantity) && !p.isMiscellaneous && (
                    <Badge tone="bad">Stock negativo</Badge>
                  )}
                  {p.isActive && !isNegative(p.stockQuantity) && p.needsRestock && (
                    <Badge tone="warn">Para reponer</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Pagination
            page={products.data.page}
            pageSize={products.data.pageSize}
            total={products.data.total}
            onPage={(next) => update({ page: String(next) }, true)}
          />
        </>
      )}
    </div>
  );
}
