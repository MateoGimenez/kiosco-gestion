import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from './api';

function mockFetch(response: Response | Error) {
  const fn = vi.fn(() =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('cliente HTTP', () => {
  it('en GET manda credentials same-origin y no agrega X-Kiosco', async () => {
    const fetchMock = mockFetch(Response.json({ status: 'ok' }));
    await expect(api.get('/api/health')).resolves.toEqual({ status: 'ok' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.credentials).toBe('same-origin');
    expect(init.headers).not.toHaveProperty('X-Kiosco');
  });

  it('en POST agrega X-Kiosco y Content-Type JSON', async () => {
    const fetchMock = mockFetch(Response.json({ id: 1 }, { status: 201 }));
    await api.post('/api/things', { name: 'x' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'X-Kiosco': '1', 'Content-Type': 'application/json' });
    expect(init.body).toBe('{"name":"x"}');
  });

  it('interpreta el formato de error de la API', async () => {
    mockFetch(
      Response.json(
        { error: { code: 'FORBIDDEN', message: 'No tenés permiso.' } },
        { status: 403 },
      ),
    );
    const error = await api.get('/api/x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: 'FORBIDDEN', message: 'No tenés permiso.' });
  });

  it('avisa en español cuando no hay conexión', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await api.get('/api/x').catch((e: unknown) => e);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
