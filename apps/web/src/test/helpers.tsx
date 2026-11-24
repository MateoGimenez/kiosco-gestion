// Ayudas para los tests de pantallas: API simulada y render de la app completa.
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../lib/AuthProvider';
import { appRoutes } from '../router';

export interface MockReply {
  status?: number;
  body?: unknown;
}
export type MockHandler = (init: RequestInit | undefined) => MockReply;

/** Reemplaza fetch: cada clave es "MÉTODO /ruta". Lo que no está responde 404. */
export function mockApi(handlers: Record<string, MockHandler>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${(init?.method ?? 'GET').toUpperCase()} ${String(input)}`;
    const reply = handlers[key]?.(init) ?? {
      status: 404,
      body: { error: { code: 'NOT_FOUND', message: 'No existe.' } },
    };
    const status = reply.status ?? 200;
    return Promise.resolve(
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(reply.body ?? {}), {
            status,
            headers: { 'Content-Type': 'application/json' },
          }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

export const UNAUTHENTICATED: MockReply = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Tenés que entrar para continuar.' } },
};

export function sessionReply(
  role: 'OWNER' | 'MANAGER' | 'EMPLOYEE',
  access = 'LOCAL',
  mustChangePassword = false,
): MockReply {
  return {
    body: {
      user: { id: 1, username: 'maria', fullName: 'María Gómez', role, mustChangePassword },
      access,
      expiresAt: '2026-11-19T10:30:00.000Z',
    },
  };
}

export function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { queryClient, router };
}
