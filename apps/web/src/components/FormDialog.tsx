import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { Button } from './Button';

interface FormDialogProps {
  title: string;
  children: ReactNode;
  submitLabel: string;
  busy?: boolean;
  /** Error general del servidor (los de campo van en cada campo). */
  error?: ReactNode;
  onSubmit: () => void;
  onCancel: () => void;
}

/** Formulario corto dentro de un diálogo nativo (el foco queda adentro y Escape cancela). */
export function FormDialog({
  title,
  children,
  submitLabel,
  busy = false,
  error,
  onSubmit,
  onCancel,
}: FormDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    // showModal() elige el primer enfocable y pisa el autoFocus de React: se lleva el foco a mano.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, []);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <form className="form" onSubmit={handleSubmit} noValidate>
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        {children}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        <div className="dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" loading={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
