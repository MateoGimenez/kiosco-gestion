// Pantallas de la etapa 5: compras, adjuntos, cuenta corriente y pedido sugerido (API simulada).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { attachmentProblem } from '../lib/purchases/attachments';
import { mockApi, renderApp, sessionReply, type MockHandler } from '../test/helpers';

const SUPPLIER = {
  id: 3,
  name: 'Distribuidora Sur',
  phone: '1123456789',
  whatsappPhone: '5491123456789',
  email: null,
  taxId: null,
  visitDays: ['TUE'],
  notes: null,
  isActive: true,
  balance: '25300.00',
  hasOpeningBalance: false,
  defaultProductCount: 2,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};
const PRODUCT = {
  id: 12,
  name: 'Coca-Cola 500 ml',
  barcode: '7790001',
  saleUnit: 'UNIT',
  vatRatePercent: '21.00',
  unitsPerPack: null,
  stockQuantity: '4.000',
  defaultSupplier: null,
  isActive: true,
};
const SAVED = {
  purchase: {
    id: 21,
    status: 'CONFIRMED',
    supplier: { id: 3, name: 'Distribuidora Sur' },
    total: '24200.00',
  },
  isReplay: false,
  costChanges: [
    {
      productId: 12,
      productName: 'Coca-Cola 500 ml',
      previousNetCostPrice: '780.00',
      newNetCostPrice: '833.33',
      previousCostPrice: '943.80',
      newCostPrice: '1008.33',
      netCostChangePercent: '6.84',
      salePrice: '1450.00',
    },
  ],
  supplierBalance: '24200.00',
};

function purchaseHandlers(extra: Record<string, MockHandler> = {}) {
  return {
    'GET /api/auth/me': () => sessionReply('MANAGER'),
    'GET /api/suppliers': () => ({ body: { items: [SUPPLIER], page: 1, pageSize: 200, total: 1 } }),
    'GET /api/products/search': () => ({
      body: {
        matchedBy: 'BARCODE',
        isInactiveBarcode: false,
        items: [
          {
            id: 12,
            name: PRODUCT.name,
            barcode: '7790001',
            saleUnit: 'UNIT',
            salePrice: '1450',
            stockQuantity: '4',
            isMiscellaneous: false,
          },
        ],
      },
    }),
    'GET /api/products/12': () => ({ body: PRODUCT }),
    ...extra,
  };
}

async function addBulkLine(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('option', { name: /Distribuidora Sur/ });
  await user.selectOptions(screen.getByLabelText('Proveedor'), '3');
  await user.type(screen.getByLabelText(/Buscar el producto/), '7790001{Enter}');
  await user.click(await screen.findByRole('radio', { name: 'Por bulto' }));
  await user.type(screen.getByLabelText('Bultos'), '2');
  await user.type(screen.getByLabelText('Unidades por bulto'), '12');
  await user.type(screen.getByLabelText('Costo sin IVA de un bulto'), '10000');
}

describe('Cargar una compra', () => {
  it('2 bultos de 12 a $ 10.000 con IVA 21 % dan $ 24.200 y se puede cambiar a unidad', async () => {
    mockApi(purchaseHandlers());
    renderApp('/compras/nueva');
    const user = userEvent.setup({ delay: null });
    await addBulkLine(user);
    expect(screen.getByTestId('purchase-total')).toHaveTextContent('$ 24.200,00');
    expect(screen.getByText(/Entran 24/)).toBeInTheDocument();
    expect(screen.getByText(/\$ 833,33 cada una/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Por unidad' }));
    expect(screen.queryByLabelText('Bultos')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Cantidad'), '20');
    await user.type(screen.getByLabelText('Costo sin IVA por unidad'), '450');
    // 20 × 450 = 9.000 + 21 % = 10.890
    expect(screen.getByTestId('purchase-total')).toHaveTextContent('$ 10.890,00');
  });

  it('rechaza una fecha futura sin enviar nada', async () => {
    const post = vi.fn(() => ({ status: 201, body: SAVED }));
    mockApi(purchaseHandlers({ 'POST /api/purchases': post }));
    renderApp('/compras/nueva');
    const user = userEvent.setup({ delay: null });
    await addBulkLine(user);
    fireEvent.change(screen.getByLabelText('Fecha del comprobante'), {
      target: { value: '2999-01-01' },
    });
    await user.click(screen.getByRole('button', { name: 'Guardar la compra' }));
    expect(await screen.findByText('La fecha no puede ser posterior a hoy.')).toBeInTheDocument();
    expect(post).not.toHaveBeenCalled();
  });

  it('un doble envío manda un solo POST y muestra los cambios de costo', async () => {
    const post = vi.fn(() => ({ status: 201, body: SAVED }));
    mockApi(purchaseHandlers({ 'POST /api/purchases': post }));
    renderApp('/compras/nueva');
    const user = userEvent.setup({ delay: null });
    await addBulkLine(user);
    const save = screen.getByRole('button', { name: 'Guardar la compra' });
    await user.dblClick(save);
    expect(await screen.findByText('Compra guardada')).toBeInTheDocument();
    expect(post).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Revisar precio' })).toHaveAttribute(
      'href',
      '/pricing/12',
    );
    expect(screen.getByText('+6,84 %')).toBeInTheDocument();
  });

  it('desde afuera, "pagar ahora" con efectivo de la caja está deshabilitado', async () => {
    mockApi({
      ...purchaseHandlers(),
      'GET /api/auth/me': () => sessionReply('MANAGER', 'REMOTE'),
    });
    renderApp('/compras/nueva');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('checkbox', { name: 'Pagar ahora' }));
    const option = screen.getByRole('option', { name: /Efectivo de la caja/ });
    expect(option).toBeDisabled();
    expect(option).toHaveTextContent('solo desde el local');
  });
});

describe('Adjuntos', () => {
  it('avisa si el tipo o el tamaño no sirven', () => {
    expect(attachmentProblem({ name: 'a.gif', size: 100, type: 'image/gif' })).toMatch(
      /no se puede subir/,
    );
    expect(attachmentProblem({ name: 'a.heic', size: 100, type: 'image/heic' })).toMatch(
      /como JPG/,
    );
    expect(
      attachmentProblem({ name: 'big.jpg', size: 11 * 1024 * 1024, type: 'image/jpeg' }),
    ).toMatch(/más de 10 MB/);
    expect(attachmentProblem({ name: 'ok.pdf', size: 1000, type: 'application/pdf' })).toBeNull();
  });

  it('en la compra, un archivo inválido se rechaza con un mensaje y uno válido se previsualiza', async () => {
    mockApi(purchaseHandlers());
    renderApp('/compras/nueva');
    const input = (await screen.findByText('Elegir archivo')).querySelector('input')!;
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'raro.gif', { type: 'image/gif' })] },
    });
    expect(await screen.findByText(/raro\.gif» no se puede subir/)).toBeInTheDocument();
    fireEvent.change(input, {
      target: { files: [new File(['%PDF-'], 'factura.pdf', { type: 'application/pdf' })] },
    });
    const list = await screen.findByRole('list', { name: 'Archivos para adjuntar' });
    expect(within(list).getByText('factura.pdf')).toBeInTheDocument();
  });
});

describe('Cuenta corriente', () => {
  const account = {
    supplier: { id: 3, name: 'Distribuidora Sur', isActive: true },
    balance: '25300.00',
    items: [
      {
        id: 12,
        supplierId: 3,
        type: 'PAYMENT',
        amount: '-5000.00',
        entryDate: '2026-11-27',
        balanceAfter: '25300.00',
        purchase: null,
        paymentSource: 'CASH_REGISTER',
        reference: null,
        description: null,
        cashMovement: { id: 95, cashSessionId: 9 },
        user: { id: 4, fullName: 'Lucía Pérez' },
        createdAt: '2026-11-27T15:10:00.000Z',
      },
    ],
    page: 1,
    pageSize: 50,
    total: 1,
  };
  const handlers = (role: 'OWNER' | 'MANAGER', access = 'LOCAL') => ({
    'GET /api/auth/me': () => sessionReply(role, access),
    'GET /api/suppliers/3': () => ({ body: SUPPLIER }),
    'GET /api/suppliers/3/account': () => ({ body: account }),
  });

  it('saldo inicial y correcciones solo para el dueño', async () => {
    mockApi(handlers('MANAGER'));
    renderApp('/proveedores/3');
    expect(
      await screen.findByRole('list', { name: 'Movimientos de la cuenta' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cargar saldo inicial' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Corregir la cuenta' })).not.toBeInTheDocument();
  });

  it('el dueño ve saldo inicial y correcciones', async () => {
    mockApi(handlers('OWNER'));
    renderApp('/proveedores/3');
    expect(await screen.findByRole('button', { name: 'Cargar saldo inicial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Corregir la cuenta' })).toBeInTheDocument();
  });

  it('el pago con efectivo de la caja queda deshabilitado en remoto', async () => {
    mockApi(handlers('MANAGER', 'REMOTE'));
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar un pago' }));
    expect(screen.getByRole('option', { name: /Efectivo de la caja/ })).toBeDisabled();
    expect(screen.getByText(/Solo desde el local/)).toBeInTheDocument();
  });

  it('un pago mayor que la deuda pide confirmación y reenvía con el mismo id', async () => {
    const bodies: Record<string, unknown>[] = [];
    mockApi({
      ...handlers('MANAGER'),
      'POST /api/suppliers/3/payments': (init) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        if (!body.confirmOverpayment) {
          return {
            status: 422,
            body: {
              error: {
                code: 'PAYMENT_EXCEEDS_BALANCE',
                message: 'x',
                details: { balance: '25300.00', amount: '30000.00', balanceAfter: '-4700.00' },
              },
            },
          };
        }
        return {
          status: 201,
          body: { entry: account.items[0], balance: '-4700.00', isReplay: false },
        };
      },
    });
    renderApp('/proveedores/3');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Registrar un pago' }));
    await user.clear(screen.getByLabelText('Monto pagado'));
    await user.type(screen.getByLabelText('Monto pagado'), '30000');
    await user.selectOptions(screen.getByLabelText('De dónde sale la plata'), 'BANK_TRANSFER');
    await user.click(screen.getByRole('button', { name: 'Registrar pago' }));
    expect(await screen.findByText('El pago es mayor que la deuda')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar igual' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]?.confirmOverpayment).toBe(true);
    expect(bodies[1]?.clientRequestId).toBe(bodies[0]?.clientRequestId);
  });
});

describe('Pedido sugerido', () => {
  const order = {
    supplier: { id: 3, name: 'Distribuidora Sur', isActive: true, whatsappPhone: '5491123456789' },
    storeName: 'Kiosco La Esquina',
    items: [
      {
        productId: 12,
        name: 'Coca-Cola 500 ml',
        barcode: null,
        saleUnit: 'UNIT',
        stockQuantity: '3.000',
        minStock: '10.000',
        shortfall: '7.000',
        suggestedQuantity: '7.000',
        unitsPerPack: '12.000',
      },
    ],
    isTruncated: false,
    text: '',
    whatsappUrl: null,
  };

  it('copia el texto con lo que se ve y arma el link de WhatsApp', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    mockApi({
      'GET /api/auth/me': () => sessionReply('MANAGER'),
      'GET /api/suppliers/3/suggested-order': () => ({ body: order }),
    });
    renderApp('/proveedores/3/pedido');
    const user = userEvent.setup({ delay: null });
    const qty = await screen.findByLabelText('Cantidad a pedir de Coca-Cola 500 ml');
    await user.clear(qty);
    await user.type(qty, '12');
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    const expected =
      'Hola, Distribuidora Sur. Pedido de Kiosco La Esquina:\n- 12 x Coca-Cola 500 ml\nGracias.';
    expect(await navigator.clipboard.readText()).toBe(expected);
    const link = screen.getByRole('link', { name: 'Abrir WhatsApp' });
    expect(link).toHaveAttribute(
      'href',
      `https://wa.me/5491123456789?text=${encodeURIComponent(expected)}`,
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });
});
