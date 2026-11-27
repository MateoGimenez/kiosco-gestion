// Lista de proveedores con su saldo (encargado y dueño).
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoneyWithCents } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { supplierKeys, suppliersApi } from '../lib/purchases/api';
import { WEEKDAYS, balanceCaption, balanceSign, formatPhone } from '../lib/purchases/labels';
import type { SupplierListParams } from '../lib/purchases/types';

type StatusFilter = 'active' | 'inactive' | 'all';
type SortFilter = 'name' | 'balance';

export function SuppliersPage() {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [sort, setSort] = useState<SortFilter>('name');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(text.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [text]);

  const params: SupplierListParams = {
    page,
    pageSize: 25,
    sortBy: sort,
    sortOrder: sort === 'balance' ? 'desc' : 'asc',
    ...(search ? { search } : {}),
    ...(status === 'active' ? { isActive: 'true' as const } : {}),
    ...(status === 'inactive' ? { isActive: 'false' as const } : {}),
  };
  const list = useQuery({
    queryKey: supplierKeys.list(params),
    queryFn: ({ signal }) => suppliersApi.list(params, signal),
    placeholderData: (previous) => previous,
  });

  return (
    <div className="page">
      <div className="page__header">
        <h1>Proveedores</h1>
        <div className="page__actions">
          <Link to="/compras/nueva" className="btn btn--secondary">
            Cargar una compra
          </Link>
          <Link to="/proveedores/nuevo" className="btn btn--primary">
            Nuevo proveedor
          </Link>
        </div>
      </div>

      <div className="filters">
        <TextField
          label="Buscar por nombre o CUIT"
          type="search"
          autoComplete="off"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <SelectField
          label="Mostrar"
          value={status}
          options={[
            { value: 'active', label: 'Solo activos' },
            { value: 'inactive', label: 'Solo desactivados' },
            { value: 'all', label: 'Todos' },
          ]}
          onChange={(e) => {
            setStatus(e.target.value as StatusFilter);
            setPage(1);
          }}
        />
        <SelectField
          label="Ordenar"
          value={sort}
          options={[
            { value: 'name', label: 'Por nombre' },
            { value: 'balance', label: 'A los que más les debemos, primero' },
          ]}
          onChange={(e) => {
            setSort(e.target.value as SortFilter);
            setPage(1);
          }}
        />
      </div>

      {list.isPending && <LoadingState label="Cargando los proveedores…" />}
      {list.isError && (
        <ErrorMessage
          title="No se pudieron cargar los proveedores"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.isSuccess && list.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">
            {search || status !== 'active'
              ? 'No hay proveedores que coincidan.'
              : 'Todavía no cargaste proveedores.'}
          </p>
          <p>
            {search || status !== 'active'
              ? 'Probá con otro nombre o cambiá el filtro.'
              : 'Cargá el primero para registrar compras y llevar la cuenta.'}
          </p>
          {!search && status === 'active' && (
            <Link to="/proveedores/nuevo" className="btn btn--primary">
              Nuevo proveedor
            </Link>
          )}
        </div>
      )}
      {list.isSuccess && list.data.items.length > 0 && (
        <>
          <ul className="plist plist--suppliers" aria-label="Proveedores">
            <li className="plist__head" aria-hidden="true">
              <span>Proveedor</span>
              <span className="plist__num">Saldo</span>
              <span className="plist__num">Productos habituales</span>
              <span />
            </li>
            {list.data.items.map((s) => {
              const owed = balanceSign(s.balance);
              const days = s.visitDays
                .map((d) => WEEKDAYS.find((w) => w.value === d)?.short)
                .filter(Boolean)
                .join(', ');
              return (
                <li key={s.id} className={`plist__row${s.isActive ? '' : ' plist__row--inactive'}`}>
                  <div className="plist__who">
                    <Link to={`/proveedores/${s.id}`} className="plist__name">
                      {s.name}
                    </Link>
                    <span className="plist__sub">
                      {[s.phone ? formatPhone(s.phone) : 'Sin teléfono', days && `Visita: ${days}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {!s.isActive && <Badge tone="off">Desactivado</Badge>}
                  </div>
                  <div className={`plist__num${owed > 0 ? ' text-bad' : ''}`}>
                    <span className="plist__label">Saldo</span>
                    {formatMoneyWithCents(s.balance)}
                    <span className="plist__sub">{balanceCaption(s.balance)}</span>
                  </div>
                  <div className="plist__num">
                    <span className="plist__label">Productos habituales</span>
                    {s.defaultProductCount}
                  </div>
                  <div className="plist__state">
                    <Link to={`/proveedores/${s.id}`} className="btn btn--secondary">
                      Ver cuenta
                    </Link>
                    {s.isActive && (
                      <Link to={`/compras/nueva?supplierId=${s.id}`} className="btn btn--secondary">
                        Cargar compra
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
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
