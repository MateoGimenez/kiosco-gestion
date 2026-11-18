import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  UnsafeTestDatabaseError,
  assertTestDatabaseUrl,
  createTestPrisma,
  databaseNameOf,
  resetDatabase,
} from './test-db';

describe('guardas de la base de pruebas (unitarias)', () => {
  it('acepta una URL que termina en _test, con o sin parámetros', () => {
    const url = 'postgresql://u:p@localhost:5432/kiosco_test?schema=public';
    expect(assertTestDatabaseUrl(url)).toBe(url);
    expect(databaseNameOf(url)).toBe('kiosco_test');
  });

  it('aborta si la base no termina en _test', () => {
    expect(() => assertTestDatabaseUrl('postgresql://u:p@localhost:5432/kiosco_dev')).toThrow(
      UnsafeTestDatabaseError,
    );
    expect(() =>
      assertTestDatabaseUrl('postgresql://u:p@localhost:5432/kiosco_test_prod?schema=public'),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it('aborta si la URL falta o es inválida', () => {
    expect(() => assertTestDatabaseUrl(undefined)).toThrow(/DATABASE_URL_TEST/);
    expect(() => assertTestDatabaseUrl('no-es-una-url')).toThrow(UnsafeTestDatabaseError);
  });
});

describe('base de pruebas real', () => {
  const prisma = createTestPrisma();

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS _qa_probe (id serial PRIMARY KEY, label text)',
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS _qa_probe');
    await prisma.$disconnect();
  });

  it('está conectada a una base cuyo nombre termina en _test', async () => {
    const [db] = await prisma.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    expect(db?.name.endsWith('_test')).toBe(true);
  });

  it('tiene aplicadas las migraciones', async () => {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL`;
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(1);
  });

  it('resetDatabase vacía las tablas, reinicia los ids y conserva _prisma_migrations', async () => {
    await prisma.$executeRawUnsafe(`INSERT INTO _qa_probe (label) VALUES ('a'), ('b')`);
    await resetDatabase(prisma);

    const count = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM _qa_probe`;
    expect(Number(count[0]?.n)).toBe(0);

    await prisma.$executeRawUnsafe(`INSERT INTO _qa_probe (label) VALUES ('c')`);
    const ids = await prisma.$queryRaw<{ id: number }[]>`SELECT id FROM _qa_probe`;
    expect(ids[0]?.id).toBe(1); // RESTART IDENTITY

    const migrations = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM _prisma_migrations`;
    expect(Number(migrations[0]?.n)).toBeGreaterThanOrEqual(1);
  });
});
