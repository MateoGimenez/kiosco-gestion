// Rol de quien está usando el sistema. Solo para mostrar u ocultar acciones: el servidor valida igual.
import type { UserRole } from '@kiosco/shared';
import { useAuth } from './auth-context';

export function useRole(): UserRole | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.session.user.role : null;
}

/** Encargado o dueño. */
export function isManagerOrOwner(role: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}
