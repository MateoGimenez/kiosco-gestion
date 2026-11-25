// Cache-Control en todo /api y errores al validar una respuesta (sin base de datos).
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createErrorHandler, parseResponse, ResponseValidationError } from '../src/errors';
import { buildTestApp, LOCAL_HOST } from './helpers';

describe('parseResponse', () => {
  const Schema = z.object({ id: z.number(), name: z.string() });

  it('descarta las claves de más', () => {
    expect(parseResponse(Schema, { id: 1, name: 'x', costo: 5 })).toEqual({ id: 1, name: 'x' });
  });

  it('si no cumple el esquema lanza un error interno (no un ZodError)', () => {
    expect(() => parseResponse(Schema, { id: 'x' })).toThrow(ResponseValidationError);
  });

  it('el manejador responde 500 genérico, sin nombres internos, y loguea el detalle', async () => {
    const logged: unknown[] = [];
    const logger = pino({ level: 'silent' });
    logger.error = ((...args: unknown[]) => logged.push(args)) as never;
    const app = express();
    app.get('/x', () => {
      parseResponse(Schema, { id: 'x', secretoInterno: 1 });
    });
    app.use(createErrorHandler(logger));
    const res = await request(app).get('/x');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toMatch(/id|name|zod|invalid/i);
    expect(logged.length).toBeGreaterThan(0);
  });

  it('un ZodError de un REQUEST sigue siendo 400', async () => {
    const app = express();
    app.get('/x', () => {
      Schema.parse({});
    });
    app.use(createErrorHandler(pino({ level: 'silent' })));
    expect((await request(app).get('/x')).status).toBe(400);
  });
});

describe('Cache-Control en /api', () => {
  it('lo llevan hasta las rutas inexistentes y los errores 401', async () => {
    const app = buildTestApp('local');
    for (const path of [
      '/api/products',
      '/api/settings',
      '/api/categories',
      '/api/stock/restock',
      '/api/nada',
    ]) {
      const res = await request(app).get(path).set('Host', LOCAL_HOST);
      expect(res.headers['cache-control'], path).toBe('no-store');
      expect(res.headers.pragma, path).toBe('no-cache');
    }
  });
});
