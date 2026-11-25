// Rol de quien está usando el sistema. Solo para mostrar u ocultar acciones: el servidor valida igual.
import type { UserRole } from '@kiosco/shared';
import { useAuth } from './auth-context';

export function useRole(): UserRole | null {
  const { state } = useAuth();
  return state.status === 'authenticated' ? state.session.user.role : null;
}

/** ¿Entró desde afuera del local? Desde ahí no se ajusta stock ni se cambia la hora de corte. */
export function useIsRemote(): boolean {
  const { state } = useAuth();
  return state.status === 'authenticated' && state.session.access === 'REMOTE';
}

/** Encargado o dueño. */
export function isManagerOrOwner(role: UserRole | null): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}
