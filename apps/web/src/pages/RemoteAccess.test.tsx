import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PRODUCT_PUBLIC, SETTINGS } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

const ITEM = {
  id: 51,
  name: 'Chocolate con leche 100 g',
  barcode: null,
  saleUnit: 'UNIT',
  categoryName: 'Golosinas',
  subcategoryName: 'Chocolates',
  stockQuantity: '2.000',
  minStock: '6.000',
  shortfall: '4.000',
  isActive: true,
};

describe('Acceso desde afuera (REMOTE)', () => {
  it('la ficha deshabilita "Ajustar stock" con la nota "Solo desde el local"', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER', 'REMOTE'),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    renderApp('/productos/51');
    const button = await screen.findByRole('button', { name: 'Ajustar stock' });
    expect(button).toBeDisabled();
    expect(screen.queryByRole('link', { name: 'Ajustar stock' })).toBeNull();
    expect(button).toHaveAccessibleDescription('Solo desde el local.');
  });

  it('desde el local sigue siendo un enlace', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER', 'LOCAL'),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    renderApp('/productos/51');
    expect(await screen.findByRole('link', { name: 'Ajustar stock' })).toBeInTheDocument();
  });

  it('Para reponer y Stock negativo deshabilitan "Ajustar"', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'REMOTE'),
      'GET /api/stock/restock': () => ({
        body: { items: [ITEM], page: 1, pageSize: 25, total: 1 },
      }),
      'GET /api/stock/negative': () => ({
        body: { items: [{ ...ITEM, stockQuantity: '-1.000' }], page: 1, pageSize: 25, total: 1 },
      }),
    });
    renderApp('/reponer');
    const user = userEvent.setup({ delay: null });
    expect(
      await screen.findByRole('button', { name: 'Ajustar Chocolate con leche 100 g' }),
    ).toBeDisabled();
    expect(screen.getByText(/Solo desde el local/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stock negativo' }));
    expect(await screen.findByText('-1')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Ajustar Chocolate con leche 100 g' }),
    ).toBeDisabled();
  });

  it('Configuración: la hora de corte queda apagada con "Solo desde el local"', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER', 'REMOTE'),
      'GET /api/settings': () => ({ body: SETTINGS }),
    });
    renderApp('/configuracion');
    const cutoff = await screen.findByLabelText('Hora de corte del día de trabajo');
    expect(cutoff).toBeDisabled();
    expect(cutoff).toHaveAccessibleDescription('Solo desde el local.');
    // El nombre y el redondeo sí se pueden cambiar desde afuera.
    expect(screen.getByLabelText('Nombre del negocio')).toBeEnabled();
  });

  it('si igual llega LOCAL_ONLY al ajustar, se muestra el motivo claro', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER', 'LOCAL'),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
      'POST /api/products/51/stock-adjustments': () => ({
        status: 403,
        body: { error: { code: 'LOCAL_ONLY', message: 'Solo desde la puerta local.' } },
      }),
    });
    renderApp('/productos/51/ajustar');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('radio', { name: /Rotura/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '1');
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    await user.click(await screen.findByRole('button', { name: 'Confirmar ajuste' }));
    expect(await screen.findByText(/Esto solo se puede hacer desde el local/)).toBeInTheDocument();
  });
});
