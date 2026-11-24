// Cambiar la contraseña propia (H-21). Dos modos:
// - obligatorio: la contraseña la puso otra persona; no se puede ir a otra pantalla hasta cambiarla.
// - voluntario: la persona la cambia cuando quiere y puede cancelar.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  ChangePasswordRequestSchema,
  PASSWORD_MIN_LENGTH,
  type SessionResponse,
} from '@kiosco/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { issuesToFieldErrors, type FieldErrors } from '../lib/formErrors';
import { passwordErrorContent } from '../lib/passwordErrors';
import { PASSWORD_ROUTE } from '../lib/routes';
import { safeInternalPath } from '../lib/safeRedirect';

const FIELDS = ['currentPassword', 'newPassword', 'repeatPassword'] as const;
type Field = (typeof FIELDS)[number];

export function ChangePasswordPage() {
  const { state, refreshSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const forced = state.status === 'authenticated' && state.session.user.mustChangePassword;
  // Ruta a la que volver (la que se quiso abrir, o desde donde se eligió "Cambiar mi contraseña").
  const from = (location.state as { from?: unknown } | null)?.from;
  const backTo = safeInternalPath(from) === PASSWORD_ROUTE ? '/' : safeInternalPath(from);

  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: '',
    newPassword: '',
    repeatPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<{ title: string; body: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  // Una sola casilla para ver las tres contraseñas (así el botón queda a la vista).
  const [visible, setVisible] = useState(false);
  const type = visible ? 'text' : 'password';
  const showId = useId();

  const currentRef = useRef<HTMLInputElement>(null);
  const newRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLInputElement>(null);

  // Foco inicial en la contraseña actual.
  useEffect(() => {
    currentRef.current?.focus();
  }, []);

  function set(key: Field, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
    setDone(false);
  }

  function showErrors(fields: FieldErrors<Field>) {
    setErrors(fields);
    const first = FIELDS.find((f) => fields[f]);
    if (first === 'currentPassword') currentRef.current?.focus();
    else if (first === 'newPassword') newRef.current?.focus();
    else if (first === 'repeatPassword') repeatRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setFormError(null);
    setDone(false);

    // Mínimo y "distinta de la actual" salen del esquema de shared (H-22).
    const parsed = ChangePasswordRequestSchema.safeParse({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
    });
    const found = parsed.success
      ? { fields: {} as FieldErrors<Field> }
      : issuesToFieldErrors(parsed.error.issues, FIELDS);
    const fieldErrors: FieldErrors<Field> = { ...found.fields };
    if (!values.repeatPassword) fieldErrors.repeatPassword = 'Repetí la contraseña nueva.';
    else if (values.repeatPassword !== values.newPassword && !fieldErrors.newPassword) {
      fieldErrors.repeatPassword = 'No coincide con la contraseña nueva.';
    }
    if (!parsed.success || Object.keys(fieldErrors).length > 0) return showErrors(fieldErrors);

    setSubmitting(true);
    try {
      await api.post<SessionResponse>('/api/auth/change-password', parsed.data);
    } catch (caught) {
      const content = passwordErrorContent(caught);
      if (content.currentPasswordError) {
        showErrors({ currentPassword: content.currentPasswordError });
        setValues((prev) => ({ ...prev, currentPassword: '' }));
      } else {
        setFormError(content.form ?? null);
      }
      setSubmitting(false);
      return;
    }
    setValues({ currentPassword: '', newPassword: '', repeatPassword: '' });
    await finish();
  }

  // Se vuelve a pedir la sesión (ya sin la obligación) y se sigue por donde iba.
  // Si falla (sin conexión), la contraseña ya cambió en el servidor: no se vuelve a pedir nada,
  // solo se ofrece reintentar la actualización de la sesión.
  async function finish() {
    setSubmitting(true);
    const ok = await refreshSession();
    setSubmitting(false);
    if (!ok) return setPendingRefresh(true);
    setPendingRefresh(false);
    if (forced) void navigate(backTo, { replace: true });
    else setDone(true);
  }

  return (
    <div className="page">
      <div>
        <h1>{forced ? 'Elegí tu nueva contraseña' : 'Cambiar mi contraseña'}</h1>
        <p className="page__sub">
          {forced
            ? 'Tu contraseña la puso otra persona. Elegí una que solo sepas vos.'
            : 'Al cambiarla, se cierran tus sesiones abiertas en otros dispositivos.'}
        </p>
      </div>

      {pendingRefresh && (
        <div className="panel">
          <ErrorMessage
            title="La contraseña se cambió, pero no pudimos actualizar la sesión"
            message="Revisá la conexión y reintentá. No hace falta volver a escribir la contraseña."
          />
          <div className="form__actions">
            <Button large loading={submitting} onClick={() => void finish()}>
              Reintentar
            </Button>
          </div>
        </div>
      )}
      <form
        hidden={pendingRefresh}
        className="panel form"
        onSubmit={(event) => void handleSubmit(event)}
        noValidate
      >
        {formError && <ErrorMessage title={formError.title} message={formError.body} />}
        <TextField
          type={type}
          ref={currentRef}
          label="Contraseña actual"
          value={values.currentPassword}
          onChange={(e) => set('currentPassword', e.target.value)}
          error={errors.currentPassword}
          autoComplete="current-password"
        />
        <TextField
          type={type}
          ref={newRef}
          label="Contraseña nueva"
          hint={`Mínimo ${PASSWORD_MIN_LENGTH} caracteres. Tiene que ser distinta de la actual.`}
          value={values.newPassword}
          onChange={(e) => set('newPassword', e.target.value)}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <TextField
          type={type}
          ref={repeatRef}
          label="Repetí la contraseña nueva"
          value={values.repeatPassword}
          onChange={(e) => set('repeatPassword', e.target.value)}
          error={errors.repeatPassword}
          autoComplete="new-password"
        />
        <label className="check" htmlFor={showId}>
          <input
            id={showId}
            type="checkbox"
            checked={visible}
            onChange={(event) => setVisible(event.target.checked)}
          />
          Mostrar las contraseñas
        </label>
        {done && <Notice variant="success">Listo, cambiaste tu contraseña.</Notice>}
        <div className="form__actions">
          <Button type="submit" large loading={submitting}>
            Cambiar contraseña
          </Button>
          {!forced && (
            <Link to={backTo} className="btn btn--secondary btn--large">
              {done ? 'Volver' : 'Cancelar'}
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
