// Antes de los e2e: aplica las migraciones a la base de pruebas, la VACÍA y crea los usuarios de
// prueba con claves al azar (nunca reales). El dueño se crea con la misma lógica que
// `npm run owner:reset`. Todo contra `kiosco_test`: si la URL no termina en `_test`, se aborta.
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../apps/api/src/db/prisma';
import type { PrismaClient } from '../apps/api/src/generated/client';
import { hashPassword } from '../apps/api/src/modules/auth/password';
import { runOwnerReset, type Prompter } from '../apps/api/src/modules/users/owner-reset';
import { assertTestDatabaseUrl, resetDatabase } from '../apps/api/test/db/test-db';
import { acquireTestDbLock } from '../apps/api/test/db/test-lock';
import {
  EMPLOYEE_FULL_NAME,
  MANAGER_FULL_NAME,
  OWNER_FULL_NAME,
  SEED_CATALOG,
  SEED_SALES,
  users,
} from './credentials';

const BCRYPT_COST = 4; // solo en pruebas: más rápido

function newPassword(): string {
  return `clave-${randomBytes(9).toString('base64url')}`;
}

/**
 * Catálogo mínimo para los e2e de la etapa 2: una categoría con margen 30 %, una subcategoría sin
 * margen propio y tres productos con costo (neto 1.000 / 500 / 800, IVA 21 %).
 */
async function seedCatalog(prisma: PrismaClient): Promise<void> {
  const category = await prisma.category.create({
    data: { name: SEED_CATALOG.category, marginPercent: '30' },
  });
  const subcategory = await prisma.subcategory.create({
    data: { categoryId: category.id, name: SEED_CATALOG.subcategory },
  });
  const base = { subcategoryId: subcategory.id, saleUnit: 'UNIT' as const, vatRatePercent: '21' };
  await prisma.product.create({
    data: {
      ...base,
      name: SEED_CATALOG.cola.name,
      barcode: SEED_CATALOG.cola.barcode,
      netCostPrice: '1000',
      costPrice: '1210',
      salePrice: '1700',
      stockQuantity: '10',
    },
  });
  // Stock 2 con mínimo 5: aparece en "Para reponer".
  await prisma.product.create({
    data: {
      ...base,
      name: SEED_CATALOG.restock.name,
      barcode: SEED_CATALOG.restock.barcode,
      netCostPrice: '500',
      costPrice: '605',
      salePrice: '900',
      stockQuantity: '2',
      minStock: '5',
    },
  });
  // Stock 22: para la corrección por conteo (H-28).
  await prisma.product.create({
    data: {
      ...base,
      name: SEED_CATALOG.count.name,
      barcode: SEED_CATALOG.count.barcode,
      netCostPrice: '800',
      costPrice: '968',
      salePrice: '1400',
      stockQuantity: '22',
    },
  });
}

/**
 * Productos de ventas.spec.ts (etapa 3) y el producto especial "Varios" (H-09). Los 5 medios de pago
 * los crea `resetDatabase` (son datos base de la migración).
 */
async function seedSalesCatalog(prisma: PrismaClient): Promise<void> {
  const subcategory = await prisma.subcategory.findFirstOrThrow({
    where: { name: SEED_CATALOG.subcategory },
  });
  const base = { subcategoryId: subcategory.id, vatRatePercent: '21' };
  for (const item of Object.values(SEED_SALES)) {
    const isKg = item === SEED_SALES.queso;
    await prisma.product.create({
      data: {
        ...base,
        name: item.name,
        barcode: item.barcode,
        saleUnit: isKg ? 'KG' : 'UNIT',
        netCostPrice: '300',
        costPrice: '363',
        salePrice: item.price,
        stockQuantity: item.stock,
      },
    });
  }
  await prisma.product.create({
    data: { ...base, name: 'Varios', saleUnit: 'UNIT', salePrice: '0', isMiscellaneous: true },
  });
}

export default async function globalSetup(): Promise<() => void> {
  // Una sola corrida a la vez sobre `kiosco_test`: si hay otra (vitest de integración u otro e2e),
  // se espera. Playwright llama a la función que devolvemos al terminar, y ahí se suelta el candado.
  const release = await acquireTestDbLock(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));
  try {
    await prepareDatabase();
  } catch (error) {
    release();
    throw error;
  }
  return () => {
    // Borra la carpeta temporal de adjuntos de esta corrida y suelta el candado.
    if (process.env.E2E_UPLOADS_DIR?.includes('kiosco-e2e-uploads-')) {
      rmSync(process.env.E2E_UPLOADS_DIR, { recursive: true, force: true });
    }
    release();
  };
}

async function prepareDatabase(): Promise<void> {
  const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const result = spawnSync('npm', ['run', 'db:test:prepare'], {
    cwd: rootDir,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`Falló "npm run db:test:prepare".\n${result.stdout}\n${result.stderr}`);
  }

  for (const name of ['OWNER', 'EMPLOYEE', 'MANAGER', 'LOCKABLE']) {
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
    const manager = users.manager();
    await prisma.user.create({
      data: {
        username: manager.username,
        fullName: MANAGER_FULL_NAME,
        role: 'MANAGER',
        passwordHash: await hashPassword(manager.password, BCRYPT_COST),
      },
    });
    await seedCatalog(prisma);
    await seedSalesCatalog(prisma);
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
