// Apertura de caja, lista de ventas con anulación y medios de pago.
import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockApi, renderApp, sessionReply } from '../test/helpers';
import { METHODS, mockSalesApi, openCash } from '../test/salesFixtures';

const SALE = {
  id: 1024,
  status: 'COMPLETED',
  businessDate: '2026-11-26',
  createdAt: '2026-11-26T13:45:02.120Z',
  cashSession: { id: 7, shift: 'MORNING', businessDate: '2026-11-26' },
  user: { id: 4, fullName: 'Lucía Pérez' },
  subtotal: '10000.00',
  discountAmount: '1000.00',
  discountPercent: null,
  discountReason: null,
  amountDue: '9000.00',
  surchargeAmount: '500.00',
  total: '9500.00',
  items: [
    {
      id: 1,
      productId: 31,
      productName: 'Vino Malbec 750 ml',
      customDescription: null,
      isMiscellaneous: false,
      saleUnit: 'UNIT',
      quantity: '1.000',
      unitPrice: '6000.00',
      vatRatePercent: '21.00',
      lineSubtotal: '6000.00',
      discountAmount: '600.00',
      lineTotal: '5400.00',
      lineNetTotal: '4462.81',
      unitNetCost: '3500.00',
      unitCost: '4235.00',
      lineProfit: '962.81',
    },
  ],
  payments: [
    {
      id: 1,
      paymentMethod: { id: 1, kind: 'CASH', name: 'Efectivo' },
      amount: '4500.00',
      surchargeBase: '5000.00',
      surchargePercent: '0.00',
      surchargeAmount: '0.00',
      chargedAmount: '4500.00',
    },
    {
      id: 2,
      paymentMethod: { id: 3, kind: 'CREDIT_CARD', name: 'Crédito' },
      amount: '4500.00',
      surchargeBase: '5000.00',
      surchargePercent: '10.00',
      surchargeAmount: '500.00',
      chargedAmount: '5000.00',
    },
  ],
  voidedAt: null,
  voidedBy: null,
  voidReason: null,
  voidRefund: null,
  grossProfit: '962.81',
};

const LIST_ITEM = {
  id: 1024,
  status: 'COMPLETED',
  businessDate: '2026-11-26',
  createdAt: '2026-11-26T13:45:02.120Z',
  cashSession: { id: 7, shift: 'MORNING' },
  user: { id: 4, fullName: 'Lucía Pérez' },
  itemCount: 2,
  hasMiscellaneous: false,
  subtotal: '10000.00',
  discountAmount: '1000.00',
  surchargeAmount: '500.00',
  total: '9500.00',
  payments: [
    { kind: 'CASH', name: 'Efectivo', chargedAmount: '4500.00' },
    { kind: 'CREDIT_CARD', name: 'Crédito', chargedAmount: '5000.00' },
  ],
  voidedAt: null,
};

describe('apertura de caja', () => {
  it('sin caja abierta ofrece abrirla con turno y efectivo inicial', async () => {
    let body: unknown;
    mockSalesApi('EMPLOYEE', {
      'GET /api/cash-sessions/current': () => ({
        body: { cashSession: null, currentBusinessDate: '2026-11-26' },
      }),
      'POST /api/cash-sessions': (init) => {
        body = JSON.parse(String(init?.body));
        return { status: 201, body: {} };
      },
    });
    renderApp('/vender');
    const user = userEvent.setup();

    await screen.findByText('Abrí la caja para empezar a vender');
    await user.click(screen.getByLabelText('Mañana'));
    await user.type(screen.getByLabelText(/Efectivo inicial/), '5000');
    await user.click(screen.getByRole('button', { name: 'Abrir caja' }));

    await waitFor(() => expect(body).toEqual({ shift: 'MORNING', openingCash: '5000' }));
  });

  it('con una caja abierta por otra persona dice quién y que se vende en esa; el empleado no ve el efectivo inicial', async () => {
    mockSalesApi('EMPLOYEE');
    renderApp('/vender');
    expect(await screen.findByText(/la abrió Juan Ruiz/)).toBeInTheDocument();
    expect(screen.queryByText(/inicial/)).not.toBeInTheDocument();
  });

  it('el encargado sí ve el efectivo inicial', async () => {
    mockSalesApi('MANAGER');
    renderApp('/vender');
    expect(await screen.findByText(/inicial \$ 5\.000/)).toBeInTheDocument();
  });

  it('desde la puerta remota la venta queda deshabilitada: solo desde el local', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER', 'REMOTE'),
      'GET /api/cash-sessions/current': () => openCash(true),
      'GET /api/payment-methods': () => ({ body: { items: METHODS } }),
    });
    renderApp('/vender');
    expect(await screen.findByRole('button', { name: /solo desde el local/i })).toBeDisabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('lista de ventas', () => {
  const handlers = {
    'GET /api/cash-sessions': () => ({ body: { items: [], page: 1, pageSize: 50, total: 0 } }),
    'GET /api/sales': () => ({ body: { items: [LIST_ITEM], page: 1, pageSize: 25, total: 1 } }),
    'GET /api/sales/1024': () => ({ body: SALE }),
  };

  it('muestra las ventas del día de trabajo', async () => {
    mockSalesApi('MANAGER', handlers);
    renderApp('/ventas');
    expect(await screen.findByText('#1024')).toBeInTheDocument();
    expect(screen.getByText('$ 9.500')).toBeInTheDocument();
    expect(screen.getByText('Efectivo + Crédito')).toBeInTheDocument();
  });

  it('anula con motivo y muestra qué devolver; el dueño ve costos y el encargado no', async () => {
    let voidBody: unknown;
    mockSalesApi('OWNER', {
      ...handlers,
      'POST /api/sales/1024/void': (init) => {
        voidBody = JSON.parse(String(init?.body));
        return {
          body: {
            sale: { ...SALE, status: 'VOIDED', voidReason: 'Se arrepintió' },
            cashRefund: { cashMovementId: 88, cashSessionId: 7, amount: '4500.00' },
            otherRefunds: [
              {
                paymentMethod: { id: 3, kind: 'CREDIT_CARD', name: 'Crédito' },
                chargedAmount: '5000.00',
              },
            ],
          },
        };
      },
    });
    renderApp('/ventas/1024');
    const user = userEvent.setup();
    expect(await screen.findByText('Ganancia bruta (sin recargo)')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Anular esta venta' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, anular la venta' }));
    expect(
      await within(dialog).findByText('Escribí el motivo de la anulación.'),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Motivo/), 'Se arrepintió');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, anular la venta' }));

    expect(await screen.findByText(/Salieron \$ 4\.500 en efectivo/)).toBeInTheDocument();
    expect(screen.getByText(/Devolvé por fuera: Crédito \$ 5\.000/)).toBeInTheDocument();
    expect(voidBody).toEqual({ reason: 'Se arrepintió' });
  });

  it('el encargado no ve costos ni ganancia', async () => {
    const { items, ...rest } = SALE;
    const managerSale = {
      ...rest,
      items: items.map(({ unitNetCost: _a, unitCost: _b, lineProfit: _c, ...it }) => it),
    };
    const { grossProfit: _g, ...withoutProfit } = managerSale as typeof managerSale & {
      grossProfit?: string;
    };
    mockSalesApi('MANAGER', {
      ...handlers,
      'GET /api/sales/1024': () => ({ body: withoutProfit }),
    });
    renderApp('/ventas/1024');
    expect(await screen.findByText('Venta #1024')).toBeInTheDocument();
    expect(screen.queryByText('Ganancia bruta (sin recargo)')).not.toBeInTheDocument();
    expect(screen.queryByText('Costo')).not.toBeInTheDocument();
  });

  it('desde afuera del local no se puede anular', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER', 'REMOTE'),
      ...handlers,
    });
    renderApp('/ventas/1024');
    expect(await screen.findByRole('button', { name: /solo desde el local/ })).toBeDisabled();
  });
});

describe('medios de pago (Configuración)', () => {
  it('el efectivo no se desactiva y el crédito tiene recargo', async () => {
    mockApi({
      'GET /api/auth/me': () => sessionReply('OWNER'),
      'GET /api/settings': () => ({
        body: {
          storeName: 'Kiosco',
          priceRoundingStep: '10',
          businessDayCutoff: '06:00',
          updatedAt: '2026-11-18T10:00:00.000Z',
          updatedBy: null,
        },
      }),
      'GET /api/payment-methods': () => ({ body: { items: METHODS } }),
    });
    renderApp('/configuracion');
    expect(await screen.findByText('Siempre activo')).toBeInTheDocument();
    expect(screen.getByLabelText('Recargo (%)')).toHaveValue('10');
    expect(screen.getAllByRole('button', { name: 'Desactivar' })).toHaveLength(4);
  });
});
