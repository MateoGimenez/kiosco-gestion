// Rutas protegidas: sin sesión se va al login; mientras se averigua, se muestra la carga.
import { Navigate, Outlet, useLocation } from 'react-router';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { useAuth } from '../lib/auth-context';

export function RequireAuth() {
  const { state, reload } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') {
    return (
      <div className="fullscreen">
        <LoadingState label="Abriendo el sistema…" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="fullscreen">
        <div className="panel">
          <ErrorMessage title="No se pudo abrir el sistema" error={state.error} onRetry={reload} />
        </div>
      </div>
    );
  }
  if (state.status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

/** Pantallas que solo ve un rol. Es comodidad: el servidor igual responde 403. */
export function RequireRole({ roles }: { roles: readonly string[] }) {
  const { state } = useAuth();
  if (state.status !== 'authenticated') return null;
  if (!roles.includes(state.session.user.role)) {
    return (
      <div className="page">
        <h1>No tenés permiso para ver esta pantalla</h1>
        <p>Si la necesitás para trabajar, pedísela al dueño.</p>
        <p>
          <Button variant="secondary" onClick={() => history.back()}>
            Volver
          </Button>
        </p>
      </div>
    );
  }
  return <Outlet />;
}
