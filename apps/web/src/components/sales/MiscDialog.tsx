// "Varios": un producto sin código. Se escribe el precio y, si se quiere, qué es.
import { useState } from 'react';
import { FormDialog } from '../FormDialog';
import { TextField } from '../TextField';
import { toApiNumber } from '../../lib/catalog/decimalInput';
import { checkMoney } from '../../lib/catalog/validation';

interface MiscDialogProps {
  onSubmit: (unitPrice: string, description: string) => void;
  onCancel: () => void;
}

export function MiscDialog({ onSubmit, onCancel }: MiscDialogProps) {
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ price?: string; description?: string }>({});

  function submit() {
    const check = checkMoney(price, 'El precio');
    const next: typeof errors = {};
    if (check.error) next.price = check.error;
    else if (check.value === null || !check.value.gt(0))
      next.price = 'Escribí el precio. Tiene que ser mayor a $ 0.';
    if (description.trim().length > 120) next.description = 'Puede tener hasta 120 caracteres.';
    setErrors(next);
    if (Object.keys(next).length === 0 && check.value) {
      onSubmit(toApiNumber(check.value), description.trim());
    }
  }

  return (
    <FormDialog title="Varios" submitLabel="Agregar" onSubmit={submit} onCancel={onCancel}>
      <TextField
        label="Precio ($)"
        inputMode="decimal"
        autoComplete="off"
        data-autofocus
        value={price}
        error={errors.price}
        onChange={(e) => {
          setPrice(e.target.value);
          setErrors((prev) => ({ ...prev, price: undefined }));
        }}
      />
      <TextField
        label="Qué es (opcional)"
        hint="Por ejemplo: pila AA"
        autoComplete="off"
        maxLength={120}
        value={description}
        error={errors.description}
        onChange={(e) => setDescription(e.target.value)}
      />
    </FormDialog>
  );
}
