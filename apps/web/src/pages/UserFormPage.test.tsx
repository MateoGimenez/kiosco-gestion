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
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Editar a María Gómez' });
    await user.selectOptions(screen.getByLabelText('Rol'), 'MANAGER');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/Ya no podés administrar usuarios/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });
});
