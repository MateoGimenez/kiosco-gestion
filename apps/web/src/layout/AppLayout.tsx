import { useState } from 'react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { useAuth } from '../lib/auth-context';
import { ROLE_LABELS } from '../lib/roles';
import { NAV_ITEMS, visibleNavItems } from './navigation';

export function AppLayout() {
  const { state, logout } = useAuth();
  const session = state.status === 'authenticated' ? state.session : null;
  const [switching, setSwitching] = useState(false);

  const items = visibleNavItems(NAV_ITEMS, session?.user.role ?? null);

  // "Cambiar usuario": cierra la sesión, vacía la caché y vuelve al login (lo hace el AuthProvider).
  async function switchUser() {
    setSwitching(true);
    await logout();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          <NavLink to="/" className="brand">
            Kiosco
          </NavLink>
          <nav className="nav" aria-label="Principal">
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav__link">
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="userbox">
            {session && (
              <span className="userbox__name">
                {session.user.fullName}
                <span className="userbox__role">{ROLE_LABELS[session.user.role]}</span>
              </span>
            )}
            <Button variant="secondary" onClick={() => void switchUser()} loading={switching}>
              Cambiar usuario
            </Button>
          </div>
        </div>
        {session?.access === 'REMOTE' && (
          <div className="topbar__banner">
            <Notice variant="warning">
              Estás entrando desde afuera del local. Desde acá no se puede vender ni manejar la
              caja.
            </Notice>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
