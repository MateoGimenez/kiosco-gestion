import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

function person(id: number, fullName: string, role: string, isActive = true) {
  return {
    id,
    username: fullName.split(' ')[0]!.toLowerCase(),
    fullName,
    role,
    isActive,
    lastLoginAt: null,
  };
}

const LAST_OWNER_REPLY = {
  status: 422,
  body: { error: { code: 'LAST_ACTIVE_OWNER', message: 'Mensaje técnico.' } },
};

describe('UsersPage: último dueño (H-19)', () => {
  it('con un solo dueño activo, "Desactivar" queda deshabilitado y explica por qué', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users': () => ({
        body: { items: [person(1, 'Marta Ríos', 'OWNER'), person(2, 'Pedro Pérez', 'EMPLOYEE')] },
      }),
    });
    renderApp('/usuarios');
    const owner = (await screen.findByText('Marta Ríos')).closest('li')!;
    expect(within(owner).getByRole('button', { name: 'Desactivar a Marta Ríos' })).toBeDisabled();
    expect(
      within(owner).getByText('Tiene que quedar al menos un dueño activo.'),
    ).toBeInTheDocument();
    const other = screen.getByText('Pedro Pérez').closest('li')!;
    expect(within(other).getByRole('button', { name: 'Desactivar a Pedro Pérez' })).toBeEnabled();
  });

  it('si el servidor responde LAST_ACTIVE_OWNER al desactivar, muestra el mensaje claro', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users': () => ({
        body: { items: [person(1, 'Marta Ríos', 'OWNER'), person(2, 'Raúl Díaz', 'OWNER')] },
      }),
      'PATCH /api/users/2': () => LAST_OWNER_REPLY,
    });
    renderApp('/usuarios');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Desactivar a Raúl Díaz' }));
    const dialog = screen.getByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Tiene que quedar al menos un dueño activo',
    );
  });

  it('al bajar de rol, el selector del único dueño está bloqueado; y si el servidor responde, se muestra', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users/2': () => ({ body: person(2, 'Raúl Díaz', 'OWNER') }),
      'GET /api/users': () => ({
        body: { items: [person(1, 'Marta Ríos', 'OWNER'), person(2, 'Raúl Díaz', 'OWNER')] },
      }),
      'PATCH /api/users/2': () => LAST_OWNER_REPLY,
    });
    renderApp('/usuarios/2');
    const user = userEvent.setup({ delay: null });
    await user.selectOptions(await screen.findByLabelText('Rol'), 'MANAGER');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tiene que quedar al menos un dueño activo',
    );
  });

  it('el selector se bloquea cuando es el único dueño activo', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/users/1': () => ({ body: person(1, 'Marta Ríos', 'OWNER') }),
      'GET /api/users': () => ({ body: { items: [person(1, 'Marta Ríos', 'OWNER')] } }),
    });
    renderApp('/usuarios/1');
    expect(await screen.findByText(/al menos un dueño activo, por eso/)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Encargado' })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Dueño' })).toBeEnabled();
  });
});

describe('UsersPage: acciones desde afuera (H-20)', () => {
  it('Reactivar queda deshabilitado con "Solo desde el local"', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'REMOTE'),
      'GET /api/users': () => ({
        body: {
          items: [
            person(1, 'Marta Ríos', 'OWNER'),
            person(2, 'Raúl Díaz', 'OWNER'),
            person(3, 'Pedro Pérez', 'EMPLOYEE', false),
          ],
        },
      }),
    });
    renderApp('/usuarios');
    const row = (await screen.findByText('Pedro Pérez')).closest('li')!;
    expect(within(row).getByRole('button', { name: 'Reactivar a Pedro Pérez' })).toBeDisabled();
    expect(within(row).getByText('Solo desde el local.')).toBeInTheDocument();
    // Desactivar sí se puede desde afuera.
    expect(screen.getByRole('button', { name: 'Desactivar a Raúl Díaz' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nuevo usuario' })).toBeDisabled();
  });

  it('al editar desde afuera no se puede subir de rol, pero sí bajar', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'REMOTE'),
      'GET /api/users/3': () => ({ body: person(3, 'Ana Núñez', 'MANAGER') }),
    });
    renderApp('/usuarios/3');
    expect(await screen.findByRole('option', { name: 'Empleado' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Encargado' })).toBeEnabled();
    const up = screen.getByRole('option', { name: 'Dueño (solo desde el local)' });
    expect(up).toBeDisabled();
  });

  it('si la API responde LOCAL_ONLY, lo explica', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'LOCAL'),
      'GET /api/users': () => ({
        body: {
          items: [person(1, 'Marta Ríos', 'OWNER'), person(3, 'Pedro Pérez', 'EMPLOYEE', false)],
        },
      }),
      'PATCH /api/users/3': () => ({
        status: 403,
        body: { error: { code: 'LOCAL_ONLY', message: 'Mensaje técnico.' } },
      }),
    });
    renderApp('/usuarios');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Reactivar a Pedro Pérez' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'solo se puede hacer desde el local',
    );
  });
});
