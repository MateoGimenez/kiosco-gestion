// Dueño del estado de sesión. Al abrir la app pregunta a /api/auth/me.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionResponse } from '@kiosco/shared';
import { api, ApiError } from './api';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';
import { subscribePasswordChangeRequired, subscribeUnauthorized } from './authEvents';

const EXPIRED_NOTICE = 'Tu sesión terminó. Entrá de nuevo.';
const LOGOUT_FAILED_NOTICE =
  'Saliste de esta pantalla, pero no hubo conexión con el sistema y la sesión pudo quedar abierta. Cuando vuelva la conexión, entrá y salí de nuevo.';

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  // Al abrir (o al reintentar): ¿hay una sesión válida?
  useEffect(() => {
    const controller = new AbortController();
    api
      .get<SessionResponse>('/api/auth/me', controller.signal)
      .then((session) => setState({ status: 'authenticated', session }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.status === 401) {
          setState((prev) => (prev.status === 'anonymous' ? prev : { status: 'anonymous' }));
        } else {
          setState({ status: 'error', error });
        }
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Cualquier 401 de la API: se descarta todo lo cargado y se vuelve al login.
  useEffect(
    () =>
      subscribeUnauthorized(() => {
        queryClient.clear();
        setState((prev) =>
          prev.status === 'authenticated'
            ? { status: 'anonymous', notice: EXPIRED_NOTICE }
            : prev.status === 'anonymous'
              ? prev
              : { status: 'anonymous' },
        );
      }),
    [queryClient],
  );

  // 403 PASSWORD_CHANGE_REQUIRED en cualquier pedido: se marca la sesión y la app lleva a cambiarla.
  useEffect(
    () =>
      subscribePasswordChangeRequired(() => {
        setState((prev) =>
          prev.status === 'authenticated' && !prev.session.user.mustChangePassword
            ? {
                status: 'authenticated',
                session: {
                  ...prev.session,
                  user: { ...prev.session.user, mustChangePassword: true },
                },
              }
            : prev,
        );
      }),
    [],
  );

  const login = useCallback(
    async (username: string, password: string) => {
      const session = await api.post<SessionResponse>('/api/auth/login', { username, password });
      // Lo que quedara de una sesión anterior no se mezcla con la nueva.
      queryClient.clear();
      setState({ status: 'authenticated', session });
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    // Decisión (mostrador compartido): la pantalla se limpia SIEMPRE, aunque el POST falle.
    // Dejar la sesión abierta por un error de red es lo peor: el que llega después vería los
    // datos y los permisos del usuario anterior. En cambio, volver al login sin cerrar en el
    // servidor solo deja una sesión huérfana, que el servidor vence o revoca por su cuenta.
    // Por eso se avisa en el login que el cierre pudo no completarse.
    let notice: string | undefined;
    try {
      await api.post<void>('/api/auth/logout');
    } catch (error) {
      // Un 401 significa que la sesión ya no existía: está cerrada, no hay nada que avisar.
      if (!(error instanceof ApiError && error.status === 401)) notice = LOGOUT_FAILED_NOTICE;
    }
    queryClient.clear();
    setState(notice ? { status: 'anonymous', notice } : { status: 'anonymous' });
  }, [queryClient]);

  const refreshSession = useCallback(async () => {
    try {
      const session = await api.get<SessionResponse>('/api/auth/me');
      setState({ status: 'authenticated', session });
      return true;
    } catch {
      // Un 401 ya lo maneja el aviso global; otros errores: se conserva la sesión que había.
      return false;
    }
  }, []);

  const reload = useCallback(() => {
    setState({ status: 'loading' });
    setReloadKey((n) => n + 1);
  }, []);

  const endSession = useCallback(
    (notice?: string) => {
      queryClient.clear();
      setState(notice ? { status: 'anonymous', notice } : { status: 'anonymous' });
    },
    [queryClient],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, logout, refreshSession, reload, endSession }),
    [state, login, logout, refreshSession, reload, endSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
