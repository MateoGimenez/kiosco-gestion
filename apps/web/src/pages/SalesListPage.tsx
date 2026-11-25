// Lista de ventas (encargado y dueño): por día de trabajo, caja y estado.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { formatMoney } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Pagination } from '../components/Pagination';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { salesApi, salesKeys } from '../lib/sales/api';
import { SHIFT_LABELS, formatBusinessDate, formatTime } from '../lib/sales/labels';
import type { SaleStatus } from '../lib/sales/types';

export function SalesListPage() {
  const current = useQuery({
    queryKey: salesKeys.currentCash,
    queryFn: ({ signal }) => salesApi.currentCash(signal),
  });
  if (current.isPending) {
    return (
      <div className="page">
        <h1>Ventas</h1>
        <LoadingState />
      </div>
    );
  }
  if (current.isError) {
    return (
      <div className="page">
        <h1>Ventas</h1>
        <ErrorMessage error={current.error} onRetry={() => void current.refetch()} />
      </div>
    );
  }
  return <SalesList today={current.data.currentBusinessDate} />;
}

function SalesList({ today }: { today: string }) {
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [cashId, setCashId] = useState('');
  const [status, setStatus] = useState<'' | SaleStatus>('');
  const [page, setPage] = useState(1);
  const rangeOk = from !== '' && to !== '' && from <= to;

  const cashSessions = useQuery({
    queryKey: salesKeys.cashSessions(from, to),
    queryFn: ({ signal }) => salesApi.cashSessions(from, to, signal),
    enabled: rangeOk,
  });
  const sales = useQuery({
    queryKey: [...salesKeys.sales, 'list', from, to, cashId, status, page],
    queryFn: ({ signal }) =>
      salesApi.list(
        {
          page,
          from,
          to,
          ...(cashId ? { cashSessionId: Number(cashId) } : {}),
          ...(status ? { status } : {}),
        },
        signal,
      ),
    enabled: rangeOk,
  });

  function reset<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1>Ventas</h1>
          <p className="page__sub">Por día de trabajo. Se anula desde el detalle de cada venta.</p>
        </div>
      </div>

      <div className="filters">
        <TextField
          label="Desde"
          type="date"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <TextField
          label="Hasta"
          type="date"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
        <SelectField
          label="Caja"
          placeholder="Todas las cajas"
          value={cashId}
          onChange={(e) => reset(setCashId)(e.target.value)}
          options={(cashSessions.data?.items ?? []).map((c) => ({
            value: String(c.id),
            label: `${formatBusinessDate(c.businessDate)} · ${SHIFT_LABELS[c.shift]} · ${c.openedBy.fullName}`,
          }))}
        />
        <SelectField
          label="Estado"
          placeholder="Todas"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value as '' | SaleStatus)}
          options={[
            { value: 'COMPLETED', label: 'Cobradas' },
            { value: 'VOIDED', label: 'Anuladas' },
          ]}
        />
      </div>

      {!rangeOk && (
        <ErrorMessage
          title="Revisá las fechas"
          message="«Desde» no puede ser posterior a «Hasta»."
        />
      )}
      {rangeOk && sales.isPending && <LoadingState label="Cargando las ventas…" />}
      {sales.isError && (
        <ErrorMessage
          title="No se pudieron cargar las ventas"
          error={sales.error}
          onRetry={() => void sales.refetch()}
        />
      )}
      {sales.isSuccess && sales.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">No hay ventas con estos filtros</p>
          <p>Probá con otro día o con «Todas las cajas».</p>
        </div>
      )}
      {sales.isSuccess && sales.data.items.length > 0 && (
        <>
          <ul className="sales-list">
            <li className="sales-row sales-row--head" aria-hidden="true">
              <span>Venta</span>
              <span>Vendió</span>
              <span>Medios</span>
              <span className="sales-row__num">Total</span>
              <span>Estado</span>
            </li>
            {sales.data.items.map((sale) => (
              <li
                key={sale.id}
                className={`sales-row${sale.status === 'VOIDED' ? ' sales-row--voided' : ''}`}
              >
                <Link className="sales-row__id" to={`/ventas/${sale.id}`}>
                  <strong>#{sale.id}</strong>
                  <span>
                    {formatBusinessDate(sale.businessDate)} {formatTime(sale.createdAt)}
                  </span>
                </Link>
                <span>
                  {sale.user.fullName}
                  <span className="sales-row__sub">
                    {SHIFT_LABELS[sale.cashSession.shift]} · {sale.itemCount}{' '}
                    {sale.itemCount === 1 ? 'producto' : 'productos'}
                    {sale.hasMiscellaneous ? ' (con Varios)' : ''}
                  </span>
                </span>
                <span>{sale.payments.map((p) => p.name).join(' + ')}</span>
                <span className="sales-row__num">{formatMoney(sale.total)}</span>
                <span>
                  {sale.status === 'VOIDED' ? (
                    <Badge tone="bad">Anulada</Badge>
                  ) : (
                    <Badge tone="ok">Cobrada</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={sales.data.pageSize}
            total={sales.data.total}
            onPage={setPage}
          />
        </>
      )}
    </div>
  );
}
