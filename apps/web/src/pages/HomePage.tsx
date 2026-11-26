// Página de inicio provisoria: comprueba que la web y la API se hablan (GET /api/health).
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { ROLE_LABELS } from '../lib/roles';

interface HealthResponse {
  status: string;
}

export function HomePage() {
  const { state } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  // Aviso que deja la pantalla anterior (por ejemplo, cambio de rol); se lee una sola vez.
  const [notice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);
  const user = state.status === 'authenticated' ? state.session.user : null;
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => api.get<HealthResponse>('/api/health', signal),
  });

  return (
    <div className="page">
      <div>
        <h1>{user ? `Hola, ${user.fullName}` : 'Bienvenido al sistema del kiosco'}</h1>
        {user && <p className="page__sub">Entraste como {ROLE_LABELS[user.role].toLowerCase()}.</p>}
      </div>
      {notice && <Notice variant="info">{notice}</Notice>}
      <div>
        <Link className="btn btn--primary btn--large" to="/vender">
          Ir a vender
        </Link>
      </div>
      <section className="panel" aria-labelledby="health-title">
        <h2 id="health-title">Estado del sistema</h2>
        {health.isPending && <LoadingState label="Comprobando conexión…" />}
        {health.isError && (
          <ErrorMessage
            title="No se pudo comprobar el sistema"
            error={health.error}
            onRetry={() => void health.refetch()}
          />
        )}
        {health.isSuccess && (
          <p>
            <span className="status status--ok">Funcionando</span>
          </p>
        )}
      </section>
    </div>
  );
}
