// Detalle y arqueo de una caja (encargado y dueño): la cuenta del efectivo paso a paso, la
// diferencia, el resumen por medio de pago, ventas, anulaciones, movimientos y notas.
import { useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Decimal, formatMoney } from '@kiosco/shared';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { DifferenceValue } from '../components/cash/DifferenceValue';
import { MovementDialog } from '../components/cash/MovementDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { Pagination } from '../components/Pagination';
import { TextAreaField } from '../components/TextAreaField';
import { friendlyMessage } from '../lib/apiMessages';
import { cashApi, cashKeys } from '../lib/cash/api';
import {
  DIRECTION_LABELS,
  REASON_LABELS,
  differenceTone,
  formatCash,
  hasOpeningDifference,
} from '../lib/cash/labels';
import type { CashSessionDetail } from '../lib/cash/types';
import { formatDateTime } from '../lib/format';
import { salesApi } from '../lib/sales/api';
import { SHIFT_LABELS, formatBusinessDate } from '../lib/sales/labels';
import { useIsRemote } from '../lib/useRole';

export function CashDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const location = useLocation();
  const justClosed = (location.state as { justClosed?: boolean } | null)?.justClosed === true;
  const valid = Number.isInteger(id) && id > 0;

  const detail = useQuery({
    queryKey: cashKeys.detail(id),
    queryFn: ({ signal }) => cashApi.detail(id, signal),
    enabled: valid,
  });

  const back = (
    <Link className="back-link" to="/caja">
      ← Volver a Caja
    </Link>
  );

  if (!valid || detail.isPending) {
    return (
      <div className="page">
        {back}
        {valid ? (
          <LoadingState label="Cargando la caja…" />
        ) : (
          <ErrorMessage message="No existe esa caja." />
        )}
      </div>
    );
  }
  if (detail.isError) {
    return (
      <div className="page">
        {back}
        <ErrorMessage
          title="No se pudo cargar la caja"
          error={detail.error}
          onRetry={() => void detail.refetch()}
        />
      </div>
    );
  }
  return (
    <div className="page">
      {back}
      <CashDetail session={detail.data} justClosed={justClosed} />
    </div>
  );
}

function CashDetail({ session, justClosed }: { session: CashSessionDetail; justClosed: boolean }) {
  const remote = useIsRemote();
  const [moving, setMoving] = useState(false);
  const closed = session.status === 'CLOSED';
  const { summary } = session;

  return (
    <>
      <div className="page__header">
        <div>
          <h1>
            Caja {SHIFT_LABELS[session.shift].toLowerCase()} del{' '}
            {formatBusinessDate(session.businessDate)}
          </h1>
          <p className="page__sub">
            Abrió {session.openedBy.fullName} el {formatDateTime(session.openedAt)}
            {session.closedAt && session.closedBy
              ? ` · cerró ${session.closedBy.fullName} el ${formatDateTime(session.closedAt)}`
              : ''}
          </p>
        </div>
        {closed ? <Badge tone="ok">Cerrada</Badge> : <Badge tone="warn">Abierta</Badge>}
      </div>

      {justClosed && closed && (
        <Notice variant="success">La caja quedó cerrada. Este es el resultado.</Notice>
      )}

      <section className="panel panel--wide arqueo" aria-labelledby="arqueo-title">
        <h2 id="arqueo-title">Arqueo del efectivo</h2>
        <dl className="arqueo__rows">
          <div>
            <dt>Efectivo inicial</dt>
            <dd>{formatCash(summary.openingCash)}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">+ </span>Cobrado en efectivo
            </dt>
            <dd>{formatCash(summary.cashSales)}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">+ </span>Ingresos
            </dt>
            <dd>{formatCash(summary.cashIn)}</dd>
          </div>
          <div>
            <dt>
              <span aria-hidden="true">− </span>Salidas
              {summary.voidRefunds !== '0.00' && summary.voidRefunds !== '0' && (
                <span className="arqueo__sub">
                  incluye devoluciones por anulación: {formatCash(summary.voidRefunds)}
                </span>
              )}
            </dt>
            <dd>{formatCash(summary.cashOut)}</dd>
          </div>
          <div className="arqueo__total">
            <dt>{closed ? 'Esperado' : 'Esperado hasta ahora'}</dt>
            <dd>{formatCash(session.expectedCash ?? summary.expectedCash)}</dd>
          </div>
          <div>
            <dt>Contado</dt>
            <dd>
              {session.countedCash !== null
                ? formatCash(session.countedCash)
                : 'Todavía no se contó'}
            </dd>
          </div>
        </dl>
        <OpeningCheck session={session} />
        {!session.openingVsPreviousClose && session.previousClosing && (
          <p className="page__note">
            En el cierre anterior (caja #{session.previousClosing.cashSessionId}, turno{' '}
            {SHIFT_LABELS[session.previousClosing.shift].toLowerCase()} del{' '}
            {formatBusinessDate(session.previousClosing.businessDate)}) se contaron{' '}
            {formatCash(session.previousClosing.countedCash)}. Sirve de referencia para el efectivo
            inicial.
          </p>
        )}
        {session.difference !== null ? (
          <p className={`arqueo__diff arqueo__diff--${differenceTone(session.difference)}`}>
            <span>Diferencia</span>
            <DifferenceValue value={session.difference} />
          </p>
        ) : (
          <p className="page__note">La diferencia aparece cuando se cierra la caja.</p>
        )}
        {session.closingNote && (
          <p className="arqueo__note">
            <strong>Nota de quien cerró:</strong> {session.closingNote}
          </p>
        )}
        {!closed && (
          <div className="form__actions">
            <Button variant="secondary" disabled={remote} onClick={() => setMoving(true)}>
              Registrar ingreso o salida
            </Button>
            <Link className="btn btn--primary" to="/caja/cerrar">
              Cerrar caja
            </Link>
          </div>
        )}
      </section>

      <section aria-labelledby="pay-title" className="cash-section">
        <h2 id="pay-title">Por medio de pago</h2>
        <p className="page__sub">
          Solo el efectivo entra en la cuenta de arriba. Los otros medios son información.
        </p>
        {session.paymentSummary.length === 0 ? (
          <p className="empty">Todavía no hubo cobros en esta caja.</p>
        ) : (
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th scope="col">Medio</th>
                  <th scope="col" className="num">
                    Pagos
                  </th>
                  <th scope="col" className="num">
                    Recargo
                  </th>
                  <th scope="col" className="num">
                    Cobrado
                  </th>
                  <th scope="col" className="num">
                    De ventas anuladas
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.paymentSummary.map((p) => (
                  <tr key={p.paymentMethod.id}>
                    <th scope="row">{p.paymentMethod.name}</th>
                    <td className="num">{p.paymentCount}</td>
                    <td className="num">{formatCash(p.surchargeAmount)}</td>
                    <td className="num">{formatCash(p.chargedAmount)}</td>
                    <td className="num">{formatCash(p.voidedChargedAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CashSales session={session} />

      <section aria-labelledby="mov-title" className="cash-section">
        <h2 id="mov-title">Ingresos y salidas</h2>
        {session.movements.length === 0 ? (
          <p className="empty">No hubo ingresos ni salidas a mano en esta caja.</p>
        ) : (
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th scope="col">Hora</th>
                  <th scope="col">Qué fue</th>
                  <th scope="col">Registró</th>
                  <th scope="col" className="num">
                    Monto
                  </th>
                </tr>
              </thead>
              <tbody>
                {session.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>
                      <strong>{REASON_LABELS[m.reason]}</strong>
                      <span className="sales-row__sub">
                        {m.description}
                        {m.sale && (
                          <>
                            {' · '}
                            <Link to={`/ventas/${m.sale.id}`}>venta #{m.sale.id}</Link>
                            {m.sale.cashSessionId !== m.cashSessionId &&
                              ` (de la caja #${m.sale.cashSessionId})`}
                          </>
                        )}
                      </span>
                    </td>
                    <td>{m.user.fullName}</td>
                    <td className={`num move move--${m.direction.toLowerCase()}`}>
                      {m.direction === 'IN' ? '+' : '−'}
                      {formatCash(m.amount)}
                      <span className="sales-row__sub">{DIRECTION_LABELS[m.direction]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CashNotes session={session} />

      {moving && (
        <MovementDialog
          expectedNow={summary.expectedCash}
          onCancel={() => setMoving(false)}
          onDone={() => setMoving(false)}
        />
      )}
    </>
  );
}

/** Apertura contra el cierre anterior: aviso destacado si no coincide, línea discreta si coincide. */
function OpeningCheck({ session }: { session: CashSessionDetail }) {
  const check = session.openingVsPreviousClose;
  if (!check) return null;
  if (!hasOpeningDifference(check)) {
    return <p className="page__note">La apertura coincide con el cierre anterior.</p>;
  }
  const diff = new Decimal(check.difference);
  return (
    <div className="opening-alert" role="note">
      <p>
        <strong>La apertura no coincide con el cierre anterior.</strong> Al abrir se declararon{' '}
        {formatCash(session.summary.openingCash)}; en el cierre anterior (
        <Link to={`/caja/${check.previousCashSessionId}`}>caja #{check.previousCashSessionId}</Link>
        ) se contaron {formatCash(check.previousCountedCash)}: diferencia de{' '}
        <strong>
          {diff.isNegative() ? '−' : '+'}
          {formatCash(diff.abs())}
        </strong>{' '}
        ({diff.isNegative() ? 'se declaró menos' : 'se declaró más'}).
      </p>
    </div>
  );
}

function CashSales({ session }: { session: CashSessionDetail }) {
  const [page, setPage] = useState(1);
  const sales = useQuery({
    queryKey: cashKeys.sales(session.id, page),
    queryFn: ({ signal }) => salesApi.list({ cashSessionId: session.id, page }, signal),
  });
  const s = session.sales;
  return (
    <section aria-labelledby="sales-title" className="cash-section">
      <h2 id="sales-title">Ventas y anulaciones</h2>
      <p>
        {s.count} {s.count === 1 ? 'venta' : 'ventas'} por {formatMoney(s.total)}
        {s.voidedCount > 0 && (
          <>
            ;{' '}
            <strong>
              {s.voidedCount} anulada{s.voidedCount === 1 ? '' : 's'}
            </strong>{' '}
            por {formatMoney(s.voidedTotal)}
          </>
        )}
        {s.surchargeAmount !== '0.00' && s.surchargeAmount !== '0' && (
          <>. Recargos del crédito: {formatCash(s.surchargeAmount)}</>
        )}
        .
      </p>
      {sales.isPending && <LoadingState label="Cargando las ventas…" />}
      {sales.isError && (
        <ErrorMessage
          title="No se pudieron cargar las ventas"
          error={sales.error}
          onRetry={() => void sales.refetch()}
        />
      )}
      {sales.isSuccess && sales.data.items.length === 0 && (
        <p className="empty">Todavía no hay ventas en esta caja.</p>
      )}
      {sales.isSuccess && sales.data.items.length > 0 && (
        <>
          <div className="table-scroll">
            <table className="detail-table">
              <thead>
                <tr>
                  <th scope="col">Venta</th>
                  <th scope="col">Medios</th>
                  <th scope="col" className="num">
                    Total
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {sales.data.items.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <Link to={`/ventas/${sale.id}`}>#{sale.id}</Link>{' '}
                      <span className="sales-row__sub">{formatDateTime(sale.createdAt)}</span>
                    </td>
                    <td>{sale.payments.map((p) => p.name).join(' + ')}</td>
                    <td className="num">{formatMoney(sale.total)}</td>
                    <td>
                      {sale.status === 'VOIDED' ? (
                        <Badge tone="bad">Anulada</Badge>
                      ) : (
                        <Badge tone="ok">Cobrada</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pageSize={sales.data.pageSize}
            total={sales.data.total}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}

function CashNotes({ session }: { session: CashSessionDetail }) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const closed = session.status === 'CLOSED';

  const add = useMutation({
    mutationFn: (text: string) => cashApi.addNote(session.id, text),
    onSuccess: () => {
      setNote('');
      void queryClient.invalidateQueries({ queryKey: cashKeys.detail(session.id) });
      void queryClient.invalidateQueries({ queryKey: ['cash-sessions', 'list'] });
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = note.trim();
    if (text === '') return setError('Escribí la nota.');
    if (text.length > 500) return setError('La nota puede tener hasta 500 caracteres.');
    setError(undefined);
    add.mutate(text);
  }

  return (
    <section aria-labelledby="notes-title" className="cash-section">
      <h2 id="notes-title">Notas</h2>
      {session.notes.length === 0 ? (
        <p className="empty">Esta caja no tiene notas.</p>
      ) : (
        <ul className="notes">
          {session.notes.map((n) => (
            <li key={n.id}>
              <p>{n.note}</p>
              <p className="page__sub">
                {n.user.fullName} · {formatDateTime(n.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {closed ? (
        <form className="panel panel--wide" onSubmit={submit} noValidate>
          <TextAreaField
            label="Agregar una nota"
            hint="Queda con tu nombre y la hora. Una nota no se puede editar ni borrar."
            rows={2}
            maxLength={500}
            value={note}
            error={error}
            onChange={(e) => {
              setNote(e.target.value);
              setError(undefined);
            }}
          />
          {add.isError && (
            <ErrorMessage title="No se pudo guardar la nota" message={friendlyMessage(add.error)} />
          )}
          <div className="form__actions">
            <Button type="submit" variant="secondary" loading={add.isPending}>
              Agregar nota
            </Button>
          </div>
        </form>
      ) : (
        <p className="page__note">Las notas se agregan cuando la caja está cerrada.</p>
      )}
    </section>
  );
}
