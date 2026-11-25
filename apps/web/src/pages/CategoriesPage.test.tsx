import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

describe('Categorías', () => {
  it('el encargado crea una categoría con su margen inicial (H-23)', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'POST /api/categories': (init) => {
        body = JSON.parse(String(init?.body));
        return {
          status: 201,
          body: {
            id: 9,
            name: 'Bebidas',
            isActive: true,
            marginPercent: '35.00',
            subcategories: [],
          },
        };
      },
    });
    renderApp('/categorias');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Nueva categoría' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Bebidas');
    await user.type(within(dialog).getByLabelText('Margen inicial (%)'), '35');
    expect(within(dialog).getByText(/Después solo el dueño lo puede cambiar/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear categoría' }));
    expect(await screen.findByText('Se creó la categoría "Bebidas".')).toBeInTheDocument();
    expect(body).toEqual({ name: 'Bebidas', marginPercent: '35' });
  });

  it('el encargado no puede cambiar márgenes al editar: no hay campo y no se manda', async () => {
    let body: unknown;
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'PATCH /api/categories/2': (init) => {
        body = JSON.parse(String(init?.body));
        return { body: { ...CATEGORIES[0], name: 'Dulces' } };
      },
      'PATCH /api/subcategories/4': () => ({ body: {} }),
    });
    renderApp('/categorias');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Editar la categoría Golosinas' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Margen/)).toBeNull();
    expect(within(dialog).getByText(/Solo el\s+dueño cambia los márgenes/)).toBeInTheDocument();
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Dulces');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await screen.findByText('Cambios guardados.');
    expect(body).toEqual({ name: 'Dulces' });

    // Lo mismo en una subcategoría.
    await user.click(screen.getByRole('button', { name: 'Editar la subcategoría Chocolates' }));
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByLabelText(/Margen/)).toBeNull();
  });

  it('el dueño sí ve y edita los márgenes', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
    });
    renderApp('/categorias');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Editar la categoría Golosinas' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Margen (%)')).toHaveValue('40');
  });

  it('desactivar con productos activos muestra el error claro (H-27)', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: CATEGORIES } }),
      'PATCH /api/subcategories/4': () => ({
        status: 422,
        body: {
          error: {
            code: 'SUBCATEGORY_HAS_ACTIVE_PRODUCTS',
            message: 'Tiene productos activos.',
            details: { activeProductCount: 12 },
          },
        },
      }),
    });
    renderApp('/categorias');
    const user = userEvent.setup({ delay: null });
    await user.click(
      await screen.findByRole('button', { name: 'Desactivar la subcategoría Chocolates' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(await within(dialog).findByText(/Tiene 12 productos activos/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Ver esos productos' })).toHaveAttribute(
      'href',
      '/productos?cat=2&sub=4',
    );
  });

  it('reactiva una categoría desactivada (H-26)', async () => {
    let called = false;
    const inactive = [{ ...CATEGORIES[0]!, isActive: false }];
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/categories': () => ({ body: { items: inactive } }),
      'PATCH /api/categories/2': (init) => {
        called = JSON.parse(String(init?.body)).isActive === true;
        return { body: { ...inactive[0], isActive: true } };
      },
    });
    renderApp('/categorias');
    const user = userEvent.setup({ delay: null });
    await user.click(
      await screen.findByRole('button', { name: 'Reactivar la categoría Golosinas' }),
    );
    expect(await screen.findByText('Se reactivó la categoría "Golosinas".')).toBeInTheDocument();
    expect(called).toBe(true);
  });
});
