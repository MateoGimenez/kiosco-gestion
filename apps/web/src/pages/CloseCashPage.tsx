// Cierre de caja a ciegas (CAJ-03): pide SOLO el efectivo contado. No muestra nada del esperado.
// Quien cierra confirma el monto escrito (H-45). Después, el empleado ve solo "Caja cerrada" y lo que
// contó (H-46); encargado y dueño pasan al detalle con la diferencia.
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BillCounter } from '../components/cash/BillCounter';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextAreaField } from '../components/TextAreaField';
import { TextField } from '../components/TextField';
import { useAuth } from '../lib/auth-context';
import { ApiError } from '../lib/api';
import { cashApi, cashKeys } from '../lib/cash/api';
import { formatCash } from '../lib/cash/labels';
import type { CashSessionClosedPublic, CloseResult } from '../lib/cash/types';
import { useCurrentCash } from '../lib/cash/useCurrentCash';
import { toApiNumber } from '../lib/catalog/decimalInput';
import { checkMoney } from '../lib/catalog/validation';
import { salesKeys } from '../lib/sales/api';
import { SHIFT_LABELS, formatBusinessDate, formatTime } from '../lib/sales/labels';
import { useIsRemote, useRole } from '../lib/useRole';

export function CloseCashPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { state } = useAuth();
  const role = useRole();
  const remote = useIsRemote();
  const meId = state.status === 'authenticated' ? state.session.user.id : null;
  const cash = useCurrentCash();

  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [done, setDone] = useState<
    { kind: 'public'; session: CashSessionClosedPublic } | { kind: 'already' } | null
  >(null);

  const session = cash.data?.cashSession ?? null;

  const close = useMutation({
    mutationFn: (vars: { id: number; countedCash: string }) =>
      cashApi.close(
        vars.id,
        { countedCash: vars.countedCash, ...(note.trim() ? { closingNote: note.trim() } : {}) },
        role,
      ),
    onSuccess: (result: CloseResult) => {
      setConfirm(null);
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      void queryClient.invalidateQueries({ queryKey: salesKeys.currentCash });
      if (result.kind === 'detail') {
        queryClient.setQueryData(cashKeys.detail(result.session.id), result.session);
        void navigate(`/caja/${result.session.id}`, { replace: true, state: { justClosed: true } });
      } else {
        setDone({ kind: 'public', session: result.session });
      }
    },
    onError: (err) => {
      // Se perdió la respuesta y se reintentó: si la cerré yo, es un éxito (caja.md 10.3).
      if (err instanceof ApiError && err.code === 'CASH_SESSION_ALREADY_CLOSED') {
        const closedBy = (err.details as { closedBy?: { id: number } } | undefined)?.closedBy;
        if (closedBy && closedBy.id === meId) {
          setConfirm(null);
          void queryClient.invalidateQueries({ queryKey: salesKeys.currentCash });
          setDone({ kind: 'already' });
        }
      }
    },
  });

  function review(event: FormEvent) {
    event.preventDefault();
    const check = checkMoney(counted, 'El efectivo contado');
    if (check.error) return setError(check.error);
    if (check.value === null)
      return setError('Escribí cuánto efectivo contaste. Si no hay nada, poné 0.');
    if (note.trim().length > 500) return setError('La nota puede tener hasta 500 caracteres.');
    setError(undefined);
    setConfirm(toApiNumber(check.value));
  }

  if (done) {
    return (
      <div className="page">
        <div className="panel closed-card" role="status">
          <h1>Caja cerrada</h1>
          {done.kind === 'public' ? (
            <>
              <p className="closed-card__amount">
                Contaste <strong>{formatCash(done.session.countedCash)}</strong>.
              </p>
              <p className="page__sub">
                Se cerró a las {formatTime(done.session.closedAt)}. Para vender, hay que abrir una
                caja nueva.
              </p>
            </>
          ) : (
            <p>La caja ya quedó cerrada.</p>
          )}
          <div className="form__actions">
            <Link className="btn btn--primary btn--large" to="/">
              Volver al inicio
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (cash.isPending) {
    return (
      <div className="page">
        <h1>Cerrar la caja</h1>
        <LoadingState label="Cargando la caja…" />
      </div>
    );
  }
  if (cash.isError) {
    return (
      <div className="page">
        <h1>Cerrar la caja</h1>
        <ErrorMessage
          title="No se pudo cargar la caja"
          error={cash.error}
          onRetry={() => void cash.refetch()}
        />
      </div>
    );
  }
  if (!session) {
    return (
      <div className="page">
        <h1>Cerrar la caja</h1>
        <div className="empty">
          <p className="empty__title">No hay ninguna caja abierta</p>
          <p>No hay nada para cerrar. Para empezar a vender, abrí una caja.</p>
          <div>
            <Link className="btn btn--secondary" to="/vender">
              Ir a vender
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const blocked = remote || !cash.data.canClose;

  return (
    <div className="page">
      <form className="panel close-cash" onSubmit={review} noValidate>
        <div>
          <h1>Cerrar la caja</h1>
          <p className="page__sub">
            Turno {SHIFT_LABELS[session.shift].toLowerCase()} del{' '}
            {formatBusinessDate(session.businessDate)} · abierta por {session.openedBy.fullName} a
            las {formatTime(session.openedAt)}
          </p>
        </div>
        {remote && (
          <Notice variant="warning">
            Solo desde el local. Desde afuera no se puede cerrar la caja.
          </Notice>
        )}
        {!remote && !cash.data.canClose && (
          <Notice variant="warning">
            Esta caja la abrió {session.openedBy.fullName}. La puede cerrar quien la abrió, un
            encargado o el dueño.
          </Notice>
        )}
        <TextField
          label="Efectivo contado ($)"
          hint="Contá todo el efectivo del cajón y escribí el total. El sistema hace la cuenta."
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          disabled={blocked}
          value={counted}
          error={error}
          onChange={(e) => {
            setCounted(e.target.value);
            setError(undefined);
          }}
        />
        {!blocked && (
          <BillCounter
            onUse={(total) => {
              setCounted(total);
              setError(undefined);
            }}
          />
        )}
        <TextAreaField
          label="Nota (opcional)"
          hint="Algo que el encargado tenga que saber de este turno."
          rows={2}
          maxLength={500}
          disabled={blocked}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="form__actions">
          <Button type="submit" large disabled={blocked}>
            Revisar y cerrar
          </Button>
          <Link className="btn btn--secondary btn--large" to="/vender">
            Volver
          </Link>
        </div>
      </form>

      {confirm !== null && (
        <ConfirmDialog
          title="Confirmá lo que contaste"
          confirmLabel="Sí, cerrar la caja"
          cancelLabel="No, corregir"
          busy={close.isPending}
          error={close.isError ? close.error : undefined}
          onCancel={() => {
            close.reset();
            setConfirm(null);
          }}
          onConfirm={() => close.mutate({ id: session.id, countedCash: confirm })}
        >
          <p className="confirm-amount">
            ¿Contaste <strong>{formatCash(confirm)}</strong>?
          </p>
          <p className="page__sub">Después de cerrar no se puede cambiar este número.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
