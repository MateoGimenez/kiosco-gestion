import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { Notice } from '../components/Notice';
import { useAuth } from '../lib/auth-context';
import { ROLE_LABELS } from '../lib/roles';
import { PASSWORD_ROUTE } from '../lib/routes';
import { UserMenu } from './UserMenu';
import { NAV_ITEMS, visibleNavItems } from './navigation';

export function AppLayout() {
  const { state, logout } = useAuth();
  const session = state.status === 'authenticated' ? state.session : null;
  const [switching, setSwitching] = useState(false);
  const location = useLocation();
  // Con la contraseña por cambiar (H-21) no hay menú: solo se puede cambiarla o cambiar de usuario.
  const locked = session?.user.mustChangePassword === true;

  const items = locked ? [] : visibleNavItems(NAV_ITEMS, session?.user.role ?? null);

  // "Cambiar usuario": cierra la sesión, vacía la caché y vuelve al login (lo hace el AuthProvider).
  async function switchUser() {
    setSwitching(true);
    await logout();
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__inner">
          {locked ? (
            <span className="brand">Kiosco</span>
          ) : (
            <NavLink to="/" className="brand">
              Kiosco
            </NavLink>
          )}
          {!locked && (
            <nav className="nav" aria-label="Principal">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav__link">
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
          <div className="userbox">
            {session && locked && (
              <span className="userbox__name">
                {session.user.fullName}
                <span className="userbox__role">{ROLE_LABELS[session.user.role]}</span>
              </span>
            )}
            {session && !locked && (
              <UserMenu
                fullName={session.user.fullName}
                roleLabel={ROLE_LABELS[session.user.role]}
                from={`${location.pathname}${location.search}`}
                passwordRoute={PASSWORD_ROUTE}
              />
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
