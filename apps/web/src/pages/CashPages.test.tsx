// Etapa 4: cierre a ciegas, arqueo, movimientos, aviso de caja vieja y menú por rol.
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '../test/helpers';
import { CLOSED_DETAIL, CLOSED_PUBLIC, OPEN_DETAIL, mockCashApi } from '../test/cashFixtures';
import { COCA, barcodeReply, mockSalesApi } from '../test/salesFixtures';

function postBody(fetchMock: ReturnType<typeof mockCashApi>, url: string) {
  const call = fetchMock.mock.calls.find(
    ([input, init]) => String(input) === url && init?.method === 'POST',
  );
  return call ? (JSON.parse(String(call[1]?.body)) as Record<string, unknown>) : null;
}

describe('cierre de caja a ciegas', () => {
  it('pide solo el efectivo contado y no muestra nada del esperado', async () => {
    mockCashApi('EMPLOYEE');
    renderApp('/caja/cerrar');

    expect(await screen.findByLabelText(/Efectivo contado/)).toBeInTheDocument();
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inicial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/5\.000/)).not.toBeInTheDocument();
  });

  it('pide confirmar el monto escrito antes de cerrar', async () => {
    const fetchMock = mockCashApi('EMPLOYEE', {
      'POST /api/cash-sessions/8/close': () => ({ body: CLOSED_PUBLIC }),
    });
    renderApp('/caja/cerrar');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Efectivo contado/), '7400');
    await user.click(screen.getByRole('button', { name: 'Revisar y cerrar' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/¿Contaste/)).toHaveTextContent('¿Contaste $ 7.400?');
    expect(postBody(fetchMock, '/api/cash-sessions/8/close')).toBeNull();

    // Si el número está mal, se vuelve a corregir sin cerrar nada.
    await user.click(within(dialog).getByRole('button', { name: 'No, corregir' }));
    expect(postBody(fetchMock, '/api/cash-sessions/8/close')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Revisar y cerrar' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, cerrar la caja' }));
    await screen.findByRole('heading', { name: 'Caja cerrada' });
    expect(postBody(fetchMock, '/api/cash-sessions/8/close')).toEqual({ countedCash: '7400' });
  });

  it('el empleado ve solo "Caja cerrada" y lo que contó, aunque la API mande de más', async () => {
    mockCashApi('EMPLOYEE', {
      'POST /api/cash-sessions/8/close': () => ({
        body: {
          ...CLOSED_PUBLIC,
          expectedCash: '7500.00',
          difference: '-100.00',
          openingCash: '5000.00',
        },
      }),
    });
    renderApp('/caja/cerrar');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Efectivo contado/), '7400');
    await user.click(screen.getByRole('button', { name: 'Revisar y cerrar' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, cerrar la caja' }));

    expect(await screen.findByRole('heading', { name: 'Caja cerrada' })).toBeInTheDocument();
    expect(screen.getByText(/Contaste/)).toHaveTextContent('Contaste $ 7.400.');
    expect(screen.queryByText(/diferencia/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/esperado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/7\.500/)).not.toBeInTheDocument();
    expect(screen.queryByText(/100/)).not.toBeInTheDocument();
  });

  it('el encargado, al cerrar, ve la diferencia: esperado $ 7.500, contado $ 7.400, −$ 100', async () => {
    mockCashApi('MANAGER', {
      'POST /api/cash-sessions/8/close': () => ({ body: CLOSED_DETAIL }),
      'GET /api/cash-sessions/8': () => ({ body: CLOSED_DETAIL }),
    });
    renderApp('/caja/cerrar');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText(/Efectivo contado/), '7400');
    await user.click(screen.getByRole('button', { name: 'Revisar y cerrar' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, cerrar la caja' }));

    const arqueo = await screen.findByRole('region', { name: 'Arqueo del efectivo' });
    expect(within(arqueo).getByText('Esperado').nextSibling).toHaveTextContent('$ 7.500');
    expect(within(arqueo).getByText('Contado').nextSibling).toHaveTextContent('$ 7.400');
    expect(within(arqueo).getByText('Faltan $ 100')).toBeInTheDocument();
    expect(within(arqueo).getByText('Faltan $ 100')).toHaveClass('diff--bad');
  });

  it('no deja cerrar con un carrito sin cobrar en la pantalla de venta', async () => {
    mockSalesApi('MANAGER', {
      'GET /api/cash-sessions/current': () => ({
        body: {
          cashSession: { ...CLOSED_DETAIL, status: 'OPEN', closedAt: null, closedBy: null },
          currentBusinessDate: '2026-11-26',
          isFromPreviousBusinessDay: false,
          canClose: true,
        },
      }),
      [`GET /api/products/search?q=${COCA.barcode}&limit=5`]: () => barcodeReply(COCA),
    });
    const { router } = renderApp('/vender');
    const user = userEvent.setup();

    const input = await screen.findByRole('combobox');
    await user.type(input, `${COCA.barcode}{Enter}`);
    await screen.findByText('Coca-Cola 500 ml');

    await user.click(screen.getByRole('button', { name: 'Cerrar caja' }));
    expect(
      await screen.findByText(
        'Tenés un carrito sin cobrar. Cobralo o vacialo antes de cerrar la caja.',
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/vender');
  });

  it('con el carrito vacío, "Cerrar caja" lleva a la pantalla de cierre', async () => {
    mockSalesApi('MANAGER');
    const { router } = renderApp('/vender');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Cerrar caja' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/caja/cerrar'));
  });

  it('el empleado no ve el efectivo inicial en la pantalla de venta aunque la API lo mande', async () => {
    mockSalesApi('EMPLOYEE', {
      'GET /api/cash-sessions/current': () => ({
        body: {
          cashSession: { ...CLOSED_DETAIL, status: 'OPEN', closedAt: null, closedBy: null },
          currentBusinessDate: '2026-11-26',
          isFromPreviousBusinessDay: false,
          canClose: true,
        },
      }),
    });
    renderApp('/vender');
    await screen.findByText(/Caja abierta/);
    expect(screen.queryByText(/inicial/)).not.toBeInTheDocument();
  });
});

describe('ingresos y salidas', () => {
  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole('button', { name: 'Registrar ingreso o salida' }));
    return screen.findByRole('dialog');
  }

  it('ofrece los motivos según el sentido y no deja elegir el signo', async () => {
    mockCashApi('MANAGER');
    renderApp('/caja');
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    // Sin elegir el sentido no hay motivos.
    expect(within(dialog).queryByRole('radio', { name: 'Gasto' })).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Entra plata' }));
    expect(within(dialog).getByRole('radio', { name: 'Aporte de cambio' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Otro' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('radio', { name: 'Gasto' })).not.toBeInTheDocument();
    expect(
      within(dialog).queryByRole('radio', { name: 'Retiro del dueño' }),
    ).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('radio', { name: 'Sale plata' }));
    expect(within(dialog).getByRole('radio', { name: 'Gasto' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Retiro del dueño' })).toBeInTheDocument();
    expect(within(dialog).getByRole('radio', { name: 'Otro' })).toBeInTheDocument();
    expect(
      within(dialog).queryByRole('radio', { name: 'Aporte de cambio' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Pago a proveedor')).not.toBeInTheDocument();
  });

  it('registra una salida (gasto) con confirmación', async () => {
    const fetchMock = mockCashApi('MANAGER', {
      'POST /api/cash-movements': () => ({
        status: 201,
        body: CLOSED_DETAIL.movements[0],
      }),
    });
    renderApp('/caja');
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.click(within(dialog).getByRole('radio', { name: 'Sale plata' }));
    await user.click(within(dialog).getByRole('radio', { name: 'Gasto' }));
    await user.type(within(dialog).getByLabelText('Descripción'), 'Pago limpieza');
    await user.type(within(dialog).getByLabelText(/Monto/), '500');
    await user.click(within(dialog).getByRole('button', { name: 'Revisar' }));

    const confirm = await screen.findByRole('dialog');
    expect(confirm).toHaveTextContent('Salida de $ 500');
    expect(postBody(fetchMock, '/api/cash-movements')).toBeNull();
    await user.click(within(confirm).getByRole('button', { name: 'Sí, registrar la salida' }));

    await screen.findByText('Listo, el movimiento quedó registrado.');
    expect(postBody(fetchMock, '/api/cash-movements')).toEqual({
      direction: 'OUT',
      reason: 'EXPENSE',
      description: 'Pago limpieza',
      amount: '500',
    });
  });

  it('sin caja abierta no se puede registrar nada', async () => {
    mockCashApi('MANAGER', {}, { open: false });
    renderApp('/caja');
    expect(await screen.findByText(/No hay ninguna caja abierta/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Registrar ingreso o salida' }),
    ).not.toBeInTheDocument();
  });
});

describe('detalle de la caja', () => {
  it('en la caja abierta muestra el esperado "hasta ahora" y no hay diferencia todavía', async () => {
    mockCashApi('OWNER');
    renderApp('/caja/8');
    const arqueo = await screen.findByRole('region', { name: 'Arqueo del efectivo' });
    expect(within(arqueo).getByText('Esperado hasta ahora').nextSibling).toHaveTextContent(
      '$ 7.500',
    );
    expect(within(arqueo).getByText('Todavía no se contó')).toBeInTheDocument();
    expect(screen.getByText('Pago limpieza')).toBeInTheDocument();
  });

  it('agrega una nota a una caja cerrada', async () => {
    const fetchMock = mockCashApi('MANAGER', {
      'GET /api/cash-sessions/8': () => ({ body: CLOSED_DETAIL }),
      'POST /api/cash-sessions/8/notes': () => ({
        status: 201,
        body: {
          id: 12,
          cashSessionId: 8,
          note: 'Juan avisó que dio mal un vuelto de $100.',
          user: { id: 4, fullName: 'Lucía Pérez' },
          createdAt: '2026-11-26T23:10:02.000Z',
        },
      }),
    });
    renderApp('/caja/8');
    const user = userEvent.setup();

    await user.type(
      await screen.findByLabelText('Agregar una nota'),
      'Juan avisó que dio mal un vuelto de $100.',
    );
    await user.click(screen.getByRole('button', { name: 'Agregar nota' }));
    await waitFor(() =>
      expect(postBody(fetchMock, '/api/cash-sessions/8/notes')).toEqual({
        note: 'Juan avisó que dio mal un vuelto de $100.',
      }),
    );
  });

  it('no ofrece agregar notas en una caja abierta', async () => {
    mockCashApi('MANAGER', { 'GET /api/cash-sessions/8': () => ({ body: OPEN_DETAIL }) });
    renderApp('/caja/8');
    await screen.findByRole('region', { name: 'Arqueo del efectivo' });
    expect(screen.queryByLabelText('Agregar una nota')).not.toBeInTheDocument();
  });
});

describe('aviso de caja vieja', () => {
  it('avisa en el inicio con "Cerrar caja" si el usuario puede cerrarla', async () => {
    mockCashApi(
      'MANAGER',
      { 'GET /api/health': () => ({ body: { status: 'ok' } }) },
      { stale: true },
    );
    renderApp('/');
    expect(
      await screen.findByText(/Quedó abierta una caja de un día anterior/),
    ).toBeInTheDocument();
    expect(screen.getByText(/turno noche del 25\/11\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cerrar caja' })).toHaveAttribute(
      'href',
      '/caja/cerrar',
    );
  });

  it('al empleado que no la abrió le dice a quién avisar y no ofrece cerrarla', async () => {
    mockCashApi(
      'EMPLOYEE',
      { 'GET /api/health': () => ({ body: { status: 'ok' } }) },
      { stale: true, canClose: false },
    );
    renderApp('/');
    expect(
      await screen.findByText('Avisale a un encargado o al dueño para que la cierre.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cerrar caja' })).not.toBeInTheDocument();
  });

  it('también aparece en la pantalla de venta y no impide vender', async () => {
    mockSalesApi('MANAGER', {
      'GET /api/cash-sessions/current': () => ({
        body: {
          cashSession: {
            ...CLOSED_DETAIL,
            status: 'OPEN',
            businessDate: '2026-11-25',
            closedAt: null,
            closedBy: null,
          },
          currentBusinessDate: '2026-11-26',
          isFromPreviousBusinessDay: true,
          canClose: true,
        },
      }),
    });
    renderApp('/vender');
    expect(
      await screen.findByText(/Quedó abierta una caja de un día anterior/),
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeEnabled();
  });
});

describe('menú y apertura', () => {
  it('"Caja" está en el menú del encargado y del dueño, no del empleado', async () => {
    for (const [role, visible] of [
      ['MANAGER', true],
      ['OWNER', true],
      ['EMPLOYEE', false],
    ] as const) {
      mockCashApi(role, { 'GET /api/health': () => ({ body: { status: 'ok' } }) });
      renderApp('/');
      const nav = await screen.findByRole('navigation', { name: 'Principal' });
      const link = within(nav).queryByRole('link', { name: 'Caja' });
      if (visible) expect(link).toBeInTheDocument();
      else expect(link).not.toBeInTheDocument();
      document.body.innerHTML = '';
    }
  });

  const previousClosing = {
    cashSessionId: 8,
    shift: 'AFTERNOON',
    businessDate: '2026-11-26',
    closedAt: '2026-11-26T23:01:40.000Z',
    countedCash: '7400.00',
  };
  const noCash = (extra: object) => () => ({
    body: {
      cashSession: null,
      currentBusinessDate: '2026-11-26',
      isFromPreviousBusinessDay: false,
      canClose: false,
      ...extra,
    },
  });

  it('al abrir, el encargado ve lo contado en el último cierre (previousClosing)', async () => {
    mockSalesApi('MANAGER', { 'GET /api/cash-sessions/current': noCash({ previousClosing }) });
    renderApp('/vender');
    expect(await screen.findByText(/En el último cierre/)).toHaveTextContent('se contaron $ 7.400');
  });

  it('el empleado no ve el cierre anterior al abrir, aunque la API lo mande', async () => {
    mockSalesApi('EMPLOYEE', { 'GET /api/cash-sessions/current': noCash({ previousClosing }) });
    renderApp('/vender');
    await screen.findByRole('heading', { name: /Abrí la caja/ });
    expect(screen.queryByText(/En el último cierre/)).not.toBeInTheDocument();
  });
});
