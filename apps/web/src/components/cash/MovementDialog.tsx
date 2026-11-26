// Ingreso o salida de efectivo a mano (CAJ-06). Primero el sentido, después los motivos de ese
// sentido; el usuario nunca elige el signo. Termina con una confirmación.
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ConfirmDialog } from '../ConfirmDialog';
import { FormDialog } from '../FormDialog';
import { TextField } from '../TextField';
import { cashApi, cashKeys } from '../../lib/cash/api';
import { DIRECTION_LABELS, REASON_LABELS, formatCash, reasonsFor } from '../../lib/cash/labels';
import type { CashDirection, ManualCashReason } from '../../lib/cash/types';
import { toApiNumber } from '../../lib/catalog/decimalInput';
import { checkMoney } from '../../lib/catalog/validation';
import { salesKeys } from '../../lib/sales/api';

interface MovementDialogProps {
  /** Lo que el sistema calcula que hay "hasta ahora" en la caja abierta; solo de referencia. */
  expectedNow?: string | undefined;
  onCancel: () => void;
  onDone: () => void;
}

interface Draft {
  direction: CashDirection | null;
  reason: ManualCashReason | null;
  description: string;
  amount: string;
}

export function MovementDialog({ expectedNow, onCancel, onDone }: MovementDialogProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>({
    direction: null,
    reason: null,
    description: '',
    amount: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const [confirming, setConfirming] = useState<{ amount: string } | null>(null);

  const create = useMutation({
    mutationFn: cashApi.createMovement,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: cashKeys.all });
      void queryClient.invalidateQueries({ queryKey: salesKeys.currentCash });
      onDone();
    },
  });

  function change(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  }

  function review() {
    const next: typeof errors = {};
    if (!draft.direction) next.direction = 'Elegí si es un ingreso o una salida.';
    if (!draft.reason) next.reason = 'Elegí el motivo.';
    const description = draft.description.trim();
    if (description === '') next.description = 'Escribí qué fue. Por ejemplo: Pago limpieza.';
    else if (description.length > 200) next.description = 'Puede tener hasta 200 caracteres.';
    const check = checkMoney(draft.amount, 'El monto');
    if (check.error) next.amount = check.error;
    else if (check.value === null || !check.value.gt(0))
      next.amount = 'Escribí el monto. Tiene que ser mayor a $ 0.';
    setErrors(next);
    if (Object.keys(next).length === 0 && check.value) {
      setConfirming({ amount: toApiNumber(check.value) });
    }
  }

  const reasons = draft.direction ? reasonsFor(draft.direction) : [];

  if (confirming && draft.direction && draft.reason) {
    // Concordancia de género: "la salida" / "el ingreso".
    const word = draft.direction === 'OUT' ? 'la salida' : 'el ingreso';
    return (
      <ConfirmDialog
        title={`Confirmá ${word}`}
        confirmLabel={`Sí, registrar ${word}`}
        cancelLabel="No, corregir"
        busy={create.isPending}
        error={create.isError ? create.error : undefined}
        onCancel={() => {
          create.reset();
          setConfirming(null);
        }}
        onConfirm={() =>
          create.mutate({
            direction: draft.direction as CashDirection,
            reason: draft.reason as ManualCashReason,
            description: draft.description.trim(),
            amount: confirming.amount,
          })
        }
      >
        <p className="movement-confirm">
          {DIRECTION_LABELS[draft.direction]} de <strong>{formatCash(confirming.amount)}</strong>
        </p>
        <p>
          {REASON_LABELS[draft.reason]}: {draft.description.trim()}
        </p>
        <p className="page__sub">
          {draft.direction === 'OUT'
            ? 'Sale del efectivo de la caja abierta.'
            : 'Entra al efectivo de la caja abierta.'}{' '}
          No se puede editar ni borrar: si te equivocás, se corrige con otro movimiento.
        </p>
      </ConfirmDialog>
    );
  }

  return (
    <FormDialog
      title="Ingreso o salida de efectivo"
      submitLabel="Revisar"
      onSubmit={review}
      onCancel={onCancel}
    >
      <fieldset className="fieldset">
        <legend>¿Qué pasó con el efectivo?</legend>
        <div className="segmented segmented--large">
          {(['IN', 'OUT'] as const).map((d) => (
            <label key={d} className={`segmented__item${draft.direction === d ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="direction"
                checked={draft.direction === d}
                data-autofocus={d === 'IN' ? '' : undefined}
                onChange={() => change({ direction: d, reason: null })}
              />
              {d === 'IN' ? 'Entra plata' : 'Sale plata'}
            </label>
          ))}
        </div>
        {errors.direction && (
          <span className="field__error" role="alert">
            {errors.direction}
          </span>
        )}
      </fieldset>
      {draft.direction && (
        <fieldset className="fieldset">
          <legend>Motivo</legend>
          <div className="segmented">
            {reasons.map((r) => (
              <label key={r} className={`segmented__item${draft.reason === r ? ' is-on' : ''}`}>
                <input
                  type="radio"
                  name="reason"
                  checked={draft.reason === r}
                  onChange={() => change({ reason: r })}
                />
                {REASON_LABELS[r]}
              </label>
            ))}
          </div>
          {errors.reason && (
            <span className="field__error" role="alert">
              {errors.reason}
            </span>
          )}
        </fieldset>
      )}
      <TextField
        label="Descripción"
        hint="Qué fue, en pocas palabras."
        autoComplete="off"
        maxLength={200}
        value={draft.description}
        error={errors.description}
        onChange={(e) => change({ description: e.target.value })}
      />
      <TextField
        label="Monto ($)"
        hint={
          expectedNow !== undefined
            ? `Según el sistema, hasta ahora debería haber ${formatCash(expectedNow)} en la caja.`
            : undefined
        }
        inputMode="decimal"
        autoComplete="off"
        value={draft.amount}
        error={errors.amount}
        onChange={(e) => change({ amount: e.target.value })}
      />
    </FormDialog>
  );
}
