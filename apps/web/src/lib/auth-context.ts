// Contexto de sesión: quién está adentro y cómo entrar y salir.
import { createContext, useContext } from 'react';
import type { SessionResponse } from '@kiosco/shared';

export type AuthState =
  | { status: 'loading' }
  /** Sin sesión. `notice` explica por qué se volvió al login (por ejemplo, sesión vencida). */
  | { status: 'anonymous'; notice?: string }
  | { status: 'authenticated'; session: SessionResponse }
  /** No se pudo saber si hay sesión (por ejemplo, sin conexión con el sistema). */
  | { status: 'error'; error: unknown };

export interface AuthContextValue {
  state: AuthState;
  /** Entra con usuario y contraseña. Lanza ApiError si falla. */
  login: (username: string, password: string) => Promise<void>;
  /**
   * Cierra la sesión, vacía la caché y vuelve al login. No lanza: si el servidor no responde,
   * igual se sale de la pantalla (ver AuthProvider).
   */
  logout: () => Promise<void>;
  /** Vuelve a pedir la sesión al servidor sin mostrar la pantalla de carga (rol o nombre cambiados). Devuelve `false` si no se pudo (por ejemplo, sin conexión). */
  refreshSession: () => Promise<boolean>;
  /** Vuelve a preguntar quién es el usuario (botón "Reintentar" de la pantalla de carga). */
  reload: () => void;
  /** Termina la sesión solo en esta pantalla (el servidor ya la cortó). */
  endSession: (notice?: string) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth se usa dentro de AuthProvider');
  return value;
}
