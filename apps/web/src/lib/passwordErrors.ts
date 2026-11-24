// Textos del cambio de contraseña según el `code` de la API.
import { ApiError } from './api';

export interface PasswordErrorContent {
  /** Si viene, va debajo del campo "Contraseña actual". */
  currentPasswordError?: string;
  /** Si viene, va arriba del formulario como error general. */
  form?: { title: string; body: string };
}

export function passwordErrorContent(error: unknown): PasswordErrorContent {
  if (!(error instanceof ApiError)) {
    return {
      form: {
        title: 'No se pudo cambiar la contraseña',
        body: 'Ocurrió un error inesperado. Probá de nuevo en un momento.',
      },
    };
  }
  switch (error.code) {
    case 'INVALID_CURRENT_PASSWORD': {
      const left = error.details?.remainingAttempts;
      let text = 'La contraseña actual no es correcta.';
      if (typeof left === 'number' && left >= 1) {
        text +=
          left === 1
            ? ' Te queda 1 intento antes de que se bloquee.'
            : ` Te quedan ${left} intentos antes de que se bloquee.`;
      }
      return { currentPasswordError: text };
    }
    case 'LOGIN_LOCKED': {
      const seconds = error.details?.retryAfterSeconds;
      let body = 'Esperá unos minutos y probá de nuevo.';
      if (typeof seconds === 'number' && seconds > 0) {
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        body = `Probá de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
      }
      return { form: { title: 'Demasiados intentos: el cambio está bloqueado', body } };
    }
    case 'LOGIN_RATE_LIMITED':
      return {
        form: {
          title: 'Demasiados intentos seguidos',
          body: 'Esperá un momento y probá de nuevo.',
        },
      };
    default:
      return { form: { title: 'No se pudo cambiar la contraseña', body: error.message } };
  }
}
