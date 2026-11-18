import { USER_ROLES, type UserRole } from '@kiosco/shared';

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Encargado',
  EMPLOYEE: 'Empleado',
};

export const ROLE_OPTIONS = USER_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }));
