import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

const ITEM = {
  id: 51,
  name: 'Chocolate Águila 100 g',
  barcode: null,
  saleUnit: 'UNIT',
  categoryName: 'Golosinas',
  subcategoryName: 'Chocolates',
  stockQuantity: '2.000',
  minStock: '6.000',
  shortfall: '4.000',
  isActive: true,
};
const NEG = {
  ...ITEM,
  id: 60,
  name: 'Coca-Cola 500 ml',
  stockQuantity: '-2.000',
  shortfall: '8.000',
  isActive: false,
};

describe('Para reponer y stock negativo', () => {
  it('empleado: sin acceso', async () => {
    mockApi({ 'GET /api/auth/me': () => sessionReply('EMPLOYEE') });
    renderApp('/reponer');
    expect(await screen.findByText('No tenés permiso para ver esta pantalla')).toBeInTheDocument();
  });

  it('lista lo que falta, con acceso rápido a ajustar, y cambia a stock negativo', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/stock/restock': () => ({
        body: { items: [ITEM], page: 1, pageSize: 25, total: 1 },
      }),
      'GET /api/stock/negative': () => ({
        body: { items: [NEG], page: 1, pageSize: 25, total: 1 },
      }),
    });
    renderApp('/reponer');
    const user = userEvent.setup({ delay: null });
    const list = await screen.findByRole('list', { name: 'Productos' });
    expect(
      within(list).getByRole('link', { name: 'Ajustar Chocolate Águila 100 g' }),
    ).toHaveAttribute('href', '/productos/51/ajustar');
    await user.click(screen.getByRole('button', { name: 'Stock negativo' }));
    const negative = await screen.findByText('Coca-Cola 500 ml');
    expect(negative).toBeInTheDocument();
    expect(screen.getByText('Desactivado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustar Coca-Cola 500 ml' })).toHaveAttribute(
      'href',
      '/productos/60/ajustar?reason=COUNT_CORRECTION',
    );
  });

  it('muestra el estado vacío', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/stock/restock': () => ({ body: { items: [], page: 1, pageSize: 25, total: 0 } }),
    });
    renderApp('/reponer');
    expect(await screen.findByText('No hay nada para reponer por ahora.')).toBeInTheDocument();
  });
});
