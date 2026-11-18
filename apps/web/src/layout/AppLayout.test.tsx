import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply, UNAUTHENTICATED } from '../test/helpers';

describe('AppLayout', () => {
  it('el empleado no ve "Usuarios" y el dueño sí', async () => {
    mockApi({ 'GET /api/auth/me': () => sessionReply('EMPLOYEE'), 'GET /api/health': () => ({}) });
    renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Inicio' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });

  it('el empleado que entra a /usuarios por la dirección ve un aviso de permiso', async () => {
    mockApi({ 'GET /api/auth/me': () => sessionReply('EMPLOYEE') });
    renderApp('/usuarios');
    expect(await screen.findByText('No tenés permiso para ver esta pantalla')).toBeInTheDocument();
  });

  it('el dueño ve "Usuarios" y su nombre y rol', async () => {
    mockApi({ 'GET /api/auth/me': () => sessionReply('OWNER'), 'GET /api/health': () => ({}) });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
    expect(screen.getByText('María Gómez')).toBeInTheDocument();
    expect(screen.getByText('Dueño')).toBeInTheDocument();
  });

  it('"Cambiar usuario" cierra la sesión, vacía la caché y vuelve al login', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/health': () => ({}),
      'POST /api/auth/logout': () => ({ status: 204 }),
    });
    const { queryClient } = renderApp('/');
    queryClient.setQueryData(['users'], { items: [{ id: 9 }] });

    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Cambiar usuario' }));

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('un 401 en cualquier pedido vuelve al login', async () => {
    let healthCalls = 0;
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/health': () => {
        healthCalls += 1;
        return UNAUTHENTICATED;
      },
    });
    renderApp('/');
    await waitFor(() => expect(healthCalls).toBeGreaterThan(0));
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión terminó');
  });
});
