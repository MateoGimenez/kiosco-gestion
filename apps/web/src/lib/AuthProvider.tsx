// Dueño del estado de sesión. Al abrir la app pregunta a /api/auth/me.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { SessionResponse } from '@kiosco/shared';
import { api, ApiError } from './api';
import { AuthContext, type AuthContextValue, type AuthState } from './auth-context';
import { subscribeUnauthorized } from './authEvents';

const EXPIRED_NOTICE = 'Tu sesión terminó. Entrá de nuevo.';

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
    await api.post<void>('/api/auth/logout');
    // "Cambiar usuario": el que entra después no tiene que ver nada del anterior.
    queryClient.clear();
    setState({ status: 'anonymous' });
  }, [queryClient]);

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
    () => ({ state, login, logout, reload, endSession }),
    [state, login, logout, reload, endSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
