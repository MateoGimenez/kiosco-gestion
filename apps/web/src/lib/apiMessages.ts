// Textos claros para los errores de la API que pueden aparecer en varias pantallas.
import { ApiError } from './api';

const MESSAGES_BY_CODE: Record<string, string> = {
  // H-19
  LAST_ACTIVE_OWNER:
    'Tiene que quedar al menos un dueño activo. Antes, dejá a otra persona como dueño.',
  // H-20
  LOCAL_ONLY:
    'Esto solo se puede hacer desde el local. Conectate al WiFi del local y probá de nuevo.',
};

/** Mensaje para mostrar: el nuestro si el `code` es conocido; si no, el que mandó la API. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES_BY_CODE[error.code] ?? error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en un momento.';
}
