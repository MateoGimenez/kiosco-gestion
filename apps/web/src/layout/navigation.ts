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
  { to: '/vender', label: 'Vender' },
  { to: '/ventas', label: 'Ventas', roles: ['OWNER', 'MANAGER'] },
  { to: '/caja', label: 'Caja', roles: ['OWNER', 'MANAGER'] },
  { to: '/', label: 'Inicio' },
  { to: '/productos', label: 'Productos' },
  { to: '/pricing', label: 'Precios', roles: ['OWNER', 'MANAGER'] },
  { to: '/categorias', label: 'Categorías', roles: ['OWNER', 'MANAGER'] },
  { to: '/reponer', label: 'Para reponer', roles: ['OWNER', 'MANAGER'] },
  { to: '/usuarios', label: 'Usuarios', roles: ['OWNER'] },
  { to: '/configuracion', label: 'Configuración', roles: ['OWNER'] },
];

export function visibleNavItems(items: readonly NavItem[], role: UserRole | null): NavItem[] {
  return items.filter((item) => !item.roles || (role !== null && item.roles.includes(role)));
}
