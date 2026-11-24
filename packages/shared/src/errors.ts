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
  // Comunes del ADR 003 (puertas, CSRF, login).
  LOCAL_ONLY: 'LOCAL_ONLY',
  NETWORK_NOT_ALLOWED: 'NETWORK_NOT_ALLOWED',
  HOST_NOT_ALLOWED: 'HOST_NOT_ALLOWED',
  CSRF_CHECK_FAILED: 'CSRF_CHECK_FAILED',
  LOGIN_LOCKED: 'LOGIN_LOCKED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  /** 429: demasiados intentos de login por minuto en la puerta o desde la misma IP (local). */
  LOGIN_RATE_LIMITED: 'LOGIN_RATE_LIMITED',
  /** 503: el servidor está ocupado (cola de bcrypt llena). Reintentar en unos segundos. */
  SERVER_BUSY: 'SERVER_BUSY',
  // Usuarios.
  USERNAME_TAKEN: 'USERNAME_TAKEN',
  /** 422 (H-19): el cambio dejaría al sistema sin ningún dueño activo. */
  LAST_ACTIVE_OWNER: 'LAST_ACTIVE_OWNER',
  /** 422: el dueño no puede resetear su propia contraseña por la API (usa change-password). */
  CANNOT_RESET_OWN_PASSWORD: 'CANNOT_RESET_OWN_PASSWORD',
  /** 403 (H-21): hay que cambiar la contraseña antes de usar el resto de la API. */
  PASSWORD_CHANGE_REQUIRED: 'PASSWORD_CHANGE_REQUIRED',
  /** 422 (H-21): la contraseña actual que se mandó al cambiarla no es correcta. */
  INVALID_CURRENT_PASSWORD: 'INVALID_CURRENT_PASSWORD',
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
