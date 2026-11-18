// Ayudas para los tests de la API: configuración de prueba, app por puerta y pedidos "bien formados".
import type { Express } from 'express';
import pino from 'pino';
import request, { type Test } from 'supertest';
import { createApp, type CreateAppOptions } from '../src/app';
import type { Channel } from '../src/channel';
import { loadConfig, type AppConfig } from '../src/config';
import type { PrismaClient } from '../src/generated/client';

export const LOCAL_HOST = 'localhost:3000';
export const REMOTE_HOST = 'kiosco.tail1234.ts.net';

/** Configuración de prueba: bcrypt rápido, una subred de WiFi y la puerta remota prendida. */
export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://kiosco:x@localhost:5432/kiosco_test?schema=public',
    JWT_SECRET: 'a'.repeat(48),
    BCRYPT_COST: '4',
    LOCAL_CIDRS: '127.0.0.1/32,::1/128,192.168.1.0/24',
    LOCAL_ALLOWED_HOSTS: 'localhost,127.0.0.1,::1,192.168.1.10',
    REMOTE_ENABLED: 'true',
    REMOTE_HOST,
    ...overrides,
  });
}

/** Prisma de mentira para los tests unitarios (sin base de datos). */
export function stubPrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  return { $queryRaw: () => Promise.resolve([{ '?column?': 1 }]), ...overrides } as never;
}

export interface BuildOptions extends Partial<Omit<CreateAppOptions, 'channel'>> {
  configOverrides?: Record<string, string>;
}

/** App para tests: logger en silencio y sin tocar el .env real. */
export function buildTestApp(channel: Channel = 'local', options: BuildOptions = {}): Express {
  const { configOverrides, ...rest } = options;
  return createApp({
    channel,
    logger: pino({ level: 'silent' }),
    config: testConfig(configOverrides),
    prisma: stubPrisma(),
    ...rest,
  });
}

/** Cliente de pruebas de una puerta: agrega Host, X-Kiosco, Origin y la cookie, como el navegador. */
export function clientFor(app: Express, channel: Channel) {
  const host = channel === 'local' ? LOCAL_HOST : REMOTE_HOST;
  const origin = channel === 'local' ? `http://${LOCAL_HOST}` : `https://${REMOTE_HOST}`;
  const withHeaders = (test: Test, cookie?: string, mutating = false) => {
    test.set('Host', host);
    if (mutating) test.set('X-Kiosco', '1').set('Origin', origin);
    if (cookie) test.set('Cookie', cookie);
    return test;
  };
  return {
    host,
    origin,
    get: (path: string, cookie?: string) => withHeaders(request(app).get(path), cookie),
    post: (path: string, body?: unknown, cookie?: string) => {
      const t = withHeaders(request(app).post(path), cookie, true);
      return body === undefined ? t : t.send(body as object);
    },
    patch: (path: string, body?: unknown, cookie?: string) =>
      withHeaders(request(app).patch(path), cookie, true).send(body as object),
  };
}

/** Nombre=valor de la cookie de sesión de una respuesta (para el siguiente pedido). */
export function sessionCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = list.find((c) => /kiosco_sid=/.test(c));
  if (!cookie) throw new Error('La respuesta no trae cookie de sesión');
  return cookie.split(';')[0]!;
}
