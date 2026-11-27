// Pantalla de venta: lector, peso, "Varios", descuento por rol, cobro mixto y reintentos.
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/helpers';
import {
  COCA,
  FERNET,
  METHODS,
  QUESO,
  VINO,
  interceptSalePost,
  jsonResponse,
  mockSalesApi,
  saleCreated,
} from '../test/salesFixtures';

async function scan(user: ReturnType<typeof userEvent.setup>, code: string) {
  const input = await screen.findByRole('combobox');
  await user.click(input);
  await user.type(input, `${code}{Enter}`);
}

describe('pantalla de venta', () => {
  it('el lector (código + Enter) agrega la línea y, si el código ya está, suma 1', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();

    await scan(user, COCA.barcode);
    expect(await screen.findByText('Gaseosa cola 500 ml')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Cantidad de Gaseosa cola 500 ml: 1/ }),
    ).toBeInTheDocument();

    await scan(user, COCA.barcode);
    expect(
      await screen.findByRole('button', { name: /Cantidad de Gaseosa cola 500 ml: 2/ }),
    ).toBeInTheDocument();
    expect(document.querySelector('.totalbox__value')).toHaveTextContent('$ 2.900');
  });

  it('el foco vuelve al buscador y se avisa de un stock que no alcanza sin frenar la venta', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();

    await scan(user, FERNET.barcode);
    expect(await screen.findByText(/Stock insuficiente/)).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('button', { name: /Cobrar/ })).toBeEnabled();
  });

  it('un producto por peso pide los kilos con coma (0,350)', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();

    await scan(user, QUESO.barcode);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Kilos'), '0,350{Enter}');

    expect(await screen.findByText('0,350 kg')).toBeInTheDocument();
    // 0,350 × $ 4.990 = $ 1.746,50, que sube al peso: $ 1.747.
    expect(screen.getAllByText('$ 1.747').length).toBeGreaterThan(0);
  });

  it('"Varios" se abre con F4 y pide precio y descripción', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();

    await screen.findByRole('combobox');
    await waitFor(() => expect(screen.getByRole('button', { name: /^Varios/ })).toBeEnabled());
    await user.keyboard('{F4}');
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Precio ($)'), '700');
    await user.type(within(dialog).getByLabelText(/Qué es/), 'Pila AA{Enter}');

    expect(await screen.findByText('Varios: Pila AA')).toBeInTheDocument();
    expect(screen.getAllByText('$ 700').length).toBeGreaterThan(0);
  });

  it('el empleado no ve el descuento; el encargado sí', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText('Gaseosa cola 500 ml');
    expect(screen.queryByRole('button', { name: /Descuento/ })).not.toBeInTheDocument();
    await user.keyboard('{F8}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('el encargado ve el descuento', async () => {
    mockSalesApi('MANAGER');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText('Gaseosa cola 500 ml');
    expect(screen.getByRole('button', { name: /Descuento/ })).toBeEnabled();
  });
});

describe('cobro', () => {
  /** Arma el ejemplo 2: $ 10.000, descuento de $ 1.000 y abre el cobro. */
  async function openExample2(user: ReturnType<typeof userEvent.setup>) {
    await scan(user, VINO.barcode);
    await screen.findByText(VINO.name);
    await scan(user, FERNET.barcode);
    await screen.findByText(FERNET.name);
    await user.keyboard('{F8}');
    const discount = await screen.findByRole('dialog');
    await user.click(within(discount).getByLabelText('Pesos ($)'));
    await user.type(within(discount).getByLabelText('Cuántos pesos'), '1000{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.keyboard('{Control>}{Enter}{/Control}');
    return screen.findByRole('dialog', { name: 'Cobrar' });
  }

  async function mixedPayment(user: ReturnType<typeof userEvent.setup>, dialog: HTMLElement) {
    const first = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
    await user.clear(first);
    await user.type(first, '4500');
    const rest = within(dialog).getByRole('group', { name: 'Resto con:' });
    await user.click(within(rest).getByRole('button', { name: 'Crédito' }));
  }

  it('pago mixto: $ 9.500 con "Cobrá $ 5.000 en el posnet" (ejemplo 2)', async () => {
    mockSalesApi('MANAGER');
    renderApp('/vender');
    const user = userEvent.setup();
    const dialog = await openExample2(user);

    await mixedPayment(user, dialog);

    expect(within(dialog).getByText('$ 9.500', { selector: 'strong' })).toBeInTheDocument();
    const charge = within(dialog).getByText(
      (_, el) => el?.tagName === 'P' && /^Cobrá \$ 5\.000 en el posnet/.test(el.textContent ?? ''),
    );
    expect(charge).toBeInTheDocument();
    expect(within(dialog).getByText('Los pagos cubren el total.')).toBeInTheDocument();
  });

  it('bloquea un QR que se pasa del total', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);
    await user.keyboard('{Control>}{Enter}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar' });
    await user.selectOptions(within(dialog).getByLabelText('Medio de pago 1'), 'QR Mercado Pago');
    const amount = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
    await user.clear(amount);
    await user.type(amount, '2000');
    expect(within(dialog).getByText(/No puede pasar del total/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Cobrar/ })).toBeDisabled();
  });

  it('doble Enter en cobrar manda un solo POST', async () => {
    const base = mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);

    let release: (r: Response) => void = () => {};
    const gate = new Promise<Response>((resolve) => (release = resolve));
    const posts = interceptSalePost(base, () => gate);

    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('dialog', { name: 'Cobrar' });
    await user.keyboard('{Enter}{Enter}{Enter}');
    expect(posts).toHaveLength(1);

    release(jsonResponse(saleCreated()));
    expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    // Carrito nuevo y foco en el buscador.
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
    expect(screen.getByText('Todavía no hay productos')).toBeInTheDocument();
  });

  it('el reintento después de un error de red usa el mismo clientRequestId', async () => {
    const base = mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);

    let attempt = 0;
    const posts = interceptSalePost(base, () => {
      attempt += 1;
      return attempt === 1
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(jsonResponse(saleCreated()));
    });

    await user.keyboard('{Control>}{Enter}{/Control}');
    await screen.findByRole('dialog', { name: 'Cobrar' });
    await user.keyboard('{Enter}');
    const retry = await screen.findByRole('button', { name: 'Reintentar cobro' });
    await user.click(retry);

    expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
    expect(posts).toHaveLength(2);
    expect(posts[0]?.clientRequestId).toBeTruthy();
    expect(posts[1]?.clientRequestId).toBe(posts[0]?.clientRequestId);
  });

  it('SALE_TOTAL_CHANGED muestra el total nuevo y pide confirmar antes de cobrar de nuevo', async () => {
    const base = mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);

    let attempt = 0;
    const posts = interceptSalePost(base, () => {
      attempt += 1;
      if (attempt > 1) return Promise.resolve(jsonResponse(saleCreated()));
      return Promise.resolve(
        jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'SALE_TOTAL_CHANGED',
              message: 'El total cambió.',
              details: {
                expectedTotal: '1450.00',
                total: '1600.00',
                subtotal: '1600.00',
                discountAmount: '0.00',
                items: [{ index: 0, productId: 12, unitPrice: '1600.00', lineSubtotal: '1600.00' }],
                payments: [],
              },
            },
          },
        }),
      );
    });

    await user.keyboard('{Control>}{Enter}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar' });
    await user.keyboard('{Enter}');

    expect(
      await within(dialog).findByText(/El total cambió: antes era \$ 1\.450/),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    const confirm = await within(dialog).findByRole('button', {
      name: /Confirmar y cobrar \$ 1\.600/,
    });
    await user.click(confirm);

    expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
    expect(posts).toHaveLength(2);
    expect(posts[1]?.expectedTotal).toBe('1600');
    expect(posts[1]?.clientRequestId).toBe(posts[0]?.clientRequestId);
  });
});

describe('arreglos de QA (etapa 3)', () => {
  it('el descuento se va junto con la última línea y no pasa a la venta siguiente', async () => {
    mockSalesApi('MANAGER');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);
    await user.keyboard('{F8}');
    const dialog = await screen.findByRole('dialog', { name: 'Descuento' });
    // El foco cae en el campo del número, no en el radio.
    await waitFor(() => expect(within(dialog).getByLabelText('Cuántos %')).toHaveFocus());
    await user.keyboard('10{Enter}');
    await waitFor(() =>
      expect(document.querySelector('.totalbox__value')).toHaveTextContent('$ 1.305'),
    );

    await user.keyboard('{Delete}');
    await waitFor(() => expect(screen.getByText('Todavía no hay productos')).toBeInTheDocument());
    await scan(user, VINO.barcode);
    await screen.findByText(VINO.name);
    expect(document.querySelector('.totalbox__value')).toHaveTextContent('$ 6.000');
    expect(screen.queryByText(/Descuento aplicado/)).not.toBeInTheDocument();
  });

  it('"Vaciar" también limpia el descuento', async () => {
    mockSalesApi('MANAGER');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);
    await user.keyboard('{F8}');
    await screen.findByRole('dialog', { name: 'Descuento' });
    await user.keyboard('10{Enter}');
    await user.keyboard('{F9}');
    await user.click(await screen.findByRole('button', { name: 'Sí, vaciar' }));
    await scan(user, COCA.barcode);
    await screen.findByText(COCA.name);
    expect(document.querySelector('.totalbox__value')).toHaveTextContent('$ 1.450');
  });

  it('Ctrl+Enter cobra después de usar "Resto con" con el teclado', async () => {
    const base = mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, VINO.barcode);
    await screen.findByText(VINO.name);
    const posts = interceptSalePost(base, () => Promise.resolve(jsonResponse(saleCreated())));
    await user.keyboard('{Control>}{Enter}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar' });
    const first = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
    await user.clear(first);
    await user.type(first, '3000');
    const rest = within(dialog).getByRole('group', { name: 'Resto con:' });
    const debit = within(rest).getByRole('button', { name: 'Débito' });
    debit.focus();
    await user.keyboard('{Enter}');
    // El foco quedó dentro del diálogo (en el monto agregado), no en el fondo.
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(document.activeElement).not.toBe(document.body);
    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it('el panel dice "Total sin recargo" y el % real del crédito', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    expect(await screen.findByText('Total sin recargo')).toBeInTheDocument();
    expect(screen.getByText('El crédito suma 10 % sobre su parte')).toBeInTheDocument();
  });

  it('sin recargo configurado el panel dice solo "Total"', async () => {
    mockSalesApi('EMPLOYEE', {
      'GET /api/payment-methods': () => ({
        body: { items: METHODS.map((m) => ({ ...m, surchargePercent: '0.00' })) },
      }),
    });
    renderApp('/vender');
    await screen.findByRole('combobox');
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.queryByText(/El crédito suma/)).not.toBeInTheDocument();
  });

  it('mientras carga la caja el buscador está deshabilitado y hay un aviso', async () => {
    const base = mockSalesApi('EMPLOYEE');
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === '/api/cash-sessions/current') await gate;
        return base(input, init);
      }),
    );
    renderApp('/vender');
    const input = await screen.findByPlaceholderText('Esperá un instante antes de escanear');
    expect(input).toBeDisabled();
    expect(screen.getByText(/Todavía no escanees/)).toBeInTheDocument();
    release();
    expect(await screen.findByRole('combobox')).toBeEnabled();
  });

  it('tras SALE_TOTAL_CHANGED con 2 pagos se ajusta el último y se muestra qué cambió', async () => {
    const base = mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    const user = userEvent.setup();
    await scan(user, VINO.barcode);
    await screen.findByText(VINO.name);
    let attempt = 0;
    const posts = interceptSalePost(base, () => {
      attempt += 1;
      if (attempt > 1) return Promise.resolve(jsonResponse(saleCreated()));
      return Promise.resolve(
        jsonResponse({
          status: 409,
          body: {
            error: {
              code: 'SALE_TOTAL_CHANGED',
              message: 'El total cambió.',
              details: {
                expectedTotal: '6000.00',
                total: '6500.00',
                subtotal: '6500.00',
                discountAmount: '0.00',
                items: [{ index: 0, productId: 31, unitPrice: '6500.00', lineSubtotal: '6500.00' }],
                payments: [],
              },
            },
          },
        }),
      );
    });
    await user.keyboard('{Control>}{Enter}{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Cobrar' });
    const first = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
    await user.clear(first);
    await user.type(first, '3000');
    await user.click(
      within(within(dialog).getByRole('group', { name: 'Resto con:' })).getByRole('button', {
        name: 'Débito',
      }),
    );
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(
      await within(dialog).findByText(/Se ajustó el último pago \(Débito\)/),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Monto del pago 2 (sin recargo)')).toHaveValue('3500');
    expect(within(dialog).getByLabelText('Monto del pago 1 (sin recargo)')).toHaveValue('3000');
    await user.click(
      await within(dialog).findByRole('button', { name: /Confirmar y cobrar \$ 6\.500/ }),
    );
    expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
    expect(posts[1]?.payments).toEqual([
      { paymentMethodId: 1, amount: '3000' },
      { paymentMethodId: 2, amount: '3500' },
    ]);
  });

  describe('Enter en el diálogo de cobro', () => {
    async function openCheckout(user: ReturnType<typeof userEvent.setup>) {
      const base = mockSalesApi('EMPLOYEE');
      renderApp('/vender');
      await scan(user, VINO.barcode);
      await screen.findByText(VINO.name);
      const posts = interceptSalePost(base, () => Promise.resolve(jsonResponse(saleCreated())));
      await user.keyboard('{Control>}{Enter}{/Control}');
      const dialog = await screen.findByRole('dialog', { name: 'Cobrar' });
      return { dialog, posts };
    }

    it('Enter en un monto o en un medio no cobra: pasa al campo siguiente', async () => {
      const user = userEvent.setup();
      const { dialog, posts } = await openCheckout(user);
      // Pagos completos (todo en efectivo): aun así Enter en el monto no cobra.
      const amount = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
      await user.click(amount);
      await user.keyboard('{Enter}');
      expect(posts).toHaveLength(0);
      expect(within(dialog).getByLabelText(/Efectivo que entrega el cliente/)).toHaveFocus();

      const method = within(dialog).getByLabelText('Medio de pago 1');
      method.focus();
      await user.keyboard('{Enter}');
      expect(posts).toHaveLength(0);
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('Ctrl+Enter cobra desde un monto y Enter en el efectivo entregado cobra si los pagos cubren', async () => {
      const user = userEvent.setup();
      const { dialog, posts } = await openCheckout(user);
      await user.click(within(dialog).getByLabelText('Monto del pago 1 (sin recargo)'));
      await user.keyboard('{Control>}{Enter}{/Control}');
      expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
      expect(posts).toHaveLength(1);
    });

    it('Enter en el efectivo entregado cobra', async () => {
      const user = userEvent.setup();
      const { dialog, posts } = await openCheckout(user);
      const tendered = within(dialog).getByLabelText(/Efectivo que entrega el cliente/);
      await user.click(tendered);
      await user.type(tendered, '10000{Enter}');
      expect(await screen.findByText('Venta #1024 cobrada')).toBeInTheDocument();
      expect(posts).toHaveLength(1);
    });

    it('con los pagos sin cubrir, ningún atajo cobra', async () => {
      const user = userEvent.setup();
      const { dialog, posts } = await openCheckout(user);
      const amount = within(dialog).getByLabelText('Monto del pago 1 (sin recargo)');
      await user.clear(amount);
      await user.type(amount, '3000');
      expect(within(dialog).getByText(/Falta cobrar/)).toBeInTheDocument();
      await user.keyboard('{Control>}{Enter}{/Control}');
      const tendered = within(dialog).getByLabelText(/Efectivo que entrega el cliente/);
      await user.click(tendered);
      await user.keyboard('{Enter}');
      await user.keyboard('{Control>}{Enter}{/Control}');
      expect(posts).toHaveLength(0);
      expect(screen.queryByText('Venta #1024 cobrada')).not.toBeInTheDocument();
    });
  });
});
