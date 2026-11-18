import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, stubPrisma } from './helpers';

describe('GET /api/health', () => {
  it('responde 200 { status: "ok" } sin sesión y sin datos internos', async () => {
    const res = await clientFor(buildTestApp(), 'local').get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('503 DATABASE_UNAVAILABLE si la base no responde', async () => {
    const prisma = stubPrisma({ $queryRaw: () => Promise.reject(new Error('conexión caída')) });
    const res = await clientFor(buildTestApp('local', { prisma }), 'local').get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(JSON.stringify(res.body)).not.toMatch(/conexión caída/);
  });
});

describe('errores', () => {
  it('404 en JSON para una ruta de /api que no existe', async () => {
    const res = await clientFor(buildTestApp(), 'local').get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'La ruta no existe.' } });
  });

  it('400 VALIDATION_ERROR con un JSON roto, sin filtrar detalles internos', async () => {
    const res = await clientFor(buildTestApp(), 'local')
      .post('/api/nada')
      .set('Content-Type', 'application/json')
      .send('{roto');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/stack|node_modules|SyntaxError/);
  });

  it('413 si el cuerpo supera el límite', async () => {
    const res = await clientFor(buildTestApp(), 'local')
      .post('/api/nada')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ x: 'a'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('415 si el pedido trae cuerpo que no es JSON', async () => {
    const res = await clientFor(buildTestApp(), 'local')
      .post('/api/auth/login')
      .set('Content-Type', 'text/plain')
      .send('hola');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });
});

describe('seguridad base', () => {
  it('la puerta local no manda HSTS ni upgrade-insecure-requests', async () => {
    const res = await clientFor(buildTestApp('local'), 'local').get('/api/health');
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.headers['content-security-policy']).not.toMatch(/upgrade-insecure-requests/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('la CSP no admite fuentes externas (sin https: en font, style ni img)', async () => {
    for (const channel of ['local', 'remote'] as const) {
      const res = await clientFor(buildTestApp(channel), channel).get('/api/health');
      const csp = String(res.headers['content-security-policy']);
      expect(csp).toMatch(/default-src 'self'/);
      for (const name of ['font-src', 'style-src', 'img-src']) {
        const directive = csp.split(';').find((d) => d.startsWith(name))!;
        expect(directive, name).not.toMatch(/https:/);
      }
    }
  });

  it('la puerta remota manda HSTS', async () => {
    const res = await clientFor(buildTestApp('remote'), 'remote').get('/api/health');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('no hay CORS: un OPTIONS con Origin ajeno no recibe Access-Control-Allow-*', async () => {
    const res = await request(buildTestApp())
      .options('/api/health')
      .set('Host', 'localhost:3000')
      .set('Origin', 'https://malo.example');
    const names = Object.keys(res.headers);
    expect(names.some((n) => n.startsWith('access-control-allow'))).toBe(false);
  });
});

describe('Host y CSRF', () => {
  it('403 HOST_NOT_ALLOWED con un Host ajeno (también en GET)', async () => {
    const res = await request(buildTestApp()).get('/api/health').set('Host', 'malo.example.com');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('en la puerta remota solo vale REMOTE_HOST', async () => {
    const app = buildTestApp('remote');
    const bad = await request(app).get('/api/health').set('Host', 'localhost:3000');
    expect(bad.body.error.code).toBe('HOST_NOT_ALLOWED');
    const ok = await clientFor(app, 'remote').get('/api/health');
    expect(ok.status).toBe(200);
  });

  const login = { username: 'maria', password: 'x' };

  it('403 CSRF_CHECK_FAILED sin X-Kiosco', async () => {
    const res = await request(buildTestApp())
      .post('/api/auth/login')
      .set('Host', 'localhost:3000')
      .set('Origin', 'http://localhost:3000')
      .send(login);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('403 CSRF_CHECK_FAILED sin Origin o con un Origin ajeno', async () => {
    const app = buildTestApp();
    const base = () =>
      request(app).post('/api/auth/login').set('Host', 'localhost:3000').set('X-Kiosco', '1');
    expect((await base().send(login)).body.error.code).toBe('CSRF_CHECK_FAILED');
    const foreign = await base().set('Origin', 'http://malo.example').send(login);
    expect(foreign.body.error.code).toBe('CSRF_CHECK_FAILED');
    const otherPort = await base().set('Origin', 'http://localhost:9999').send(login);
    expect(otherPort.body.error.code).toBe('CSRF_CHECK_FAILED');
  });

  it('en la remota el Origin tiene que ser https://REMOTE_HOST', async () => {
    const res = await request(buildTestApp('remote'))
      .post('/api/auth/logout')
      .set('Host', 'kiosco.tail1234.ts.net')
      .set('X-Kiosco', '1')
      .set('Origin', 'http://kiosco.tail1234.ts.net');
    expect(res.body.error.code).toBe('CSRF_CHECK_FAILED');
  });
});

describe('clasificación de red (puerta local)', () => {
  const at = (address: string) => buildTestApp('local', { remoteAddressOverride: () => address });
  const probe = (address: string) => clientFor(at(address), 'local').get('/api/health');

  it('acepta IP de la subred del WiFi, también como ::ffff:', async () => {
    expect((await probe('192.168.1.5')).status).toBe(200);
    expect((await probe('::ffff:192.168.1.5')).status).toBe(200);
    expect((await probe('::1')).status).toBe(200);
  });

  it('rechaza IP de internet, de Tailscale y direcciones ilegibles', async () => {
    for (const address of [
      '8.8.8.8',
      '::ffff:100.64.0.1',
      '100.101.102.103',
      'fd7a:115c:a1e0::5',
      'basura',
    ]) {
      const res = await probe(address);
      expect(res.status, address).toBe(403);
      expect(res.body.error.code).toBe('NETWORK_NOT_ALLOWED');
    }
  });

  it('la puerta remota ignora X-Forwarded-For: sigue siendo remota', async () => {
    const app = buildTestApp('remote', { remoteAddressOverride: () => '8.8.8.8' });
    const res = await clientFor(app, 'remote')
      .get('/api/health')
      .set('X-Forwarded-For', '192.168.1.5');
    expect(res.status).toBe(200); // no se aplica LOCAL_CIDRS a la remota
  });
});
