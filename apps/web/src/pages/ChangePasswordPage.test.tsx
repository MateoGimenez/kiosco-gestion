import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

const PASSWORD_REQUIRED = {
  status: 403,
  body: {
    error: { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Tenés que cambiar tu contraseña.' },
  },
};

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  values: { current?: string; next?: string; repeat?: string },
) {
  if (values.current !== undefined) {
    await user.type(await screen.findByLabelText('Contraseña actual'), values.current);
  }
  if (values.next !== undefined)
    await user.type(screen.getByLabelText('Contraseña nueva'), values.next);
  if (values.repeat !== undefined) {
    await user.type(screen.getByLabelText('Repetí la contraseña nueva'), values.repeat);
  }
}

describe('Cambio de contraseña obligatorio (H-21)', () => {
  it('si `me` dice mustChangePassword, lleva a la pantalla y no deja ir a otra', async () => {
    mockApi({ 'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL', true) });
    const { router } = renderApp('/usuarios');

    expect(
      await screen.findByRole('heading', { name: 'Elegí tu nueva contraseña' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tu contraseña la puso otra persona/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
    // Sin menú ni otras salidas: solo cambiarla o "Cambiar usuario".
    expect(screen.queryByRole('navigation', { name: 'Principal' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cambiar mi contraseña' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Cancelar' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cambiar usuario' })).toBeInTheDocument();

    // Aunque se intente ir a otra ruta, vuelve acá.
    await router.navigate('/');
    await waitFor(() => expect(router.state.location.pathname).toBe('/cambiar-contrasena'));
  });

  it('si cualquier pedido responde 403 PASSWORD_CHANGE_REQUIRED, también lleva a la pantalla', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('EMPLOYEE'),
      'GET /api/health': () => PASSWORD_REQUIRED,
    });
    const { router } = renderApp('/');
    expect(
      await screen.findByRole('heading', { name: 'Elegí tu nueva contraseña' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
  });

  it('al cambiarla, refresca la sesión y vuelve a la ruta original', async () => {
    let changed = false;
    const fetchMock = mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL', !changed),
      'POST /api/auth/change-password': () => {
        changed = true;
        return sessionReply('OWNER');
      },
      'GET /api/users': () => ({ body: { items: [] } }),
    });
    const { router } = renderApp('/usuarios');
    const user = userEvent.setup({ delay: null });
    await fillForm(user, {
      current: 'clave-vieja-1',
      next: 'clave-nueva-2',
      repeat: 'clave-nueva-2',
    });
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/usuarios');
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/auth/change-password');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      currentPassword: 'clave-vieja-1',
      newPassword: 'clave-nueva-2',
    });
  });

  it('valida en pantalla: mínimo, distinta de la actual y repetición', async () => {
    const fetchMock = mockApi({ 'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL', true) });
    renderApp('/');
    const user = userEvent.setup({ delay: null });

    await fillForm(user, { current: 'clave-vieja-1', next: 'corta', repeat: 'corta' });
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText(/al menos 8 caracteres/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Contraseña nueva'));
    await user.type(screen.getByLabelText('Contraseña nueva'), 'clave-vieja-1');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText(/tiene que ser distinta de la actual/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Contraseña nueva'));
    await user.type(screen.getByLabelText('Contraseña nueva'), 'clave-nueva-2');
    await user.clear(screen.getByLabelText('Repetí la contraseña nueva'));
    await user.type(screen.getByLabelText('Repetí la contraseña nueva'), 'otra-cosa-3');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(screen.getByText('No coincide con la contraseña nueva.')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1); // solo el /me inicial
  });

  it('INVALID_CURRENT_PASSWORD se muestra en el campo de la contraseña actual', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL', true),
      'POST /api/auth/change-password': () => ({
        status: 422,
        body: {
          error: {
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'No es correcta.',
            details: { remainingAttempts: 3 },
          },
        },
      }),
    });
    renderApp('/');
    const user = userEvent.setup({ delay: null });
    await fillForm(user, {
      current: 'equivocada1',
      next: 'clave-nueva-2',
      repeat: 'clave-nueva-2',
    });
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    const field = screen.getByLabelText('Contraseña actual');
    const error = await screen.findByText(/La contraseña actual no es correcta/);
    expect(error).toHaveTextContent('Te quedan 3 intentos');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(field).toHaveFocus());
  });

  it.each([
    ['LOGIN_LOCKED', { retryAfterSeconds: 840 }, 'Probá de nuevo en 14 minutos'],
    ['LOGIN_RATE_LIMITED', { retryAfterSeconds: 20 }, 'Esperá un momento'],
  ])('%s muestra un mensaje claro', async (code, details, text) => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL', true),
      'POST /api/auth/change-password': () => ({
        status: 429,
        body: { error: { code, message: 'Demasiados intentos.', details } },
      }),
    });
    renderApp('/');
    const user = userEvent.setup({ delay: null });
    await fillForm(user, {
      current: 'equivocada1',
      next: 'clave-nueva-2',
      repeat: 'clave-nueva-2',
    });
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
  });
});

describe('Cambiar mi contraseña (modo voluntario)', () => {
  it('se llega desde la barra superior, se puede cancelar y vuelve de donde venía', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/health': () => ({}),
    });
    const { router } = renderApp('/');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('link', { name: 'Cambiar mi contraseña' }));

    expect(
      await screen.findByRole('heading', { name: 'Cambiar mi contraseña' }),
    ).toBeInTheDocument();
    // Sigue el menú principal: no es obligatorio.
    expect(screen.getByRole('navigation', { name: 'Principal' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Cancelar' }));
    expect(await screen.findByRole('heading', { name: /^Hola, / })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });

  it('al terminar avisa y se queda en la pantalla', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/health': () => ({}),
      'POST /api/auth/change-password': () => sessionReply('MANAGER'),
    });
    renderApp('/cambiar-contrasena');
    const user = userEvent.setup({ delay: null });
    await fillForm(user, {
      current: 'clave-vieja-1',
      next: 'clave-nueva-2',
      repeat: 'clave-nueva-2',
    });
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    const notice = await screen.findByRole('status');
    expect(within(notice).getByText('Listo, cambiaste tu contraseña.')).toBeInTheDocument();
  });
});
