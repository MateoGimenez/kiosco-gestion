// Códigos de error de la API (docs/api/README.md, punto 4).
// El frontend decide por `code`, nunca por el texto del mensaje. Cada módulo agrega los suyos.
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Forma única de toda respuesta de error de la API. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
