// Pantalla de entrada. Pensada para el mostrador: foco en el usuario, Enter envía.
// Los errores nunca revelan si el usuario existe (el servidor da el mismo mensaje en los tres casos).
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoginRequestSchema } from '@kiosco/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { LoadingState } from '../components/LoadingState';
import { Notice } from '../components/Notice';
import { TextField } from '../components/TextField';
import { useAuth } from '../lib/auth-context';
import { loginErrorContent } from '../lib/loginErrors';

export function LoginPage() {
  const { state, login, reload } = useAuth();
  const location = useLocation();
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ username?: string; password?: string }>({});
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);

  // Foco inicial en el usuario, cuando la pantalla ya está lista.
  const ready = state.status === 'anonymous';
  useEffect(() => {
    if (ready) usernameRef.current?.focus();
  }, [ready]);

  if (state.status === 'authenticated') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }
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

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;

    const errors: { username?: string; password?: string } = {};
    if (!username.trim()) errors.username = 'Ingresá tu usuario.';
    if (!password) errors.password = 'Ingresá tu contraseña.';
    const parsed = LoginRequestSchema.safeParse({ username, password });
    if (
      !errors.username &&
      !parsed.success &&
      parsed.error.issues.some((i) => i.path[0] === 'username')
    )
      errors.username = 'Es demasiado largo.';
    if (
      !errors.password &&
      !parsed.success &&
      parsed.error.issues.some((i) => i.path[0] === 'password')
    )
      errors.password = 'Es demasiado larga.';
    setFieldErrors(errors);
    if (errors.username) return usernameRef.current?.focus();
    if (errors.password) return passwordRef.current?.focus();
    if (!parsed.success) return;

    setError(null);
    setSubmitting(true);
    try {
      await login(parsed.data.username, parsed.data.password);
    } catch (caught) {
      setError(caught);
      // Se borra la contraseña y se deja el cursor ahí para reintentar enseguida.
      setPassword('');
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const content = error ? loginErrorContent(error) : null;

  return (
    <main className="login">
      <div className="login__card">
        <p className="login__brand">Kiosco</p>
        <h1>Entrar</h1>
        {state.notice && !error && <Notice variant="info">{state.notice}</Notice>}
        <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {content && <ErrorMessage title={content.title} message={content.body} />}
          <TextField
            ref={usernameRef}
            label="Usuario"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={fieldErrors.username}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <TextField
            ref={passwordRef}
            type="password"
            label="Contraseña"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password}
            autoComplete="current-password"
          />
          <Button type="submit" large loading={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </div>
    </main>
  );
}
