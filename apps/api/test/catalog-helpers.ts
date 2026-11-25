// Ayudas de los tests de integración de la etapa 2: usuarios por rol, sesión y catálogo de ejemplo.
import { expect } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import { hashPassword } from '../src/modules/auth/password';
import { buildTestApp, clientFor, sessionCookie, testConfig } from './helpers';

export const PASSWORD = 'clave-segura-1';
export type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE';
export type Client = ReturnType<typeof clientFor>;

export async function seedUser(prisma: PrismaClient, username: string, role: Role) {
  return prisma.user.create({
    data: {
      username,
      fullName: `Usuario ${username}`,
      role,
      passwordHash: await hashPassword(PASSWORD, 4),
    },
  });
}

export interface World {
  client: Client;
  owner: string;
  manager: string;
  employee: string;
  ownerId: number;
  managerId: number;
  employeeId: number;
}

/** Crea un usuario por rol y entra con cada uno por la puerta local. */
export async function setupWorld(prisma: PrismaClient): Promise<World> {
  const loginLimiter = new LoginLimiter(testConfig().login);
  const client = clientFor(buildTestApp('local', { prisma, loginLimiter }), 'local');
  const ids: Record<Role, number> = { OWNER: 0, MANAGER: 0, EMPLOYEE: 0 };
  const cookies: Record<Role, string> = { OWNER: '', MANAGER: '', EMPLOYEE: '' };
  for (const [role, username] of [
    ['OWNER', 'dueno'],
    ['MANAGER', 'encargado'],
    ['EMPLOYEE', 'empleado'],
  ] as const) {
    ids[role] = (await seedUser(prisma, username, role)).id;
    const res = await client.post('/api/auth/login', { username, password: PASSWORD });
    expect(res.status).toBe(200);
    cookies[role] = sessionCookie(res);
  }
  return {
    client,
    owner: cookies.OWNER,
    manager: cookies.MANAGER,
    employee: cookies.EMPLOYEE,
    ownerId: ids.OWNER,
    managerId: ids.MANAGER,
    employeeId: ids.EMPLOYEE,
  };
}

/** Golosinas 40 % > Chocolates 50 % (paso 2 de "Cómo probarlo"). Devuelve los ids. */
export async function seedCatalog(prisma: PrismaClient) {
  const category = await prisma.category.create({
    data: { name: 'Golosinas', marginPercent: '40' },
  });
  const subcategory = await prisma.subcategory.create({
    data: { categoryId: category.id, name: 'Chocolates', marginPercent: '50' },
  });
  const plain = await prisma.subcategory.create({
    data: { categoryId: category.id, name: 'Caramelos' },
  });
  return { category, subcategory, plain };
}

/** Producto creado directo en la base (para no depender de la API en los tests de otra cosa). */
export async function seedProduct(
  prisma: PrismaClient,
  subcategoryId: number,
  data: Partial<{
    name: string;
    barcode: string | null;
    saleUnit: 'UNIT' | 'KG';
    netCostPrice: string;
    costPrice: string;
    vatRatePercent: string;
    marginPercent: string | null;
    salePrice: string;
    stockQuantity: string;
    minStock: string;
    isActive: boolean;
    isMiscellaneous: boolean;
  }> = {},
) {
  return prisma.product.create({
    data: {
      name: 'Chocolate Águila 100 g',
      saleUnit: 'UNIT',
      netCostPrice: '1000',
      costPrice: '1210',
      salePrice: '1820',
      ...data,
      subcategoryId,
    },
  });
}

/** Busca recursivamente una clave en un JSON (para verificar que no se filtra el costo). */
export function findKeys(value: unknown, keys: readonly string[], path = '$'): string[] {
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => found.push(...findKeys(v, keys, `${path}[${i}]`)));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (keys.includes(k)) found.push(`${path}.${k}`);
      found.push(...findKeys(v, keys, `${path}.${k}`));
    }
  }
  return found;
}

export const COST_KEYS = [
  'netCostPrice',
  'costPrice',
  'suggestedPrice',
  'realMarginPercent',
  'marginPercent',
  'effectiveMarginPercent',
  'marginSource',
  'unitNetCost',
  'subcategoryMarginPercent',
  'categoryMarginPercent',
] as const;
