// Apertura de caja (CAJ-01): turno y efectivo inicial. Cualquier rol puede abrirla; solo desde el local.
import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../Button';
import { cashApi, cashKeys } from '../../lib/cash/api';
import { formatCash } from '../../lib/cash/labels';
import { isManagerOrOwner, useRole } from '../../lib/useRole';
import { ErrorMessage } from '../ErrorMessage';
import { Notice } from '../Notice';
import { TextField } from '../TextField';
import { ApiError } from '../../lib/api';
import { friendlyMessage } from '../../lib/apiMessages';
import { toApiNumber } from '../../lib/catalog/decimalInput';
import { checkMoney } from '../../lib/catalog/validation';
import { salesKeys, salesApi } from '../../lib/sales/api';
import { SHIFTS, SHIFT_LABELS, formatBusinessDate, formatTime } from '../../lib/sales/labels';
import type { CashSession, Shift } from '../../lib/sales/types';

interface OpenCashFormProps {
  /** Si la sesión entró desde afuera del local, no se puede abrir. */
  remote: boolean;
}

export function OpenCashForm({ remote }: OpenCashFormProps) {
  const queryClient = useQueryClient();
  const role = useRole();
  // Referencia para el efectivo inicial (H-51): lo contado en el último cierre. Solo encargado y
  // dueño; el empleado no recibe datos de otras cajas (caja.md 2.1).
  const lastClosed = useQuery({
    queryKey: cashKeys.lastClosed,
    queryFn: ({ signal }) => cashApi.lastClosed(signal),
    enabled: isManagerOrOwner(role),
  });
  const last = lastClosed.data?.items[0];
  const [shift, setShift] = useState<Shift | null>(null);
  const [cash, setCash] = useState('');
  const [errors, setErrors] = useState<{ shift?: string; cash?: string }>({});

  const open = useMutation({
    mutationFn: (body: { shift: Shift; openingCash: string }) => salesApi.openCash(body),
    onSettled: () => queryClient.invalidateQueries({ queryKey: salesKeys.currentCash }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (shift === null) next.shift = 'Elegí el turno.';
    const check = checkMoney(cash, 'El efectivo inicial');
    if (check.error) next.cash = check.error;
    else if (check.value === null)
      next.cash = 'Escribí cuánto efectivo hay al abrir. Si no hay, poné 0.';
    setErrors(next);
    if (shift && check.value && Object.keys(next).length === 0) {
      open.mutate({ shift, openingCash: toApiNumber(check.value) });
    }
  }

  // Otra persona abrió la caja un instante antes: se avisa quién y se vende en esa (PA-02).
  const already =
    open.error instanceof ApiError && open.error.code === 'CASH_SESSION_ALREADY_OPEN'
      ? ((open.error.details as { cashSession?: CashSession } | undefined)?.cashSession ?? null)
      : null;

  return (
    <form className="panel open-cash" onSubmit={submit} noValidate>
      <div>
        <h2>Abrí la caja para empezar a vender</h2>
        <p className="page__sub">No hay ninguna caja abierta. Sin caja no se puede cobrar.</p>
      </div>
      {remote && (
        <Notice variant="warning">
          Solo desde el local. Desde afuera no se puede abrir la caja.
        </Notice>
      )}
      <fieldset className="fieldset" disabled={remote}>
        <legend>Turno</legend>
        <div className="segmented segmented--large">
          {SHIFTS.map((s) => (
            <label key={s} className={`segmented__item${shift === s ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="shift"
                checked={shift === s}
                onChange={() => {
                  setShift(s);
                  setErrors((e) => ({ ...e, shift: undefined }));
                }}
              />
              {SHIFT_LABELS[s]}
            </label>
          ))}
        </div>
        {errors.shift && (
          <span className="field__error" role="alert">
            {errors.shift}
          </span>
        )}
      </fieldset>
      <TextField
        label="Efectivo inicial ($)"
        hint={
          last?.countedCash != null
            ? `El dinero que hay en la caja al empezar, con el cambio incluido. En el último cierre (${SHIFT_LABELS[last.shift].toLowerCase()} del ${formatBusinessDate(last.businessDate)}) se contaron ${formatCash(last.countedCash)}.`
            : 'El dinero que hay en la caja al empezar, con el cambio incluido.'
        }
        inputMode="decimal"
        autoComplete="off"
        disabled={remote}
        value={cash}
        error={errors.cash}
        onChange={(e) => {
          setCash(e.target.value);
          setErrors((prev) => ({ ...prev, cash: undefined }));
        }}
      />
      {already ? (
        <Notice variant="info">
          Ya hay una caja abierta: la abrió {already.openedBy.fullName} (turno{' '}
          {SHIFT_LABELS[already.shift].toLowerCase()}, {formatTime(already.openedAt)}). Se vende en
          esa.
        </Notice>
      ) : (
        open.isError && (
          <ErrorMessage title="No se pudo abrir la caja" message={friendlyMessage(open.error)} />
        )
      )}
      <div className="form__actions">
        <Button type="submit" large loading={open.isPending} disabled={remote}>
          {remote ? 'Solo desde el local' : 'Abrir caja'}
        </Button>
      </div>
    </form>
  );
}
