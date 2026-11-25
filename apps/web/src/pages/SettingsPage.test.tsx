import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SETTINGS } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

describe('Configuración', () => {
  it('sin cambios el botón queda apagado; al guardar avisa "Se guardó" y se apaga de nuevo', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/settings': () => ({ body: SETTINGS }),
      'PATCH /api/settings': (init) => {
        body = JSON.parse(String(init?.body));
        return {
          body: { ...SETTINGS, priceRoundingStep: '50.00', updatedAt: '2026-11-25T15:00:00.000Z' },
        };
      },
    });
    renderApp('/configuracion');
    const user = userEvent.setup({ delay: null });
    const save = await screen.findByRole('button', { name: 'Sin cambios para guardar' });
    expect(save).toBeDisabled();
    const step = screen.getByLabelText('Redondeo de precios ($)');
    await user.clear(step);
    await user.type(step, '50');
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(await screen.findByText('Se guardó la configuración.')).toBeInTheDocument();
    expect(body).toEqual({ priceRoundingStep: '50' });
    expect(screen.getByRole('button', { name: 'Sin cambios para guardar' })).toBeDisabled();
  });

  it('rechaza decimales con punto: "1.5" pide coma', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/settings': () => ({ body: SETTINGS }),
    });
    renderApp('/configuracion');
    const user = userEvent.setup({ delay: null });
    const step = await screen.findByLabelText('Redondeo de precios ($)');
    await user.clear(step);
    await user.type(step, '1.5');
    await user.click(screen.getByRole('button', { name: 'Guardar configuración' }));
    expect(
      await screen.findByText('Usá coma para los decimales (ej.: 1.500,50)'),
    ).toBeInTheDocument();
  });
});
