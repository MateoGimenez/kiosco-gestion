// Datos simulados de la etapa 3 (siguen el contrato de docs/api/ventas.md y caja.md).
import { vi } from 'vitest';
import { mockApi, sessionReply, type MockHandler, type MockReply } from './helpers';

export const COCA = {
  id: 12,
  name: 'Coca-Cola 500 ml',
  barcode: '7790001',
  saleUnit: 'UNIT',
  salePrice: '1450.00',
  stockQuantity: '10.000',
  isMiscellaneous: false,
};
export const QUESO = {
  id: 18,
  name: 'Queso cremoso',
  barcode: '7790002',
  saleUnit: 'KG',
  salePrice: '4990.00',
  stockQuantity: '5.000',
  isMiscellaneous: false,
};
export const VINO = {
  id: 31,
  name: 'Vino Malbec 750 ml',
  barcode: '7790031',
  saleUnit: 'UNIT',
  salePrice: '6000.00',
  stockQuantity: '8.000',
  isMiscellaneous: false,
};
export const FERNET = {
  id: 44,
  name: 'Fernet 450 ml',
  barcode: '7790044',
  saleUnit: 'UNIT',
  salePrice: '4000.00',
  stockQuantity: '0.000',
  isMiscellaneous: false,
};
export const VARIOS = {
  id: 1,
  name: 'Varios',
  barcode: null,
  saleUnit: 'UNIT',
  salePrice: '0.00',
  stockQuantity: '0.000',
  isMiscellaneous: true,
};

export const METHODS = [
  {
    id: 1,
    kind: 'CASH',
    name: 'Efectivo',
    surchargePercent: '0.00',
    isActive: true,
    sortOrder: 1,
    updatedAt: '2026-11-26T09:00:00.000Z',
  },
  {
    id: 2,
    kind: 'DEBIT_CARD',
    name: 'Débito',
    surchargePercent: '0.00',
    isActive: true,
    sortOrder: 2,
    updatedAt: '2026-11-26T09:00:00.000Z',
  },
  {
    id: 3,
    kind: 'CREDIT_CARD',
    name: 'Crédito',
    surchargePercent: '10.00',
    isActive: true,
    sortOrder: 3,
    updatedAt: '2026-11-26T09:00:00.000Z',
  },
  {
    id: 4,
    kind: 'QR',
    name: 'QR Mercado Pago',
    surchargePercent: '0.00',
    isActive: true,
    sortOrder: 4,
    updatedAt: '2026-11-26T09:00:00.000Z',
  },
  {
    id: 5,
    kind: 'TRANSFER',
    name: 'Transferencia',
    surchargePercent: '0.00',
    isActive: true,
    sortOrder: 5,
    updatedAt: '2026-11-26T09:00:00.000Z',
  },
];

export function openCash(withOpeningCash: boolean): MockReply {
  const base = {
    id: 7,
    shift: 'MORNING',
    businessDate: '2026-11-26',
    status: 'OPEN',
    openedAt: '2026-11-26T13:02:11.000Z',
    openedBy: { id: 5, fullName: 'Juan Ruiz' },
  };
  return {
    body: {
      cashSession: withOpeningCash
        ? { ...base, openingCash: '5000.00', closedAt: null, closedBy: null }
        : base,
      currentBusinessDate: '2026-11-26',
      isFromPreviousBusinessDay: false,
      canClose: true,
    },
  };
}

export function barcodeReply(product: object): MockReply {
  return { body: { matchedBy: 'BARCODE', items: [product], isInactiveBarcode: false } };
}

/** Respuesta del ejemplo 2 de ventas.md: $ 9.500 con $ 5.000 en el posnet. */
export function saleCreated(): MockReply {
  return {
    status: 201,
    body: {
      sale: {
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
        items: [],
        payments: [
          {
            id: 3301,
            paymentMethod: { id: 1, kind: 'CASH', name: 'Efectivo' },
            amount: '4500.00',
            surchargeBase: '5000.00',
            surchargePercent: '0.00',
            surchargeAmount: '0.00',
            chargedAmount: '4500.00',
          },
          {
            id: 3302,
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
      },
      isReplay: false,
      change: '500.00',
      stockWarnings: [],
    },
  };
}

type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE';

/** API simulada de la pantalla de venta. `extra` suma o pisa rutas. */
export function mockSalesApi(role: Role, extra: Record<string, MockHandler> = {}) {
  return mockApi({
    'GET /api/auth/me': () => sessionReply(role),
    'GET /api/cash-sessions/current': () => openCash(role !== 'EMPLOYEE'),
    'GET /api/payment-methods': () => ({ body: { items: METHODS } }),
    'GET /api/products/miscellaneous': () => ({ body: VARIOS }),
    [`GET /api/products/search?q=${COCA.barcode}&limit=5`]: () => barcodeReply(COCA),
    [`GET /api/products/search?q=${QUESO.barcode}&limit=5`]: () => barcodeReply(QUESO),
    [`GET /api/products/search?q=${VINO.barcode}&limit=5`]: () => barcodeReply(VINO),
    [`GET /api/products/search?q=${FERNET.barcode}&limit=5`]: () => barcodeReply(FERNET),
    ...extra,
  });
}

/** Cambia `fetch` para que `POST /api/sales` pase por `onPost` (un pedido a la vez, en orden). */
export function interceptSalePost(
  base: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  onPost: (body: Record<string, unknown>) => Promise<Response>,
) {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET').toUpperCase() === 'POST' && String(input) === '/api/sales') {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        posts.push(body);
        return onPost(body);
      }
      return base(input, init);
    }),
  );
  return posts;
}

export function jsonResponse(reply: MockReply): Response {
  return new Response(JSON.stringify(reply.body ?? {}), {
    status: reply.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
