// Crear y editar usuarios (solo dueño). Crear y resetear contraseña solo desde el local.
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateUserRequestSchema,
  PASSWORD_MIN_LENGTH,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  UserIdParamSchema,
  type User,
  type UserRole,
} from '@kiosco/shared';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { PasswordField } from '../components/PasswordField';
import { SelectField } from '../components/SelectField';
import { TextField } from '../components/TextField';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { issuesToFieldErrors, serverErrorToFields, type FieldErrors } from '../lib/formErrors';
import { ROLE_OPTIONS } from '../lib/roles';
import { NotFoundPage } from './NotFoundPage';

const FIELDS = ['username', 'fullName', 'role', 'password'] as const;
type Field = (typeof FIELDS)[number];
const FIELD_OVERRIDES: Partial<Record<Field, string>> = { role: 'Elegí un rol.' };

function BackLink() {
  return (
    <Link to="/usuarios" className="back-link">
      ← Volver a usuarios
    </Link>
  );
}

export function UserFormPage() {
  const { id } = useParams();
  const { state } = useAuth();
  const isRemote = state.status === 'authenticated' && state.session.access === 'REMOTE';

  if (id === undefined) {
    // Crear: el servidor lo bloquea por la puerta remota; acá se explica en vez de mostrar un formulario inútil.
    if (isRemote) {
      return (
        <div className="page">
          <BackLink />
          <h1>Nuevo usuario</h1>
          <Notice variant="warning">Los usuarios se crean solo desde el local.</Notice>
        </div>
      );
    }
    return <UserForm />;
  }
  const parsedId = UserIdParamSchema.safeParse({ id });
  if (!parsedId.success) return <NotFoundPage />;
  return <EditUser userId={parsedId.data.id} />;
}

function EditUser({ userId }: { userId: number }) {
  const user = useQuery({
    queryKey: ['users', userId],
    queryFn: ({ signal }) => api.get<User>(`/api/users/${userId}`, signal),
  });
  if (user.isPending) {
    return (
      <div className="page">
        <BackLink />
        <LoadingState label="Cargando usuario…" />
      </div>
    );
  }
  if (user.isError) {
    if (user.error instanceof ApiError && user.error.status === 404) return <NotFoundPage />;
    return (
      <div className="page">
        <BackLink />
        <ErrorMessage
          title="No se pudo cargar el usuario"
          error={user.error}
          onRetry={() => void user.refetch()}
        />
      </div>
    );
  }
  return <UserForm user={user.data} />;
}

function UserForm({ user }: { user?: User }) {
  const isEdit = user !== undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [values, setValues] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    role: (user?.role ?? '') as UserRole | '',
    password: '',
  });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);
  const fullNameRef = useRef<HTMLInputElement>(null);
  const roleRef = useRef<HTMLSelectElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function set<K extends Field>(key: K, value: (typeof values)[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Al corregir un campo, su error deja de mostrarse.
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setSaved(false);
  }

  function showErrors(fields: FieldErrors<Field>, form?: string) {
    setErrors(fields);
    setFormError(form ?? null);
    const first = FIELDS.find((f) => fields[f]);
    if (first === 'username') usernameRef.current?.focus();
    else if (first === 'fullName') fullNameRef.current?.focus();
    else if (first === 'role') roleRef.current?.focus();
    else if (first === 'password') passwordRef.current?.focus();
  }

  const save = useMutation({
    mutationFn: (body: object) =>
      isEdit ? api.patch<User>(`/api/users/${user.id}`, body) : api.post<User>('/api/users', body),
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    let body: object;
    if (isEdit) {
      // Solo se manda lo que cambió.
      const patch: { fullName?: string; role?: UserRole } = {};
      if (values.fullName.trim() !== user.fullName) patch.fullName = values.fullName;
      if (values.role !== user.role && values.role !== '') patch.role = values.role;
      if (values.role === '') return showErrors({ role: 'Elegí un rol.' });
      if (Object.keys(patch).length === 0) {
        setErrors({});
        setSaved(true);
        return;
      }
      const parsed = UpdateUserRequestSchema.safeParse(patch);
      if (!parsed.success) {
        const { fields, other } = issuesToFieldErrors(parsed.error.issues, FIELDS, FIELD_OVERRIDES);
        return showErrors(fields, other);
      }
      body = parsed.data;
    } else {
      const parsed = CreateUserRequestSchema.safeParse(values);
      if (!parsed.success) {
        const { fields, other } = issuesToFieldErrors(parsed.error.issues, FIELDS, FIELD_OVERRIDES);
        return showErrors(fields, other);
      }
      body = parsed.data;
    }

    try {
      const result = await save.mutateAsync(body);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      if (isEdit) {
        setErrors({});
        setSaved(true);
      } else {
        void navigate('/usuarios', {
          state: {
            notice: `Se creó el usuario ${result.fullName}. Pasale su contraseña en persona.`,
          },
        });
      }
    } catch (error) {
      const mapped = serverErrorToFields(error, FIELDS);
      showErrors(mapped.fields, mapped.form);
    }
  }

  return (
    <div className="page">
      <BackLink />
      <h1>{isEdit ? `Editar a ${user.fullName}` : 'Nuevo usuario'}</h1>

      <form className="panel form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {formError && <ErrorMessage title="No se pudo guardar" message={formError} />}
        {isEdit ? (
          <TextField label="Usuario" value={user.username} disabled readOnly />
        ) : (
          <TextField
            ref={usernameRef}
            label="Usuario"
            hint="De 3 a 30 letras sin acento, números, punto, guion o guion bajo."
            value={values.username}
            onChange={(e) => set('username', e.target.value)}
            error={errors.username}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        )}
        <TextField
          ref={fullNameRef}
          label="Nombre"
          value={values.fullName}
          onChange={(e) => set('fullName', e.target.value)}
          error={errors.fullName}
          autoComplete="off"
        />
        <SelectField
          ref={roleRef}
          label="Rol"
          placeholder="Elegí un rol"
          options={ROLE_OPTIONS}
          value={values.role}
          onChange={(e) => set('role', e.target.value as UserRole | '')}
          error={errors.role}
        />
        {!isEdit && (
          <PasswordField
            ref={passwordRef}
            label="Contraseña inicial"
            hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Pasásela a la persona en persona.`}
            value={values.password}
            onChange={(e) => set('password', e.target.value)}
            error={errors.password}
            autoComplete="new-password"
          />
        )}
        {saved && <Notice variant="success">Los cambios se guardaron.</Notice>}
        <div className="form__actions">
          <Button type="submit" large loading={save.isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear usuario'}
          </Button>
          <Link to="/usuarios" className="btn btn--secondary btn--large">
            {isEdit ? 'Volver' : 'Cancelar'}
          </Link>
        </div>
      </form>

      {isEdit && <ResetPasswordSection user={user} />}
    </div>
  );
}

function ResetPasswordSection({ user }: { user: User }) {
  const { state, endSession } = useAuth();
  const session = state.status === 'authenticated' ? state.session : null;
  const isRemote = session?.access === 'REMOTE';
  const isSelf = session?.user.id === user.id;
  const queryClient = useQueryClient();

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useMutation({
    mutationFn: (newPassword: string) =>
      api.post<User>(`/api/users/${user.id}/reset-password`, { newPassword }),
    onSuccess: async () => {
      setConfirming(false);
      setPassword('');
      if (isSelf) {
        // El servidor cortó todas sus sesiones, incluida esta.
        endSession('Cambiaste tu contraseña. Entrá de nuevo con la nueva.');
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      setDone(true);
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setDone(false);
    const parsed = ResetPasswordRequestSchema.safeParse({ newPassword: password });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(
        issue?.code === 'too_big' ? 'Es demasiado larga.' : (issue?.message ?? 'Revisá este dato.'),
      );
      inputRef.current?.focus();
      return;
    }
    setError(undefined);
    reset.reset();
    setConfirming(true);
  }

  return (
    <section className="panel" aria-labelledby="reset-title">
      <h2 id="reset-title">Resetear contraseña</h2>
      {isRemote ? (
        <Notice variant="warning">La contraseña se resetea solo desde el local.</Notice>
      ) : (
        <form className="form" onSubmit={handleSubmit} noValidate>
          <PasswordField
            ref={inputRef}
            label="Contraseña nueva"
            hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres.`}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setDone(false);
            }}
            error={error}
            autoComplete="new-password"
          />
          {done && (
            <Notice variant="success">Se cambió la contraseña. Pasásela a la persona.</Notice>
          )}
          <div className="form__actions">
            <Button type="submit" variant="secondary">
              Resetear contraseña
            </Button>
          </div>
        </form>
      )}

      {confirming && (
        <ConfirmDialog
          title={`¿Resetear la contraseña de ${user.fullName}?`}
          confirmLabel="Resetear contraseña"
          danger
          busy={reset.isPending}
          error={reset.isError ? reset.error : undefined}
          onCancel={() => setConfirming(false)}
          onConfirm={() => reset.mutate(password)}
        >
          <p>
            Se le cierran todas las sesiones abiertas (por ejemplo, la del celular) y tiene que
            entrar con la contraseña nueva.
          </p>
          {isSelf && (
            <p>
              <strong>Es tu propio usuario:</strong> se te cierra la sesión y vas a tener que entrar
              de nuevo.
            </p>
          )}
        </ConfirmDialog>
      )}
    </section>
  );
}
