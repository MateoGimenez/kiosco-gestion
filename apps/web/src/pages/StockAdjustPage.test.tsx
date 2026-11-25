import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { PRODUCT_KG, PRODUCT_PUBLIC } from '../test/catalogFixtures';
import { mockApi, renderApp, sessionReply } from '../test/helpers';

function setup(product = PRODUCT_PUBLIC, path = `/productos/${product.id}/ajustar`) {
  const sent: unknown[] = [];
  mockApi({
    'GET /api/auth/me': () => sessionReply('MANAGER'),
    [`GET /api/products/${product.id}`]: () => ({ body: product }),
    [`POST /api/products/${product.id}/stock-adjustments`]: (init) => {
      sent.push(JSON.parse(String(init?.body)));
      return {
        status: 201,
        body: {
          movement: {},
          product: {
            id: product.id,
            stockQuantity: '19.000',
            minStock: '6.000',
            needsRestock: false,
          },
        },
      };
    },
  });
  renderApp(path);
  return { sent, user: userEvent.setup({ delay: null }) };
}

describe('Ajuste de stock', () => {
  it('pide el motivo primero y no muestra la cantidad hasta elegirlo', async () => {
    setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    expect(screen.getByRole('radiogroup', { name: 'Motivo del ajuste' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Cantidad/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Revisar ajuste' })).toBeDisabled();
  });

  it('cambia el campo según el motivo: restar, contar, sumar', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Rotura/ }));
    expect(screen.getByLabelText('Cantidad a restar')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Corrección por conteo/ }));
    expect(screen.getByLabelText('¿Cuántos contaste?')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cantidad a restar')).toBeNull();
    await user.click(screen.getByRole('radio', { name: /Carga inicial/ }));
    expect(screen.getByLabelText('Cantidad a sumar')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Otro/ }));
    expect(screen.getByRole('radio', { name: 'Restar' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Sumar' }));
    expect(screen.getByLabelText('Cantidad a sumar')).toBeInTheDocument();
  });

  it('rotura: el usuario escribe un positivo y se manda con signo negativo, con confirmación', async () => {
    const { sent, user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Rotura/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '2');
    expect(screen.getByText('Va a quedar 22')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Va a quedar: 22')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar ajuste' }));
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(sent).toEqual([{ reason: 'BREAKAGE', quantity: '-2' }]);
  });

  it('conteo: manda la cantidad contada (no la diferencia) y muestra cómo queda', async () => {
    const { sent, user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Corrección por conteo/ }));
    await user.type(screen.getByLabelText('¿Cuántos contaste?'), '19');
    expect(screen.getByText('Resta 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar ajuste' }),
    );
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(sent).toEqual([{ reason: 'COUNT_CORRECTION', countedQuantity: '19' }]);
  });

  it('conteo igual al stock actual no se puede confirmar', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Corrección por conteo/ }));
    await user.type(screen.getByLabelText('¿Cuántos contaste?'), '24');
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    expect(await screen.findByText(/Lo contado es igual al stock actual/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('en un producto por unidad no acepta decimales', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Faltante/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '1,5');
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    expect(
      await screen.findByText('Este producto se vende por unidad: usá números enteros.'),
    ).toBeInTheDocument();
  });

  it('en un producto por kg acepta decimales y los muestra en es-AR', async () => {
    const { sent, user } = setup(PRODUCT_KG);
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Rotura/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '0,350');
    expect(screen.getByText('Resta 0,350 kg')).toBeInTheDocument();
    expect(screen.getByText('Va a quedar 3,150 kg')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar ajuste' }),
    );
    await screen.findByRole('heading', { name: 'Jamón cocido' });
    expect(sent).toEqual([{ reason: 'BREAKAGE', quantity: '-0.35' }]);
  });

  it('el motivo "otro" exige una nota', async () => {
    const { sent, user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Otro/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '1');
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    expect(await screen.findByText(/Escribí una nota para el motivo "otro"/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.type(screen.getByLabelText('Nota (obligatoria)'), 'Se lo llevó el proveedor');
    await user.click(screen.getByRole('button', { name: 'Revisar ajuste' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirmar ajuste' }),
    );
    await screen.findByRole('heading', { name: 'Chocolate Águila 100 g' });
    expect(sent).toEqual([{ reason: 'OTHER', quantity: '-1', note: 'Se lo llevó el proveedor' }]);
  });

  it('avisa si el stock va a quedar negativo (se puede)', async () => {
    const { user } = setup();
    await screen.findByRole('heading', { name: 'Ajustar stock' });
    await user.click(screen.getByRole('radio', { name: /Consumo propio/ }));
    await user.type(screen.getByLabelText('Cantidad a restar'), '30');
    expect(screen.getByText(/va a quedar en negativo/)).toBeInTheDocument();
  });
});
