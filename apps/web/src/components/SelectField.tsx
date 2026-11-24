import { useId, type ComponentProps } from 'react';

export interface SelectFieldProps extends Omit<ComponentProps<'select'>, 'id' | 'children'> {
  label: string;
  options: readonly { value: string; label: string; disabled?: boolean }[];
  /** Texto de la opción vacía (obliga a elegir a propósito). */
  placeholder?: string;
  error?: string | undefined;
  hint?: string;
}

export function SelectField({
  label,
  options,
  placeholder,
  error,
  hint,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      <select
        {...rest}
        id={id}
        className="field__input field__select"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
