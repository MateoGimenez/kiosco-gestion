// Antes de los e2e: aplica las migraciones a la base de pruebas, la VACÍA y crea los usuarios de
// prueba con claves al azar (nunca reales). El dueño se crea con la misma lógica que
// `npm run owner:reset`. Todo contra `kiosco_test`: si la URL no termina en `_test`, se aborta.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../apps/api/src/db/prisma';
import { hashPassword } from '../apps/api/src/modules/auth/password';
import { runOwnerReset, type Prompter } from '../apps/api/src/modules/users/owner-reset';
import { assertTestDatabaseUrl, resetDatabase } from '../apps/api/test/db/test-db';
import { EMPLOYEE_FULL_NAME, OWNER_FULL_NAME, users } from './credentials';

const BCRYPT_COST = 4; // solo en pruebas: más rápido

function newPassword(): string {
  return `clave-${randomBytes(9).toString('base64url')}`;
}

export default async function globalSetup(): Promise<void> {
  const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const result = spawnSync('npm', ['run', 'db:test:prepare'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`Falló "npm run db:test:prepare".\n${result.stdout}\n${result.stderr}`);
  }

  for (const name of ['OWNER', 'EMPLOYEE', 'LOCKABLE']) {
    process.env[`E2E_PASSWORD_${name}`] = newPassword();
  }

  const prisma = createPrismaClient(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));
  try {
    await resetDatabase(prisma);

    // Dueño: igual que `npm run owner:reset`, con las respuestas de un guion.
    const owner = users.owner();
    const answers = [owner.username, OWNER_FULL_NAME, owner.password, owner.password];
    const io: Prompter = {
      ask: () => Promise.resolve(answers.shift() ?? ''),
      askHidden: () => Promise.resolve(answers.shift() ?? ''),
      say: () => undefined,
    };
    const outcome = await runOwnerReset(prisma, io, BCRYPT_COST);
    if (outcome !== 'CREATED') throw new Error(`owner:reset terminó con ${outcome}`);

    const employee = users.employee();
    await prisma.user.create({
      data: {
        username: employee.username,
        fullName: EMPLOYEE_FULL_NAME,
        role: 'EMPLOYEE',
        passwordHash: await hashPassword(employee.password, BCRYPT_COST),
      },
    });
    const lockable = users.lockable();
    await prisma.user.create({
      data: {
        username: lockable.username,
        fullName: 'Lucas Bloqueable',
        role: 'MANAGER',
        passwordHash: await hashPassword(lockable.password, BCRYPT_COST),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
