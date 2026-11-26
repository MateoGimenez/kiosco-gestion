// "Caja" (encargado y dueño): estado de la caja abierta y lista de cajas con sus diferencias.
import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { DifferenceValue } from '../components/cash/DifferenceValue';
import { MovementDialog } from '../components/cash/MovementDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { SelectField } from '../components/SelectField';
import { StaleCashNotice } from '../components/cash/StaleCashNotice';
import { TextField } from '../components/TextField';
import { cashApi, cashKeys } from '../lib/cash/api';
import { formatCash } from '../lib/cash/labels';
import type { CashListParams, CashSessionStatus, Shift } from '../lib/cash/types';
import { useCurrentCash } from '../lib/cash/useCurrentCash';
import { SHIFTS, SHIFT_LABELS, formatBusinessDate, formatTime } from '../lib/sales/labels';
import { useIsRemote } from '../lib/useRole';

export function CashListPage() {
  const remote = useIsRemote();
  const current = useCurrentCash();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [shift, setShift] = useState<'' | Shift>('');
  const [status, setStatus] = useState<'' | CashSessionStatus>('');
  const [diff, setDiff] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const [moving, setMoving] = useState(false);
  const [moved, setMoved] = useState(false);
  const rangeOk = from === '' || to === '' || from <= to;

  const params: CashListParams = {
    page,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(shift ? { shift } : {}),
    ...(status ? { status } : {}),
    ...(diff ? { hasDifference: diff === 'true' } : {}),
  };
  const list = useQuery({
    queryKey: cashKeys.list(params),
    queryFn: ({ signal }) => cashApi.list(params, signal),
    enabled: rangeOk,
  });

  const open = current.data?.cashSession ?? null;
  // La cuenta "hasta ahora" de la caja abierta sirve de referencia al registrar un movimiento (H-52).
  const openDetail = useQuery({
    queryKey: cashKeys.detail(open?.id ?? 0),
    queryFn: ({ signal }) => cashApi.detail(open?.id ?? 0, signal),
    enabled: open !== null,
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
          <h1>Caja</h1>
          <p className="page__sub">Cierres, diferencias y movimientos de efectivo de cada turno.</p>
        </div>
      </div>
      {moved && <Notice variant="success">Listo, el movimiento quedó registrado.</Notice>}
      <StaleCashNotice />

      <section className="panel panel--wide cash-now" aria-labelledby="cash-now-title">
        <h2 id="cash-now-title">Caja abierta</h2>
        {current.isPending && <LoadingState label="Cargando la caja…" />}
        {current.isError && (
          <ErrorMessage
            title="No se pudo cargar la caja"
            error={current.error}
            onRetry={() => void current.refetch()}
          />
        )}
        {current.isSuccess && !open && (
          <p>
            No hay ninguna caja abierta. Se abre desde <Link to="/vender">Vender</Link>. Sin caja
            abierta no se pueden registrar ingresos ni salidas.
          </p>
        )}
        {current.isSuccess && open && (
          <>
            <p>
              Turno {SHIFT_LABELS[open.shift].toLowerCase()} del{' '}
              {formatBusinessDate(open.businessDate)}, abierta por {open.openedBy.fullName} a las{' '}
              {formatTime(open.openedAt)}.
            </p>
            {openDetail.isSuccess && (
              <p className="cash-now__expected">
                Según el sistema, hasta ahora debería haber{' '}
                <strong>{formatCash(openDetail.data.summary.expectedCash)}</strong> en efectivo.
              </p>
            )}
            <div className="form__actions">
              <Link className="btn btn--secondary" to={`/caja/${open.id}`}>
                Ver el detalle
              </Link>
              <Button
                variant="secondary"
                disabled={remote}
                onClick={() => {
                  setMoved(false);
                  setMoving(true);
                }}
              >
                Registrar ingreso o salida
              </Button>
              {current.data.canClose && !remote && (
                <Link className="btn btn--primary" to="/caja/cerrar">
                  Cerrar caja
                </Link>
              )}
            </div>
            {remote && (
              <p className="page__note">
                Los movimientos y el cierre se hacen solo desde el local.
              </p>
            )}
          </>
        )}
      </section>

      <div className="filters">
        <TextField
          label="Desde (día de trabajo)"
          type="date"
          value={from}
          onChange={(e) => reset(setFrom)(e.target.value)}
        />
        <TextField
          label="Hasta (día de trabajo)"
          type="date"
          value={to}
          onChange={(e) => reset(setTo)(e.target.value)}
        />
        <SelectField
          label="Turno"
          placeholder="Todos"
          value={shift}
          onChange={(e) => reset(setShift)(e.target.value as '' | Shift)}
          options={SHIFTS.map((s) => ({ value: s, label: SHIFT_LABELS[s] }))}
        />
        <SelectField
          label="Estado"
          placeholder="Todas"
          value={status}
          onChange={(e) => reset(setStatus)(e.target.value as '' | CashSessionStatus)}
          options={[
            { value: 'OPEN', label: 'Abiertas' },
            { value: 'CLOSED', label: 'Cerradas' },
          ]}
        />
        <SelectField
          label="Diferencia"
          placeholder="Con o sin"
          value={diff}
          onChange={(e) => reset(setDiff)(e.target.value as '' | 'true' | 'false')}
          options={[
            { value: 'true', label: 'Solo con diferencia' },
            { value: 'false', label: 'Solo sin diferencia' },
          ]}
        />
      </div>

      {!rangeOk && (
        <ErrorMessage
          title="Revisá las fechas"
          message="«Desde» no puede ser posterior a «Hasta»."
        />
      )}
      {rangeOk && list.isPending && <LoadingState label="Cargando las cajas…" />}
      {list.isError && (
        <ErrorMessage
          title="No se pudieron cargar las cajas"
          error={list.error}
          onRetry={() => void list.refetch()}
        />
      )}
      {list.isSuccess && list.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">No hay cajas con estos filtros</p>
          <p>Probá con otras fechas o sacá algún filtro.</p>
        </div>
      )}
      {list.isSuccess && list.data.items.length > 0 && (
        <>
          <ul className="sales-list cash-list">
            <li className="cash-row cash-row--head" aria-hidden="true">
              <span>Caja</span>
              <span>Abrió / cerró</span>
              <span className="sales-row__num">Contado</span>
              <span className="sales-row__num">Esperado</span>
              <span>Diferencia</span>
              <span>Notas</span>
            </li>
            {list.data.items.map((c) => (
              <li key={c.id} className="cash-row">
                <Link className="sales-row__id" to={`/caja/${c.id}`}>
                  <strong>
                    {formatBusinessDate(c.businessDate)} · {SHIFT_LABELS[c.shift]}
                  </strong>
                  <span>Caja #{c.id}</span>
                </Link>
                <span>
                  {c.openedBy.fullName}
                  <span className="sales-row__sub">
                    {c.closedBy ? (
                      `Cerró ${c.closedBy.fullName}`
                    ) : (
                      <Badge tone="warn">Abierta</Badge>
                    )}
                  </span>
                </span>
                <span className="sales-row__num">
                  {c.countedCash !== null ? formatCash(c.countedCash) : '—'}
                </span>
                <span className="sales-row__num">
                  {c.expectedCash !== null ? formatCash(c.expectedCash) : '—'}
                </span>
                <span>
                  {c.difference !== null ? <DifferenceValue value={c.difference} compact /> : '—'}
                </span>
                <span>
                  {c.noteCount > 0
                    ? `${c.noteCount} ${c.noteCount === 1 ? 'nota' : 'notas'}`
                    : 'Sin notas'}
                </span>
              </li>
            ))}
          </ul>
          <Pagination
            page={page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onPage={setPage}
          />
        </>
      )}

      {moving && (
        <MovementDialog
          expectedNow={openDetail.data?.summary.expectedCash}
          onCancel={() => setMoving(false)}
          onDone={() => {
            setMoving(false);
            setMoved(true);
          }}
        />
      )}
    </div>
  );
}
