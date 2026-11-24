import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

const ME = { id: 1, username: 'maria', fullName: 'María Gómez', isActive: true, lastLoginAt: null };

describe('UserFormPage', () => {
  it('si el dueño se cambia su propio rol, el menú se actualiza y sale de Usuarios con un aviso', async () => {
    let role: 'OWNER' | 'MANAGER' = 'OWNER';
    mockApi({
      'GET /api/auth/me': () => sessionReply(role),
      'GET /api/health': () => ({}),
      'GET /api/users/1': () => ({ body: { ...ME, role } }),
      'GET /api/users': () => ({ body: { items: [{ ...ME, role }] } }),
      'PATCH /api/users/1': () => {
        role = 'MANAGER';
        return { body: { ...ME, role } };
      },
    });
    const { router } = renderApp('/usuarios/1');
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('heading', { name: 'Editar a María Gómez' });
    await user.selectOptions(screen.getByLabelText('Rol'), 'MANAGER');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Ya no podés administrar usuarios/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });

  it('en su propio usuario no hay "Resetear contraseña": lleva a "Cambiar mi contraseña"', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users/1': () => ({ body: { ...ME, role: 'OWNER' } }),
      'GET /api/users': () => ({ body: { items: [{ ...ME, role: 'OWNER' }] } }),
    });
    const { router } = renderApp('/usuarios/1');
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('heading', { name: 'Editar a María Gómez' });
    expect(screen.queryByRole('button', { name: 'Resetear contraseña' })).toBeNull();
    expect(screen.queryByLabelText('Contraseña nueva')).toBeNull();
    const section = screen.getByRole('region', { name: 'Resetear contraseña' });
    await user.click(within(section).getByRole('link', { name: 'Cambiar mi contraseña' }));
    expect(
      await screen.findByRole('heading', { name: 'Cambiar mi contraseña' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
  });

  it('en el usuario de otra persona sí se puede resetear', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users/2': () => ({
        body: { ...ME, id: 2, fullName: 'Pedro Pérez', role: 'EMPLOYEE' },
      }),
    });
    renderApp('/usuarios/2');
    expect(await screen.findByRole('button', { name: 'Resetear contraseña' })).toBeInTheDocument();
  });
});
