import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PRICING } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

describe('Precios de un producto', () => {
  it('el encargado ve el costo y no puede editar el margen', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/products/51/pricing': () => ({ body: PRICING }),
    });
    renderApp('/pricing/51');
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(screen.getByLabelText('Costo sin IVA')).toHaveValue('1000');
    expect(screen.queryByLabelText(/Margen propio/)).toBeNull();
    expect(screen.getByText('Solo el dueño cambia los márgenes.')).toBeInTheDocument();
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('$ 1.820');
  });

  it('cambiar el costo recalcula el sugerido pero no toca el precio, y solo se manda lo cambiado', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/products/51/pricing': () => ({ body: PRICING }),
      'PATCH /api/products/51/pricing': (init) => {
        body = JSON.parse(String(init?.body));
        return {
          body: { ...PRICING, netCostPrice: '1200.00', updatedAt: '2026-11-25T14:00:00.000Z' },
        };
      },
    });
    renderApp('/pricing/51');
    const user = userEvent.setup({ delay: null });
    const cost = await screen.findByLabelText('Costo sin IVA');
    await user.clear(cost);
    await user.type(cost, '1200');
    // 1200 x 1,5 x 1,21 = 2178 -> 2180
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('$ 2.180');
    expect(screen.getByLabelText('Precio de venta (con IVA)')).toHaveValue('1820');
    expect(
      screen.getByText(/Cambiar el costo o el margen no cambia el precio de venta/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/Se guardó/);
    expect(body).toEqual({ netCostPrice: '1200' });
  });

  it('aplicar el sugerido y cargar el costo con IVA', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/products/51/pricing': () => ({
        body: {
          ...PRICING,
          salePrice: '1900.00',
          realMarginPercent: '57.02',
          matchesSuggestedPrice: false,
        },
      }),
      'PATCH /api/products/51/pricing': (init) => {
        body = JSON.parse(String(init?.body));
        return { body: PRICING };
      },
    });
    renderApp('/pricing/51');
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(screen.getByText(/Margen real con este precio:/)).toHaveTextContent('57,02 %');
    await user.click(screen.getByRole('button', { name: 'Aplicar el sugerido ($ 1.820)' }));
    expect(screen.getByLabelText('Precio de venta (con IVA)')).toHaveValue('1820');
    // Costo con IVA: 1210 equivale a 1000 sin IVA.
    await user.click(screen.getByRole('radio', { name: /Con IVA/ }));
    expect(screen.getByLabelText('Costo con IVA')).toHaveValue('1210');
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await screen.findByText(/Se guardó/);
    expect(body).toEqual({ salePrice: '1820' });
  });
});

describe('Precios: venta a pérdida', () => {
  it('avisa en vivo y, con el 422, pide confirmar y reenvía con confirmBelowCost', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/products/51/pricing': () => ({ body: PRICING }),
      'PATCH /api/products/51/pricing': (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        if (!body.confirmBelowCost) {
          return {
            status: 422,
            body: {
              error: {
                code: 'PRICE_BELOW_COST',
                message: 'El precio queda por debajo del costo.',
                details: {
                  salePrice: '1000.00',
                  costPrice: '1210.00',
                  realMarginPercent: '-17.36',
                },
              },
            },
          };
        }
        return {
          body: { ...PRICING, salePrice: '1000.00', updatedAt: '2026-11-25T14:00:00.000Z' },
        };
      },
    });
    renderApp('/pricing/51');
    const user = userEvent.setup({ delay: null });
    const price = await screen.findByLabelText('Precio de venta (con IVA)');
    await user.clear(price);
    await user.type(price, '1000');
    expect(await screen.findByText(/Con estos valores vendés a pérdida/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Margen real: -17,36 %')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Revisar precio' }));
    expect(bodies).toEqual([{ salePrice: '1000' }]);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Vender igual a pérdida',
      }),
    );
    await screen.findByText(/Se guardó/);
    expect(bodies[2]).toEqual({ salePrice: '1000', confirmBelowCost: true });
  });
});
