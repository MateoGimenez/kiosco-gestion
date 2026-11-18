import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers';

describe('GET /api/health', () => {
  it('responde 200 { status: "ok" } sin sesión y sin datos internos', async () => {
    const res = await request(buildTestApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('errores', () => {
  it('404 en JSON para una ruta de /api que no existe', async () => {
    const res = await request(buildTestApp()).get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'La ruta no existe.' } });
  });

  it('400 VALIDATION_ERROR con un JSON roto, sin filtrar detalles internos', async () => {
    const res = await request(buildTestApp())
      .post('/api/nada')
      .set('Content-Type', 'application/json')
      .send('{roto');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|SyntaxError/);
  });

  it('413 si el cuerpo supera el límite', async () => {
    const res = await request(buildTestApp())
      .post('/api/nada')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('seguridad base', () => {
  it('la puerta local no manda HSTS ni upgrade-insecure-requests', async () => {
    const res = await request(buildTestApp('local')).get('/api/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('la puerta remota manda HSTS', async () => {
    const res = await request(buildTestApp('remote')).get('/api/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });
});
