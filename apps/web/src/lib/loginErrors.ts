// Textos del login según el `code` de la API.
import { ApiError } from './api';

interface LoginErrorContent {
  title: string;
  body: string;
}

/** Texto del error según el `code` de la API (nunca según su mensaje). */
export function loginErrorContent(error: unknown): LoginErrorContent {
  if (!(error instanceof ApiError)) {
    return { title: 'No pudimos entrar', body: 'Ocurrió un error inesperado. Probá de nuevo.' };
  }
  switch (error.code) {
    case 'INVALID_CREDENTIALS': {
      const left = error.details?.remainingAttempts;
      let body = 'Revisá los datos y probá de nuevo.';
      if (typeof left === 'number' && left >= 1) {
        body =
          left === 1
            ? 'Te queda 1 intento antes de que se bloquee el acceso.'
            : `Te quedan ${left} intentos antes de que se bloquee el acceso.`;
      }
      return { title: 'Usuario o contraseña incorrectos', body };
    }
    case 'LOGIN_LOCKED': {
      const seconds = error.details?.retryAfterSeconds;
      let body = 'Esperá unos minutos y probá de nuevo.';
      if (typeof seconds === 'number' && seconds > 0) {
        const minutes = Math.max(1, Math.ceil(seconds / 60));
        body = `Probá de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;
      }
      return { title: 'Demasiados intentos: el acceso está bloqueado', body };
    }
    case 'LOGIN_RATE_LIMITED':
      return {
        title: 'Demasiados intentos seguidos',
        body: 'Esperá un momento y probá de nuevo.',
      };
    case 'LOCAL_ONLY':
      return {
        title: 'Tu usuario solo puede entrar desde el local',
        body: 'Conectate al WiFi del local y probá de nuevo.',
      };
    case 'NETWORK_ERROR':
      return { title: 'No hay conexión con el sistema', body: error.message };
    default:
      return { title: 'No pudimos entrar', body: error.message };
  }
}
