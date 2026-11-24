import { friendlyMessage } from '../lib/apiMessages';
import { Button } from './Button';

interface ErrorMessageProps {
  /** Título corto; por defecto, uno genérico. */
  title?: string;
  /** El error recibido: si es de la API, se muestra su mensaje en español. */
  error?: unknown;
  /** Texto propio (reemplaza al del error). Con "" no se muestra el detalle. */
  message?: string;
  /** Si se pasa, aparece el botón "Reintentar". */
  onRetry?: () => void;
}

export function ErrorMessage({
  title = 'No se pudo completar la acción',
  error,
  message,
  onRetry,
}: ErrorMessageProps) {
  return (
    <div className="error-message" role="alert">
      <p className="error-message__title">{title}</p>
      {message !== '' && <p>{message ?? friendlyMessage(error)}</p>}
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}
