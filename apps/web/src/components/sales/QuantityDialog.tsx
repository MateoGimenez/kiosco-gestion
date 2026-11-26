// Pide la cantidad de una línea: kilos con coma ("0,350") o unidades enteras.
import { useState } from 'react';
import { formatMoney, formatQuantity, lineSubtotal } from '@kiosco/shared';
import { FormDialog } from '../FormDialog';
import { TextField } from '../TextField';
import { toApiNumber, toInputText } from '../../lib/catalog/decimalInput';
import { checkQuantity } from '../../lib/catalog/validation';
import type { SaleUnit } from '../../lib/sales/types';

interface QuantityDialogProps {
  productName: string;
  unit: SaleUnit;
  unitPrice: string;
  /** Cantidad actual (al editar una línea) o vacío (al agregar un producto por peso). */
  initial?: string;
  onSubmit: (quantity: string) => void;
  onCancel: () => void;
}

export function QuantityDialog({
  productName,
  unit,
  unitPrice,
  initial = '',
  onSubmit,
  onCancel,
}: QuantityDialogProps) {
  const [text, setText] = useState(toInputText(initial));
  const [error, setError] = useState<string | undefined>();
  const isKg = unit === 'KG';

  const check = checkQuantity(text, unit, isKg ? 'Los kilos' : 'La cantidad');
  const preview =
    check.value && !check.error && check.value.gt(0)
      ? formatMoney(lineSubtotal(toApiNumber(check.value), unitPrice))
      : null;

  function submit() {
    if (check.error) return setError(check.error);
    if (check.value === null || !check.value.gt(0))
      return setError(
        isKg ? 'Escribí cuántos kilos son. Por ejemplo: 0,350' : 'Escribí la cantidad.',
      );
    onSubmit(toApiNumber(check.value));
  }

  return (
    <FormDialog
      title={isKg ? 'Cuántos kilos' : 'Cantidad'}
      submitLabel="Aceptar"
      onSubmit={submit}
      onCancel={onCancel}
    >
      <p className="dialog__lead">
        {productName} · {formatMoney(unitPrice)}
        {isKg ? ' el kilo' : ''}
      </p>
      <TextField
        label={isKg ? 'Kilos' : 'Unidades'}
        hint={isKg ? 'Escribilos con coma: 0,350' : undefined}
        inputMode="decimal"
        autoComplete="off"
        data-autofocus
        value={text}
        error={error}
        onChange={(e) => {
          setText(e.target.value);
          setError(undefined);
        }}
        onFocus={(e) => e.currentTarget.select()}
      />
      {preview && (
        <p className="dialog__preview">
          {formatQuantity(check.value ?? '0', unit)} = <strong>{preview}</strong>
        </p>
      )}
    </FormDialog>
  );
}
