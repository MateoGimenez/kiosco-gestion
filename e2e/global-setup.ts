// Antes de los e2e: aplica las migraciones a la base de pruebas (idempotente).
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export default function globalSetup(): void {
  const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const result = spawnSync('npm', ['run', 'db:test:prepare'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`Falló "npm run db:test:prepare".\n${result.stdout}\n${result.stderr}`);
  }
}
