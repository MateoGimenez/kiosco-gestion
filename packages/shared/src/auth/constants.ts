// Constantes de contraseñas y sesión. Fáciles de cambiar.

/**
 * Largo mínimo de la contraseña, en caracteres (H-22, resuelto por el dueño el 2026-11-24: 8).
 * Vale al crear, resetear, cambiar la propia y en `owner:reset`. Para cambiarlo, se modifica solo este valor.
 */
export const PASSWORD_MIN_LENGTH = 8;

/** Límite de bcrypt: solo lee los primeros 72 bytes, por eso se rechaza lo que pase de eso. */
export const PASSWORD_MAX_BYTES = 72;

export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
