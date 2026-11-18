// Se corre UNA vez antes de los tests de integración: valida que la base sea de pruebas
// y le aplica las migraciones pendientes (equivale a `npm run db:test:prepare`; es idempotente).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getTestDatabaseUrl } from './test-db';

export default function setup(): void {
  const url = getTestDatabaseUrl(); // aborta si no termina en _test
  const apiDir = fileURLToPath(new URL('../..', import.meta.url));
  const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: apiDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    env: { ...process.env, PRISMA_TARGET: 'test', DATABASE_URL_TEST: url },
  });
  if (result.status !== 0) {
    throw new Error(
      `No se pudieron aplicar las migraciones a la base de pruebas.\n${result.stdout}\n${result.stderr}`,
    );
  }
}
