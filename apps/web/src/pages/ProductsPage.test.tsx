import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CATEGORIES, PRODUCT_PUBLIC, PRODUCT_WITH_COST, page } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

// El servidor del empleado no manda costos; igual probamos que la pantalla no los dibuje
// aunque llegaran por error (defensa en profundidad).
const LEAKY = { ...PRODUCT_WITH_COST };

describe('Productos: costos según el rol', () => {
  it('el empleado ve la lista con precio y stock, sin costos ni márgenes', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('EMPLOYEE'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'GET /api/products': () => ({ body: page([LEAKY]) }),
    });
    renderApp('/productos');
    const list = await screen.findByRole('list', { name: 'Productos' });
    expect(within(list).getByText('Chocolate Águila 100 g')).toBeInTheDocument();
    expect(within(list).getByText('$ 1.820')).toBeInTheDocument();
    expect(screen.queryByText(/costo/i)).toBeNull();
    expect(screen.queryByText(/margen/i)).toBeNull();
    expect(screen.queryByText(/1\.000/)).toBeNull();
    // El empleado no crea productos.
    expect(screen.queryByRole('link', { name: 'Nuevo producto' })).toBeNull();
    // El menú no ofrece las pantallas de encargado.
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    expect(within(nav).getByRole('link', { name: 'Productos' })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: 'Categorías' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Para reponer' })).toBeNull();
  });

  it('el empleado ve la ficha sin costos ni acciones de edición', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('EMPLOYEE'),
      'GET /api/products/51': () => ({ body: LEAKY }),
    });
    renderApp('/productos/51');
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(screen.getByText('$ 1.820')).toBeInTheDocument();
    expect(screen.queryByText(/costo/i)).toBeNull();
    expect(screen.queryByText(/margen/i)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Ajustar stock' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Editar datos' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Desactivar/ })).toBeNull();
  });

  it('el encargado ve la ficha sin costos y con un camino a Precios', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    renderApp('/productos/51');
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(screen.queryByText(/Costo y margen/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Ir a precios' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajustar stock' })).toBeInTheDocument();
  });

  it('el dueño ve costo y margen en la ficha', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/products/51': () => ({ body: PRODUCT_WITH_COST }),
    });
    renderApp('/productos/51');
    const section = await screen.findByRole('region', { name: 'Costo y margen' });
    expect(within(section).getByText('$ 1.000,00')).toBeInTheDocument();
    expect(within(section).getByText('$ 1.210,00')).toBeInTheDocument();
    expect(within(section).getByText(/50 %/)).toBeInTheDocument();
  });
});

describe('Productos: búsqueda rápida', () => {
  it('el foco arranca en el buscador y Enter con un código abre la ficha', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('EMPLOYEE'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'GET /api/products': () => ({ body: page([PRODUCT_PUBLIC]) }),
      'GET /api/products/51': () => ({ body: PRODUCT_PUBLIC }),
    });
    const { router } = renderApp('/productos');
    const user = userEvent.setup({ delay: null });
    const search = await screen.findByLabelText('Buscar por código de barras o nombre');
    expect(search).toHaveFocus();
    await user.type(search, '7790580123456{Enter}');
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(router.state.location.pathname).toBe('/productos/51');
  });

  it('muestra un estado vacío claro cuando no hay resultados', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'GET /api/products': () => ({ body: page([]) }),
    });
    renderApp('/productos?q=zzz');
    expect(
      await screen.findByText('No hay productos que coincidan con la búsqueda.'),
    ).toBeInTheDocument();
  });

  it('muestra el error con "Reintentar" si la API falla', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'GET /api/products': () => ({
        status: 500,
        body: { error: { code: 'INTERNAL_ERROR', message: 'Algo falló.' } },
      }),
    });
    renderApp('/productos');
    expect(await screen.findByText('No se pudo cargar la lista de productos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
