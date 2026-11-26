// Se corre UNA vez antes de los tests de integración: valida que la base sea de pruebas
// y le aplica las migraciones pendientes (equivale a `npm run db:test:prepare`; es idempotente).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTestDatabaseUrl } from './test-db';
import { acquireTestDbLock } from './test-lock';

// Devuelve la función que suelta el candado de la base (la llama vitest al terminar).
export default async function setup(): Promise<() => void> {
  const url = getTestDatabaseUrl(); // aborta si no termina en _test
  // Una sola corrida a la vez sobre `kiosco_test` (también la respetan los e2e).
  const release = await acquireTestDbLock(url);
  const apiDir = fileURLToPath(new URL('../..', import.meta.url));
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, PRISMA_TARGET: 'test', DATABASE_URL_TEST: url },
  });
  if (result.status !== 0) {
    release();
    throw new Error(
      `No se pudieron aplicar las migraciones a la base de pruebas.\n${result.stdout}\n${result.stderr}`,
    );
  }
  return release;
}
