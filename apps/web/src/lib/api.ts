// Cliente HTTP mínimo. Mismo origen (en desarrollo, Vite reenvía /api a la API).
// La sesión viaja en una cookie httpOnly: acá nunca se toca ni se guarda ningún token.
import type { ApiErrorBody } from '@kiosco/shared';
import { emitPasswordChangeRequired, emitUnauthorized } from './authEvents';

/** Error de la API ya interpretado. La pantalla decide por `code`, nunca por `message`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

const NETWORK_ERROR_MESSAGE =
  'No se pudo conectar con el sistema. Revisá que la computadora del kiosco esté prendida y que estés en la red del local.';
const UNKNOWN_ERROR_MESSAGE = 'Ocurrió un error inesperado. Probá de nuevo en un momento.';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const error = (value as { error: unknown }).error;
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  );
}

export interface RequestOptions {
  method?: string;
  /** Cuerpo del pedido; se envía como JSON (o como multipart si es un `FormData`). */
  body?: unknown;
  signal?: AbortSignal;
}

/** Hace un pedido a la API y devuelve el JSON (o undefined si responde 204). */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, headers, credentials: 'same-origin' };
  if (options.signal) init.signal = options.signal;

  // Los pedidos que cambian datos llevan siempre estos dos encabezados (ADR 003).
  if (MUTATING_METHODS.has(method)) {
    headers['X-Kiosco'] = '1';
    if (options.body instanceof FormData) {
      // Subida de archivos: el navegador arma solo el Content-Type con el boundary (no se fija a mano).
      init.body = options.body;
    } else {
      headers['Content-Type'] = 'application/json';
      if (options.body !== undefined) init.body = JSON.stringify(options.body);
    }
  }

  let response: Response;
  try {
    response = await fetch(path, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR_MESSAGE);
  }

  if (response.status === 204) return undefined as T;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  if (!response.ok) {
    if (isApiErrorBody(data)) {
      const { code, message, details } = data.error;
      // Sesión vencida o cortada: la app vuelve al login (en cualquier pedido).
      if (response.status === 401 && code === 'UNAUTHENTICATED') emitUnauthorized();
      // La persona tiene que elegir una contraseña nueva antes de seguir (H-21).
      if (response.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
        emitPasswordChangeRequired();
      }
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, 'UNKNOWN_ERROR', UNKNOWN_ERROR_MESSAGE);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => apiRequest<T>(path, signal ? { signal } : {}),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  /** Subida de un archivo (multipart/form-data). */
  upload: <T>(path: string, body: FormData) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),
};
