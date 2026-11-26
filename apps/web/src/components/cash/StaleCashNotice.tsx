// Aviso de caja abierta de un día anterior (NF-18, H-49). Avisa a todos; no bloquea vender.
import { Link } from 'react-router';
import { Notice } from '../Notice';
import { useCurrentCash } from '../../lib/cash/useCurrentCash';
import { useIsRemote } from '../../lib/useRole';
import { SHIFT_LABELS, formatBusinessDate } from '../../lib/sales/labels';

export function StaleCashNotice() {
  const cash = useCurrentCash();
  const remote = useIsRemote();
  const data = cash.data;
  if (!data?.cashSession || !data.isFromPreviousBusinessDay) return null;
  const session = data.cashSession;

  return (
    <Notice variant="warning">
      <div className="stale-cash">
        <p>
          <strong>Quedó abierta una caja de un día anterior.</strong> Es la del turno{' '}
          {SHIFT_LABELS[session.shift].toLowerCase()} del {formatBusinessDate(session.businessDate)}
          , abierta por {session.openedBy.fullName}. Cerrala contando el efectivo.
        </p>
        {data.canClose && !remote && (
          <Link className="btn btn--primary" to="/caja/cerrar">
            Cerrar caja
          </Link>
        )}
        {data.canClose && remote && <p>Se cierra desde el local.</p>}
        {!data.canClose && <p>Avisale a un encargado o al dueño para que la cierre.</p>}
      </div>
    </Notice>
  );
}
