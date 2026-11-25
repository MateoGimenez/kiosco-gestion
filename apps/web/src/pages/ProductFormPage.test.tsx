import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, PRODUCT_PUBLIC, SETTINGS } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

function handlers(role: 'OWNER' | 'MANAGER') {
  return {
    'GET /api/auth/me': () => sessionReply(role),
    'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
    'GET /api/settings': () => ({ body: SETTINGS }),
  };
}

describe('Alta de producto', () => {
  it('calcula el precio sugerido en vivo: costo $1.000, margen 50 %, IVA 21 % da $1.820', async () => {
    mockApi(handlers('OWNER'));
    renderApp('/productos/nuevo');
    const user = userEvent.setup({ delay: null });
    // Golosinas (40 %) y, adentro, Chocolates (50 %).
    await user.selectOptions(await screen.findByLabelText('Categoría'), '2');
    await user.selectOptions(screen.getByLabelText('Subcategoría'), '4');
    await user.type(screen.getByLabelText('Costo sin IVA'), '1000');
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('$ 1.820');
    // El precio de venta viene precargado con el sugerido.
    expect(screen.getByLabelText('Precio de venta (con IVA)')).toHaveValue('1820');
  });

  it('con el precio puesto a mano muestra el margen real', async () => {
    mockApi(handlers('OWNER'));
    renderApp('/productos/nuevo');
    const user = userEvent.setup({ delay: null });
    await user.selectOptions(await screen.findByLabelText('Categoría'), '2');
    await user.selectOptions(screen.getByLabelText('Subcategoría'), '4');
    await user.type(screen.getByLabelText('Costo sin IVA'), '1000');
    const price = screen.getByLabelText('Precio de venta (con IVA)');
    await user.clear(price);
    await user.type(price, '1900');
    expect(await screen.findByText(/Margen real con este precio: 57,02 %/)).toBeInTheDocument();
    // Y se puede volver al sugerido con un clic.
    await user.click(screen.getByRole('button', { name: /Usar el sugerido/ }));
    expect(screen.getByLabelText('Precio de venta (con IVA)')).toHaveValue('1820');
  });

  it('el margen propio del dueño cambia el sugerido (60 % -> $1.940)', async () => {
    mockApi(handlers('OWNER'));
    renderApp('/productos/nuevo');
    const user = userEvent.setup({ delay: null });
    await user.selectOptions(await screen.findByLabelText('Categoría'), '2');
    await user.selectOptions(screen.getByLabelText('Subcategoría'), '4');
    await user.type(screen.getByLabelText('Costo sin IVA'), '1000');
    await user.type(screen.getByLabelText('Margen propio (opcional)'), '60');
    // 1000 x 1,6 x 1,21 = 1936 -> 1940
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('$ 1.940');
  });

  it('el encargado no puede editar márgenes y no manda el campo', async () => {
    let body: Record<string, unknown> = {};
    mockApi({
      ...handlers('MANAGER'),
      'POST /api/products': (init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return { status: 201, body: { ...PRODUCT_PUBLIC } };
      },
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    renderApp('/productos/nuevo');
    const user = userEvent.setup({ delay: null });
    await user.selectOptions(await screen.findByLabelText('Categoría'), '2');
    await user.selectOptions(screen.getByLabelText('Subcategoría'), '4');
    expect(screen.queryByLabelText(/Margen propio/)).toBeNull();
    expect(screen.getByText(/Solo el dueño lo cambia/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Nombre'), 'Chocolate Águila 100 g');
    await user.type(screen.getByLabelText('Costo sin IVA'), '1000');
    // El encargado ve el sugerido calculado con el margen heredado.
    expect(screen.getByTestId('suggested-price')).toHaveTextContent('$ 1.820');
    await user.click(screen.getByRole('button', { name: 'Crear producto' }));
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(body).toMatchObject({ salePrice: '1820', netCostPrice: '1000', subcategoryId: 4 });
    expect(body).not.toHaveProperty('marginPercent');
  });

  it('un producto por unidad rechaza decimales en el mínimo', async () => {
    mockApi(handlers('OWNER'));
    renderApp('/productos/nuevo');
    const user = userEvent.setup({ delay: null });
    await user.selectOptions(await screen.findByLabelText('Categoría'), '2');
    await user.selectOptions(screen.getByLabelText('Subcategoría'), '4');
    await user.type(screen.getByLabelText('Nombre'), 'Algo');
    await user.type(screen.getByLabelText('Precio de venta (con IVA)'), '100');
    await user.type(screen.getByLabelText('Stock mínimo'), '2,5');
    await user.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(
      await screen.findByText('Este producto se vende por unidad: usá números enteros.'),
    ).toBeInTheDocument();
  });
});

describe('Edición de producto', () => {
  it('explica que el stock no se edita acá y lleva al ajuste', async () => {
    mockApi({
      ...handlers('MANAGER'),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    renderApp('/productos/51/editar');
    await screen.findByRole('heading', { name: 'Editar Chocolate Águila 100 g' });
    expect(await screen.findByText(/El stock no se cambia desde acá/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustar stock' })).toHaveAttribute(
      'href',
      '/productos/51/ajustar',
    );
    expect(screen.queryByLabelText('Stock inicial (opcional)')).toBeNull();
    expect(screen.queryByLabelText(/Costo/)).toBeNull();
  });
});
