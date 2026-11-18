// Lista de usuarios (solo dueño): crear, editar, desactivar y reactivar.
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { User, UserListResponse } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDateTime } from '../lib/format';
import { ROLE_LABELS } from '../lib/roles';

export function UsersPage() {
  const { state, endSession } = useAuth();
  const session = state.status === 'authenticated' ? state.session : null;
  const isRemote = session?.access === 'REMOTE';
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Aviso que deja la pantalla anterior (por ejemplo, "Usuario creado"); se lee una sola vez.
  const [notice, setNotice] = useState<string | null>(
    () => (location.state as { notice?: string } | null)?.notice ?? null,
  );
  useEffect(() => {
    if ((location.state as { notice?: string } | null)?.notice) {
      void navigate('.', { replace: true, state: null });
    }
  }, [location.state, navigate]);

  const users = useQuery({
    queryKey: ['users'],
    queryFn: ({ signal }) => api.get<UserListResponse>('/api/users', signal),
  });

  const [toDeactivate, setToDeactivate] = useState<User | null>(null);
  const setActive = useMutation({
    mutationFn: ({ user, isActive }: { user: User; isActive: boolean }) =>
      api.patch<User>(`/api/users/${user.id}`, { isActive }),
    onSuccess: async (updated, { isActive }) => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setToDeactivate(null);
      if (updated.id === session?.user.id && !isActive) {
        endSession('Desactivaste tu propio usuario. Entrá con otro.');
        return;
      }
      setNotice(
        isActive ? `Se reactivó a ${updated.fullName}.` : `Se desactivó a ${updated.fullName}.`,
      );
    },
  });

  return (
    <div className="page">
      <div className="page__header">
        <h1>Usuarios</h1>
        <div className="page__actions">
          {isRemote ? (
            <>
              <Button disabled aria-describedby="create-remote-note">
                Nuevo usuario
              </Button>
              <p className="page__note" id="create-remote-note">
                Solo desde el local.
              </p>
            </>
          ) : (
            <Link to="/usuarios/nuevo" className="btn btn--primary">
              Nuevo usuario
            </Link>
          )}
        </div>
      </div>

      {notice && <Notice variant="success">{notice}</Notice>}
      {setActive.isError && !toDeactivate && (
        <ErrorMessage title="No se pudo cambiar el estado" error={setActive.error} />
      )}

      {users.isPending && <LoadingState label="Cargando usuarios…" />}
      {users.isError && (
        <ErrorMessage
          title="No se pudo cargar la lista de usuarios"
          error={users.error}
          onRetry={() => void users.refetch()}
        />
      )}
      {users.isSuccess && users.data.items.length === 0 && (
        <div className="empty">
          <p className="empty__title">Todavía no hay usuarios cargados.</p>
          {!isRemote && <p>Creá el primero con el botón "Nuevo usuario".</p>}
        </div>
      )}
      {users.isSuccess && users.data.items.length > 0 && (
        <ul className="user-list">
          {users.data.items.map((user) => (
            <li key={user.id} className={`user-row${user.isActive ? '' : ' user-row--inactive'}`}>
              <div className="user-row__who">
                <span className="user-row__name">
                  {user.fullName}
                  {user.id === session?.user.id && <span className="user-row__you"> (vos)</span>}
                </span>
                <span className="user-row__username">{user.username}</span>
              </div>
              <div className="user-row__meta">
                <span>{ROLE_LABELS[user.role]}</span>
                <span className={`status ${user.isActive ? 'status--ok' : 'status--off'}`}>
                  {user.isActive ? 'Activo' : 'Desactivado'}
                </span>
              </div>
              <div className="user-row__last">
                {user.lastLoginAt
                  ? `Último ingreso: ${formatDateTime(user.lastLoginAt)}`
                  : 'Todavía no entró'}
              </div>
              <div className="user-row__actions">
                <Link
                  to={`/usuarios/${user.id}`}
                  className="btn btn--secondary"
                  aria-label={`Editar a ${user.fullName}`}
                >
                  Editar
                </Link>
                {user.isActive ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActive.reset();
                      setToDeactivate(user);
                    }}
                    aria-label={`Desactivar a ${user.fullName}`}
                  >
                    Desactivar
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    loading={setActive.isPending && setActive.variables.user.id === user.id}
                    onClick={() => setActive.mutate({ user, isActive: true })}
                    aria-label={`Reactivar a ${user.fullName}`}
                  >
                    Reactivar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDeactivate && (
        <ConfirmDialog
          title={`¿Desactivar a ${toDeactivate.fullName}?`}
          confirmLabel="Desactivar"
          danger
          busy={setActive.isPending}
          error={setActive.isError ? setActive.error : undefined}
          onCancel={() => setToDeactivate(null)}
          onConfirm={() => setActive.mutate({ user: toDeactivate, isActive: false })}
        >
          <p>
            No va a poder entrar y se le cierran todas las sesiones abiertas. Sus ventas y
            movimientos se conservan. Lo podés reactivar cuando quieras.
          </p>
          {toDeactivate.id === session?.user.id && (
            <p>
              <strong>Es tu propio usuario:</strong> se te cierra la sesión ahora mismo.
            </p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
