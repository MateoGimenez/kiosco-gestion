// Devolución del proveedor (docs/api/proveedores.md 15.9): botón, formulario, resumen, confirmación y etiquetas.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CLOSED_DETAIL, mockCashApi } from '../test/cashFixtures';
import { mockApi, renderApp, sessionReply, type MockHandler } from '../test/helpers';

const SUPPLIER = {
  id: 3,
  name: 'Bebidas del Sur',
  phone: null,
  whatsappPhone: null,
  email: null,
  taxId: null,
  visitDays: [],
  notes: null,
  isActive: true,
  balance: '-15000.00',
  hasOpeningBalance: false,
  defaultProductCount: 0,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

const REFUND_ENTRY = {
  id: 14,
  supplierId: 3,
  type: 'REFUND',
  amount: '15000.00',
  entryDate: '2026-11-27',
  balanceAfter: '0.00',
  purchase: null,
  paymentSource: 'CASH_REGISTER',
  reference: null,
  description: null,
  cashMovement: { id: 96, cashSessionId: 9 },
  user: { id: 4, fullName: 'Lucía Pérez' },
  createdAt: '2026-11-27T16:30:00.000Z',
};

function account(balance: string) {
  return {
    supplier: { id: 3, name: 'Bebidas del Sur', isActive: true },
    balance,
    items: [REFUND_ENTRY],
    page: 1,
    pageSize: 50,
    total: 1,
  };
}

function handlers(balance: string, access = 'LOCAL', extra: Record<string, MockHandler> = {}) {
  return {
    'GET /api/auth/me': () => sessionReply('MANAGER', access),
    'GET /api/suppliers/3': () => ({ body: { ...SUPPLIER, balance } }),
    'GET /api/suppliers/3/account': () => ({ body: account(balance) }),
    ...extra,
  };
}

describe('Botón "Registrar devolución"', () => {
  it('con saldo a favor es el botón principal y el pago pasa a secundario', async () => {
    mockApi(handlers('-15000.00'));
    renderApp('/proveedores/3');
    const refund = await screen.findByRole('button', { name: 'Registrar devolución' });
    expect(refund).toHaveClass('btn--primary');
    expect(screen.getByRole('button', { name: 'Registrar un pago' })).toHaveClass('btn--secondary');
    expect(screen.getByText('Saldo a favor del kiosco')).toBeInTheDocument();
    expect(screen.getAllByText('$ 15.000,00').length).toBeGreaterThan(0);
  });

  it('sin saldo a favor queda como botón secundario', async () => {
    mockApi(handlers('25300.00'));
    renderApp('/proveedores/3');
    const refund = await screen.findByRole('button', { name: 'Registrar devolución' });
    expect(refund).toHaveClass('btn--secondary');
    expect(screen.getByRole('button', { name: 'Registrar un pago' })).toHaveClass('btn--primary');
  });
});

describe('Formulario de la devolución', () => {
  it('desde afuera no se ofrece el efectivo que entra a la caja', async () => {
    mockApi(handlers('-15000.00', 'REMOTE'));
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    expect(screen.getByRole('option', { name: /Efectivo que entra a la caja/ })).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Transferencia' })).toBeEnabled();
    expect(screen.getByRole('option', { name: /Efectivo que no va a la caja/ })).toBeEnabled();
    expect(screen.getByText(/Solo desde el local/)).toBeInTheDocument();
  });

  it('precarga el saldo a favor y el resumen en vivo avisa si se pasa', async () => {
    mockApi(handlers('-15000.00'));
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    const amount = screen.getByLabelText('Monto devuelto');
    expect(amount).toHaveValue('15000');
    const summary = screen.getByRole('status');
    expect(summary).toHaveTextContent('Saldo a favor ahora$ 15.000,00');
    expect(summary).toHaveTextContent('DespuésSin saldo');

    await user.clear(amount);
    await user.type(amount, '10000');
    expect(summary).toHaveTextContent('Saldo a favor después$ 5.000,00');
    expect(summary).not.toHaveTextContent('Es más que lo que te debe');

    await user.clear(amount);
    await user.type(amount, '20000');
    expect(summary).toHaveTextContent('Le vas a deber$ 5.000,00');
    expect(summary).toHaveTextContent(
      'Es más que lo que te debe: después le vas a deber $ 5.000,00.',
    );
  });

  it('la fecha solo se pide cuando la plata no entra a la caja', async () => {
    mockApi(handlers('-15000.00'));
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    expect(screen.queryByLabelText(/Fecha en que/)).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('¿Cómo te devolvió la plata?'), 'BANK_TRANSFER');
    expect(screen.getByLabelText(/Fecha en que/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('¿Cómo te devolvió la plata?'), 'CASH_REGISTER');
    expect(screen.queryByLabelText(/Fecha en que/)).not.toBeInTheDocument();
  });

  it('pide elegir el origen antes de mandar nada', async () => {
    const bodies: unknown[] = [];
    mockApi(
      handlers('-15000.00', 'LOCAL', {
        'POST /api/suppliers/3/refunds': (init) => {
          bodies.push(init?.body);
          return { status: 201, body: {} };
        },
      }),
    );
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    await user.click(screen.getAllByRole('button', { name: 'Registrar devolución' }).at(-1)!);
    expect(await screen.findByText('Elegí cómo te devolvió la plata.')).toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });

  it('una devolución mayor que el saldo a favor pide confirmación y reenvía con el mismo id', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi(
      handlers('-15000.00', 'LOCAL', {
        'POST /api/suppliers/3/refunds': (init) => {
          const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
          bodies.push(body);
          if (!body.confirmExceedsCredit) {
            return {
              status: 422,
              body: {
                error: {
                  code: 'REFUND_EXCEEDS_CREDIT',
                  message: 'x',
                  details: {
                    balance: '-15000.00',
                    credit: '15000.00',
                    amount: '20000.00',
                    balanceAfter: '5000.00',
                  },
                },
              },
            };
          }
          return {
            status: 201,
            body: {
              entry: REFUND_ENTRY,
              balance: '5000.00',
              cashMovement: {
                id: 96,
                cashSessionId: 9,
                direction: 'IN',
                reason: 'SUPPLIER_REFUND',
                description: 'x',
                amount: '20000.00',
                user: { id: 4, fullName: 'Lucía Pérez' },
                createdAt: '2026-11-27T16:30:00.000Z',
                sale: null,
                supplierAccountEntryId: 14,
                supplier: { id: 3, name: 'Bebidas del Sur' },
              },
              isReplay: false,
            },
          };
        },
      }),
    );
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    const amount = screen.getByLabelText('Monto devuelto');
    await user.clear(amount);
    await user.type(amount, '20000');
    await user.selectOptions(screen.getByLabelText('¿Cómo te devolvió la plata?'), 'CASH_REGISTER');
    await user.click(screen.getAllByRole('button', { name: 'Registrar devolución' }).at(-1)!);

    const confirm = await screen.findByRole('dialog');
    expect(
      within(confirm).getByText('La devolución es mayor que el saldo a favor'),
    ).toBeInTheDocument();
    expect(confirm).toHaveTextContent('le va a deber $ 5.000,00 al proveedor');
    await user.click(within(confirm).getByRole('button', { name: 'Registrar igual' }));

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0]).toMatchObject({ amount: '20000', source: 'CASH_REGISTER' });
    expect(bodies[0]).not.toHaveProperty('entryDate');
    expect(bodies[1]?.confirmExceedsCredit).toBe(true);
    expect(bodies[1]?.clientRequestId).toBe(bodies[0]?.clientRequestId);
    expect(await screen.findByText(/Entraron \$ 20\.000,00 a la caja abierta/)).toBeInTheDocument();
  });

  it('sin caja abierta explica qué hacer', async () => {
    mockApi(
      handlers('-15000.00', 'LOCAL', {
        'POST /api/suppliers/3/refunds': () => ({
          status: 422,
          body: { error: { code: 'CASH_SESSION_REQUIRED', message: 'x' } },
        }),
      }),
    );
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    await user.selectOptions(screen.getByLabelText('¿Cómo te devolvió la plata?'), 'CASH_REGISTER');
    await user.click(screen.getAllByRole('button', { name: 'Registrar devolución' }).at(-1)!);
    expect(
      await screen.findByText('No hay ninguna caja abierta. Abrí la caja o elegí otro origen.'),
    ).toBeInTheDocument();
  });

  it('tras "Revisar el monto" no queda ningún banner de error y se puede volver a registrar', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi(
      handlers('-15000.00', 'LOCAL', {
        'POST /api/suppliers/3/refunds': (init) => {
          bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
          return {
            status: 422,
            body: {
              error: {
                code: 'REFUND_EXCEEDS_CREDIT',
                message: 'x',
                details: { balanceAfter: '5000.00' },
              },
            },
          };
        },
      }),
    );
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar devolución' }));
    const amount = screen.getByLabelText('Monto devuelto');
    await user.clear(amount);
    await user.type(amount, '20000');
    await user.selectOptions(screen.getByLabelText('¿Cómo te devolvió la plata?'), 'CASH_REGISTER');
    await user.click(screen.getAllByRole('button', { name: 'Registrar devolución' }).at(-1)!);
    const confirm = await screen.findByRole('dialog');
    await user.click(within(confirm).getByRole('button', { name: 'Revisar el monto' }));

    expect(await screen.findByLabelText('Monto devuelto')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Se puede volver a registrar: pide la confirmación otra vez.
    await user.click(screen.getAllByRole('button', { name: 'Registrar devolución' }).at(-1)!);
    expect(
      await screen.findByText('La devolución es mayor que el saldo a favor'),
    ).toBeInTheDocument();
    expect(bodies).toHaveLength(2);
  });

  it('desde una compra anulada abre la devolución con la descripción lista', async () => {
    mockApi(handlers('-15000.00'));
    renderApp('/proveedores/3?devolucion=22');
    expect(await screen.findByLabelText('Descripción (opcional)')).toHaveValue(
      'Devuelve lo pagado de la compra #22 (anulada)',
    );
  });
});

describe('Etiquetas de la devolución', () => {
  it('la cuenta corriente muestra la fila con el monto sin signo especial y el link a la caja', async () => {
    mockApi(handlers('0.00'));
    renderApp('/proveedores/3');
    const list = await screen.findByRole('list', { name: 'Movimientos de la cuenta' });
    expect(within(list).getByText('Devolución del proveedor')).toBeInTheDocument();
    expect(list).toHaveTextContent('$ 15.000,00');
    expect(list).not.toHaveTextContent('+ $');
    expect(within(list).getByRole('link', { name: 'Ver la caja #9' })).toHaveAttribute(
      'href',
      '/caja/9',
    );
  });

  it('el detalle de la caja muestra el ingreso con el nombre del proveedor', async () => {
    mockCashApi('OWNER', {
      'GET /api/cash-sessions/8': () => ({
        body: {
          ...CLOSED_DETAIL,
          movements: [
            {
              id: 96,
              cashSessionId: 8,
              direction: 'IN',
              reason: 'SUPPLIER_REFUND',
              description: '',
              amount: '15000.00',
              user: { id: 4, fullName: 'Lucía Pérez' },
              createdAt: '2026-11-26T22:15:00.000Z',
              sale: null,
              supplierAccountEntryId: 14,
              supplier: { id: 3, name: 'Distribuidora Sur' },
            },
          ],
        },
      }),
    });
    renderApp('/caja/8');
    expect(await screen.findByText('Devolución del proveedor')).toBeInTheDocument();
    expect(screen.getByText('Distribuidora Sur')).toBeInTheDocument();
  });
});
