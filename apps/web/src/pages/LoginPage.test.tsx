import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply, UNAUTHENTICATED } from '../test/helpers';

describe('LoginPage', () => {
  it('muestra el error de credenciales y los intentos que quedan, sin decir si el usuario existe', async () => {
    mockApi({
      'GET /api/auth/me': () => UNAUTHENTICATED,
      'POST /api/auth/login': () => ({
        status: 401,
        body: {
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Usuario o contraseña incorrectos.',
            details: { remainingAttempts: 3 },
          },
        },
      }),
    });
    renderApp('/');

    const user = userEvent.setup();
    const username = await screen.findByLabelText('Usuario');
    expect(username).toHaveFocus();
    await user.type(username, 'maria');
    await user.type(screen.getByLabelText('Contraseña'), 'equivocada{Enter}');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Usuario o contraseña incorrectos');
    expect(alert).toHaveTextContent('Te quedan 3 intentos');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('');
  });

  it('avisa cuánto esperar cuando el acceso está bloqueado', async () => {
    mockApi({
      'GET /api/auth/me': () => UNAUTHENTICATED,
      'POST /api/auth/login': () => ({
        status: 429,
        body: {
          error: {
            code: 'LOGIN_LOCKED',
            message: 'Demasiados intentos.',
            details: { retryAfterSeconds: 840 },
          },
        },
      }),
    });
    renderApp('/');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Usuario'), 'maria');
    await user.type(screen.getByLabelText('Contraseña'), 'x{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Probá de nuevo en 14 minutos');
  });

  it('pide usuario y contraseña antes de enviar', async () => {
    const fetchMock = mockApi({ 'GET /api/auth/me': () => UNAUTHENTICATED });
    renderApp('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Ingresá tu usuario.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el /me inicial
  });

  it('al entrar vuelve a la ruta original con su query string', async () => {
    let logged = false;
    mockApi({
      'GET /api/auth/me': () => (logged ? sessionReply('OWNER') : UNAUTHENTICATED),
      'POST /api/auth/login': () => {
        logged = true;
        return sessionReply('OWNER');
      },
      'GET /api/users': () => ({ body: { items: [] } }),
    });
    const { router } = renderApp('/usuarios?filtro=activos');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Usuario'), 'maria');
    await user.type(screen.getByLabelText('Contraseña'), 'secreta123{Enter}');
    await screen.findByRole('heading', { name: 'Usuarios' });
    expect(router.state.location.pathname).toBe('/usuarios');
    expect(router.state.location.search).toBe('?filtro=activos');
  });
});
