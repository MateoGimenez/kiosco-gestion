import { NavLink, Outlet } from 'react-router';
import type { UserRole } from '@kiosco/shared';
import { Button } from '../components/Button';
import { NAV_ITEMS, visibleNavItems } from './navigation';

export interface SessionUser {
  name: string;
  role: UserRole;
}

const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Dueño',
  MANAGER: 'Encargado',
  EMPLOYEE: 'Empleado',
};

interface AppLayoutProps {
  /** Usuario con sesión abierta. Todavía no hay login: llega como null. */
  user?: SessionUser | null;
  /** Acción del botón "Cambiar usuario" (se conecta cuando exista el login). */
  onSwitchUser?: () => void;
}

export function AppLayout({ user = null, onSwitchUser }: AppLayoutProps) {
  const items = visibleNavItems(NAV_ITEMS, user?.role ?? null);
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to="/" className="brand">
            Kiosco
          </NavLink>
          <nav className="nav" aria-label="Principal">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end className="nav__link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="userbox">
            {user && (
              <span className="userbox__name">
                {user.name}
                <span className="userbox__role">{ROLE_LABELS[user.role]}</span>
              </span>
            )}
            <Button variant="secondary" onClick={onSwitchUser} disabled={!onSwitchUser}>
              Cambiar usuario
            </Button>
          </div>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
