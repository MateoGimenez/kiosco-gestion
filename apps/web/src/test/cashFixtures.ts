// Datos simulados de la etapa 4 (siguen los ejemplos de docs/api/caja.md 3, 10.6 y 11).
import { mockApi, sessionReply, type MockHandler, type MockReply } from './helpers';

export const OPEN_SESSION_PUBLIC = {
  id: 8,
  shift: 'AFTERNOON',
  businessDate: '2026-11-26',
  status: 'OPEN',
  openedAt: '2026-11-26T20:00:05.000Z',
  openedBy: { id: 5, fullName: 'Juan Ruiz' },
};

export const OPEN_SESSION = {
  ...OPEN_SESSION_PUBLIC,
  openingCash: '5000.00',
  closedAt: null,
  closedBy: null,
};

export function currentReply(
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE',
  extra: { stale?: boolean; canClose?: boolean; open?: boolean } = {},
): MockReply {
  const { stale = false, canClose = true, open = true } = extra;
  const base = stale
    ? { ...OPEN_SESSION, id: 6, shift: 'NIGHT', businessDate: '2026-11-25' }
    : OPEN_SESSION;
  const session = role === 'EMPLOYEE' ? { ...base } : base; // el empleado puede recibir de más: el mapeo lo descarta
  return {
    body: {
      cashSession: open ? session : null,
      currentBusinessDate: '2026-11-26',
      isFromPreviousBusinessDay: open && stale,
      canClose: open && canClose,
    },
  };
}

/** Detalle del ejemplo A del plan: esperado $ 7.500, contado $ 7.400, diferencia −$ 100. */
export const CLOSED_DETAIL = {
  ...OPEN_SESSION,
  status: 'CLOSED',
  closedAt: '2026-11-26T23:01:40.000Z',
  closedBy: { id: 5, fullName: 'Juan Ruiz' },
  countedCash: '7400.00',
  expectedCash: '7500.00',
  difference: '-100.00',
  closingNote: null,
  openingVsPreviousClose: null,
  summary: {
    openingCash: '5000.00',
    cashSales: '3000.00',
    cashIn: '0.00',
    cashOut: '500.00',
    voidRefunds: '0.00',
    expectedCash: '7500.00',
  },
  paymentSummary: [
    {
      paymentMethod: { id: 1, kind: 'CASH', name: 'Efectivo' },
      paymentCount: 1,
      amount: '3000.00',
      surchargeAmount: '0.00',
      chargedAmount: '3000.00',
      voidedChargedAmount: '0.00',
    },
    {
      paymentMethod: { id: 2, kind: 'DEBIT_CARD', name: 'Débito' },
      paymentCount: 1,
      amount: '2000.00',
      surchargeAmount: '0.00',
      chargedAmount: '2000.00',
      voidedChargedAmount: '0.00',
    },
  ],
  sales: {
    count: 2,
    voidedCount: 0,
    total: '5000.00',
    voidedTotal: '0.00',
    surchargeAmount: '0.00',
  },
  movements: [
    {
      id: 91,
      cashSessionId: 8,
      direction: 'OUT',
      reason: 'EXPENSE',
      description: 'Pago limpieza',
      amount: '500.00',
      user: { id: 4, fullName: 'Lucía Pérez' },
      createdAt: '2026-11-26T22:15:00.000Z',
      sale: null,
      supplierAccountEntryId: null,
    },
  ],
  notes: [],
};

/** Lo que recibe el empleado al cerrar (10.6). */
export const CLOSED_PUBLIC = {
  ...OPEN_SESSION_PUBLIC,
  status: 'CLOSED',
  closedAt: '2026-11-26T23:01:40.000Z',
  closedBy: { id: 5, fullName: 'Juan Ruiz' },
  countedCash: '7400.00',
};

/** Detalle de la caja abierta (esperado "hasta ahora"). */
export const OPEN_DETAIL = {
  ...CLOSED_DETAIL,
  status: 'OPEN',
  closedAt: null,
  closedBy: null,
  countedCash: null,
  expectedCash: null,
  difference: null,
};

export const LIST_ITEM = {
  ...CLOSED_DETAIL,
  noteCount: 0,
};

/** Se abrió con $ 5.000 y en el cierre anterior se contaron $ 4.000. */
export const OPENING_DIFF = {
  previousCashSessionId: 6,
  previousCountedCash: '4000.00',
  difference: '1000.00',
};

export function mockCashApi(
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE',
  extra: Record<string, MockHandler> = {},
  current: Parameters<typeof currentReply>[1] = {},
) {
  return mockApi({
    'GET /api/auth/me': () => sessionReply(role),
    'GET /api/cash-sessions/current': () => currentReply(role, current),
    'GET /api/cash-sessions/8': () => ({ body: OPEN_DETAIL }),
    'GET /api/cash-sessions': () => ({
      body: { items: [LIST_ITEM], page: 1, pageSize: 20, total: 1 },
    }),
    'GET /api/sales': () => ({ body: { items: [], page: 1, pageSize: 25, total: 0 } }),
    'GET /api/payment-methods': () => ({ body: { items: [] } }),
    ...extra,
  });
}
