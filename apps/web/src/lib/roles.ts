import { USER_ROLES, type UserRole } from '@kiosco/shared';

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Encargado',
  EMPLOYEE: 'Empleado',
};

export const ROLE_OPTIONS = USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));

/** Cuántos permisos tiene cada rol (mayor = más). Sirve para saber si un cambio "sube" de rol. */
export const ROLE_RANK: Record<UserRole, number> = { EMPLOYEE: 1, MANAGER: 2, OWNER: 3 };
