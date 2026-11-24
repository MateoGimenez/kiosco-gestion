// Navegación principal. Cada opción dice qué roles la ven; si no tiene `roles`, la ven todos.
// Es solo comodidad visual: los permisos reales los valida siempre el backend.
import type { UserRole } from '@kiosco/shared';

export interface NavItem {
  to: string;
  label: string;
  roles?: readonly UserRole[];
}

// Las opciones de cada módulo se suman acá a medida que existan sus pantallas.
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Inicio' },
  { to: '/usuarios', label: 'Usuarios', roles: ['OWNER'] },
];

export function visibleNavItems(items: readonly NavItem[], role: UserRole | null): NavItem[] {
  return items.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}
