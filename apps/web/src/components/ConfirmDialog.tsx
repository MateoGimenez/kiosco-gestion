import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';
import { ErrorMessage } from './ErrorMessage';

interface ConfirmDialogProps {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** Texto del botón que cierra sin hacer nada (por defecto, "Cancelar"). */
  cancelLabel?: string;
  /** Acción que no se puede deshacer fácil: el botón se pinta de rojo. */
  danger?: boolean;
  busy?: boolean;
  /** Error al confirmar: el diálogo queda abierto y lo muestra. */
  error?: unknown;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación antes de una acción delicada. Se monta solo cuando hace falta y se abre como
 * modal nativo (el foco queda adentro y Escape cancela). El foco arranca en "Cancelar".
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  danger = false,
  busy = false,
  error,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id={titleId} className="dialog__title">
        {title}
      </h2>
      <div id={bodyId} className="dialog__body">
        {children}
      </div>
      {error !== undefined && error !== null && <ErrorMessage error={error} />}
      <div className="dialog__actions">
        <Button variant="secondary" onClick={onCancel} disabled={busy} autoFocus>
          {cancelLabel}
        </Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
