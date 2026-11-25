// Usuarios de prueba de los e2e. Las claves las genera `global-setup.ts` en cada corrida (al azar,
// nunca reales) y las deja en variables de entorno que heredan los tests.
export interface TestUser {
  username: string;
  password: string;
}

function fromEnv(name: string, username: string): TestUser {
  const password = process.env[`E2E_PASSWORD_${name}`];
  if (!password) throw new Error(`Falta E2E_PASSWORD_${name}: lo define e2e/global-setup.ts.`);
  return { username, password };
}

/** Los usuarios que crea el global setup (la base se vacía antes de cada corrida). */
export const users = {
  owner: () => fromEnv('OWNER', 'dueno'),
  employee: () => fromEnv('EMPLOYEE', 'empleado'),
  /** Encargado fijo para los e2e de productos y stock (etapa 2). */
  manager: () => fromEnv('MANAGER', 'encargado'),
  /** Solo para el test de bloqueo: así no se bloquea a nadie más. */
  lockable: () => fromEnv('LOCKABLE', 'bloqueable'),
};

export const OWNER_FULL_NAME = 'Dora Dueña';
export const EMPLOYEE_FULL_NAME = 'Emilio Empleado';
export const MANAGER_FULL_NAME = 'Marta Encargada';

/** Catálogo que siembra el global setup (no depende del seed de desarrollo). */
export const SEED_CATALOG = {
  category: 'Bebidas',
  subcategory: 'Gaseosas',
  cola: { name: 'Gaseosa Cola 500', barcode: '7790000000011' },
  restock: { name: 'Alfajor Triple', barcode: '7790000000028' },
  count: { name: 'Agua Mineral 1,5L', barcode: '7790000000035' },
} as const;

/** Una clave de un solo uso, generada en el test. */
export function randomPassword(): string {
  return `clave-${crypto.randomUUID().slice(0, 12)}`;
}
