// Saldo inicial y correcciones de la cuenta corriente (solo dueño).
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formatMoneyWithCents } from '@kiosco/shared';
import { friendlyMessage } from '../../lib/apiMessages';
import { checkMoney } from '../../lib/catalog/validation';
import { supplierKeys, suppliersApi } from '../../lib/purchases/api';
import { todayDate, withSign } from '../../lib/purchases/helpers';
import { FormDialog } from '../FormDialog';
import { SelectField } from '../SelectField';
import { TextAreaField } from '../TextAreaField';
import { TextField } from '../TextField';

interface BalanceEntryDialogProps {
  kind: 'opening' | 'adjustment';
  supplierId: number;
  supplierName: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function BalanceEntryDialog({
  kind,
  supplierId,
  supplierName,
  onClose,
  onSaved,
}: BalanceEntryDialogProps) {
  const queryClient = useQueryClient();
  const opening = kind === 'opening';
  const [sign, setSign] = useState<'plus' | 'minus'>('plus');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayDate());
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; date?: string; text?: string }>({});

  const save = useMutation({
    mutationFn: () => {
      const parsed = checkMoney(amount, 'El monto').value!;
      const signed = withSign(parsed, sign);
      return opening
        ? suppliersApi.openingBalance(supplierId, {
            amount: signed,
            entryDate: date,
            ...(text.trim() ? { description: text.trim() } : {}),
          })
        : suppliersApi.adjust(supplierId, { amount: signed, reason: text.trim() });
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      onSaved(
        `${opening ? 'Saldo inicial cargado' : 'Corrección guardada'}. Saldo con ${supplierName}: ${formatMoneyWithCents(response.balance)}.`,
      );
    },
  });

  function submit() {
    const next: typeof errors = {};
    const parsed = checkMoney(amount, 'El monto');
    if (amount.trim() === '') next.amount = 'Escribí el monto.';
    else if (parsed.error) next.amount = parsed.error;
    else if (parsed.value?.isZero()) next.amount = 'El monto tiene que ser distinto de cero.';
    if (opening && (date === '' || date > todayDate())) {
      next.date = 'Elegí una fecha de hoy o anterior.';
    }
    if (!opening && text.trim() === '') next.text = 'Contá el motivo de la corrección.';
    setErrors(next);
    if (Object.keys(next).length === 0) save.mutate();
  }

  return (
    <FormDialog
      title={
        opening ? `Saldo inicial de ${supplierName}` : `Corregir la cuenta de ${supplierName}`
      }
      submitLabel={opening ? 'Cargar saldo inicial' : 'Guardar corrección'}
      busy={save.isPending}
      error={save.error ? friendlyMessage(save.error) : undefined}
      onSubmit={submit}
      onCancel={onClose}
    >
      <p className="field__hint">
        {opening
          ? 'Lo que ya se le debía a este proveedor cuando empezaste a usar el sistema. Se carga una sola vez.'
          : 'Sirve para arreglar un error de carga o una nota de crédito. Queda registrado quién lo hizo y por qué.'}
      </p>
      <SelectField
        label={opening ? '¿Quién le debía a quién?' : '¿Qué pasa con la deuda?'}
        value={sign}
        options={
          opening
            ? [
                { value: 'plus', label: 'Le debíamos nosotros al proveedor' },
                { value: 'minus', label: 'Nos debía el proveedor a nosotros' },
              ]
            : [
                { value: 'plus', label: 'La deuda sube' },
                { value: 'minus', label: 'La deuda baja' },
              ]
        }
        onChange={(e) => setSign(e.target.value as 'plus' | 'minus')}
      />
      <TextField
        label="Monto"
        inputMode="decimal"
        autoComplete="off"
        value={amount}
        error={errors.amount}
        data-autofocus
        onChange={(e) => setAmount(e.target.value)}
      />
      {opening && (
        <TextField
          label="Fecha a la que corresponde"
          type="date"
          max={todayDate()}
          value={date}
          error={errors.date}
          onChange={(e) => setDate(e.target.value)}
        />
      )}
      {opening ? (
        <TextField
          label="Detalle (opcional)"
          maxLength={200}
          value={text}
          placeholder="Deuda al instalar el sistema"
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <TextAreaField
          label="Motivo"
          hint="Es obligatorio. Por ejemplo: nota de crédito por mercadería vencida."
          maxLength={200}
          rows={3}
          value={text}
          error={errors.text}
          onChange={(e) => setText(e.target.value)}
        />
      )}
    </FormDialog>
  );
}
