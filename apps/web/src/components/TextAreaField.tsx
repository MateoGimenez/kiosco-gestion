import { useId, type ComponentProps } from 'react';

export interface TextAreaFieldProps extends Omit<ComponentProps<'textarea'>, 'id'> {
  label: string;
  error?: string | undefined;
  hint?: string;
}

export function TextAreaField({ label, error, hint, ...rest }: TextAreaFieldProps) {
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
      <textarea
        {...rest}
        id={id}
        className="field__input field__textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
      />
      {error && (
        <span className="field__error" id={errorId} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
