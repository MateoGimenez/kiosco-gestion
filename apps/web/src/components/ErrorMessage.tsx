import { ApiError } from '../lib/api';
import { Button } from './Button';

interface ErrorMessageProps {
  /** Título corto; por defecto, uno genérico. */
  title?: string;
  /** El error recibido: si es de la API, se muestra su mensaje en español. */
  error?: unknown;
  /** Si se pasa, aparece el botón "Reintentar". */
  onRetry?: () => void;
}

function messageFor(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en un momento.';
}

export function ErrorMessage({
  title = 'No se pudo completar la acción',
  error,
  onRetry,
}: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <p className="error-message__title">{title}</p>
      <p>{messageFor(error)}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
