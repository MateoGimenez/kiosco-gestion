// Infraestructura de tests de integración contra PostgreSQL (base `kiosco_test`).
// REGLA DE ORO: nada de acá puede tocar `kiosco_dev` ni una base de producción.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../../src/db/prisma';
import type { PrismaClient } from '../../src/generated/client';

const ROOT_ENV = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../.env');

/** Error por intentar correr tests contra una base que no es de pruebas. */
export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeTestDatabaseError';
  }
}

/** Nombre de la base de una URL de PostgreSQL (sin parámetros como `?schema=public`). */
export function databaseNameOf(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UnsafeTestDatabaseError('DATABASE_URL_TEST no es una URL válida.');
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
}

/** Aborta si la URL no apunta a una base cuyo nombre termina en `_test`. Devuelve la URL. */
export function assertTestDatabaseUrl(url: string | undefined): string {
  if (!url) {
    throw new UnsafeTestDatabaseError(
      'Falta DATABASE_URL_TEST. Definila en el .env de la raíz (ver .env.example) y corré "npm run db:test:prepare".',
    );
  }
  const name = databaseNameOf(url);
  if (!name.endsWith('_test')) {
    throw new UnsafeTestDatabaseError(
      `Los tests de integración solo corren contra una base cuyo nombre termina en "_test" (la URL apunta a "${name}"). Se aborta para no tocar datos reales.`,
    );
  }
  return url;
}

/** Carga el .env de la raíz (sin pisar variables ya definidas, como en CI). */
export function loadRootEnvForTests(): void {
  if (existsSync(ROOT_ENV)) process.loadEnvFile(ROOT_ENV);
}

/** URL de la base de pruebas, ya validada. */
export function getTestDatabaseUrl(): string {
  loadRootEnvForTests();
  return assertTestDatabaseUrl(process.env.DATABASE_URL_TEST);
}

/**
 * Apunta DATABASE_URL a la base de pruebas, así cualquier código que use `getPrisma()`
 * (la API misma) también queda atado a `kiosco_test`.
 */
export function pointEnvAtTestDatabase(): string {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  return url;
}

/** Cliente de Prisma atado a la base de pruebas (validada). Acordate de `$disconnect()`. */
export function createTestPrisma(): PrismaClient {
  return createPrismaClient(getTestDatabaseUrl());
}

/**
 * Vacía todas las tablas de negocio (TRUNCATE ... RESTART IDENTITY CASCADE).
 * La lista sale de la base misma (schema actual), excluyendo `_prisma_migrations`,
 * así no hay que actualizarla cuando se agregan tablas.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  // Defensa extra: se confirma a qué base está conectado el cliente antes de borrar nada.
  const [db] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
  if (!db || !db.name.endsWith('_test')) {
    throw new UnsafeTestDatabaseError(
      `resetDatabase se negó a vaciar la base "${db?.name}": no termina en "_test".`,
    );
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename.replaceAll('"', '""')}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  // `settings` es una tabla de una sola fila que crea la migración (id = 1): se vuelve a crear con
  // los mismos valores iniciales, para que GET /api/settings no dé 404 después de limpiar.
  await prisma.$executeRaw`
    INSERT INTO settings (id, store_name, price_rounding_step, business_day_cutoff_minutes, updated_at)
    VALUES (1, 'Kiosco', 10.00, 360, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING`;
  // `payment_methods` son datos base que crea la migración (5 fijos, la API no los crea): se vuelven a crear.
  await prisma.$executeRaw`
    INSERT INTO payment_methods (kind, name, surcharge_percent, is_active, sort_order, updated_at) VALUES
      ('CASH', 'Efectivo', 0.00, true, 1, CURRENT_TIMESTAMP),
      ('DEBIT_CARD', 'Débito', 0.00, true, 2, CURRENT_TIMESTAMP),
      ('CREDIT_CARD', 'Crédito', 10.00, true, 3, CURRENT_TIMESTAMP),
      ('QR', 'QR Mercado Pago', 0.00, true, 4, CURRENT_TIMESTAMP),
      ('TRANSFER', 'Transferencia', 0.00, true, 5, CURRENT_TIMESTAMP)
    ON CONFLICT (kind) DO NOTHING`;
}
