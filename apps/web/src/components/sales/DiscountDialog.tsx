// Descuento de la venta, en $ o en %. Solo lo ven encargado y dueño.
import { useState } from 'react';
import { FormDialog } from '../FormDialog';
import { TextField } from '../TextField';
import { toApiNumber, toInputText } from '../../lib/catalog/decimalInput';
import { checkMoney, checkPercent } from '../../lib/catalog/validation';
import type { CartDiscount } from '../../lib/sales/cart';

interface DiscountDialogProps {
  current: CartDiscount | null;
  onSubmit: (discount: CartDiscount | null) => void;
  onCancel: () => void;
}

export function DiscountDialog({ current, onSubmit, onCancel }: DiscountDialogProps) {
  const [type, setType] = useState<'AMOUNT' | 'PERCENT'>(current?.type ?? 'PERCENT');
  const [value, setValue] = useState(current ? toInputText(current.value) : '');
  const [reason, setReason] = useState(current?.reason ?? '');
  const [error, setError] = useState<string | undefined>();

  function submit() {
    if (value.trim() === '' && current) return onSubmit(null);
    const label = 'El descuento';
    const check = type === 'PERCENT' ? checkPercent(value, label) : checkMoney(value, label);
    if (check.error) return setError(check.error);
    if (check.value === null || !check.value.gt(0))
      return setError('Escribí cuánto descontar. Tiene que ser mayor a 0.');
    if (type === 'PERCENT' && check.value.gte(100))
      return setError('El descuento tiene que ser menor al 100 %.');
    if (reason.trim().length > 200) return setError('El motivo puede tener hasta 200 caracteres.');
    onSubmit({ type, value: toApiNumber(check.value), reason: reason.trim() });
  }

  return (
    <FormDialog title="Descuento" submitLabel="Aplicar" onSubmit={submit} onCancel={onCancel}>
      <fieldset className="fieldset">
        <legend>Descontar en</legend>
        <div className="segmented">
          {(
            [
              ['PERCENT', 'Porcentaje (%)'],
              ['AMOUNT', 'Pesos ($)'],
            ] as const
          ).map(([kind, label]) => (
            <label key={kind} className={`segmented__item${type === kind ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="discount-type"
                checked={type === kind}
                onChange={() => {
                  setType(kind);
                  setError(undefined);
                }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <TextField
        label={type === 'PERCENT' ? 'Cuántos %' : 'Cuántos pesos'}
        inputMode="decimal"
        autoComplete="off"
        autoFocus
        value={value}
        error={error}
        onChange={(e) => {
          setValue(e.target.value);
          setError(undefined);
        }}
      />
      <TextField
        label="Motivo (opcional)"
        autoComplete="off"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {current && (
        <p className="field__hint">Para sacar el descuento, dejá el valor vacío y aplicá.</p>
      )}
    </FormDialog>
  );
}
