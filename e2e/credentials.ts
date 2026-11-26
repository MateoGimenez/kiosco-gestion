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

/**
 * Productos de la etapa 3 (ventas). Son propios de ventas.spec.ts: ningún otro spec los toca, así
 * el stock de cada uno es el que se sembró. Todos con IVA 21 %; el costo no importa para el mostrador.
 */
export const SEED_SALES = {
  chicle: { name: 'Chicle Menta', barcode: '7790000001010', price: '500', stock: '50' },
  galletita: { name: 'Galletita Vainilla', barcode: '7790000001027', price: '800', stock: '30' },
  /** Por kilo: 0,350 kg x $4.990 = $1.746,50 -> $1.747 (H-06). */
  queso: { name: 'Queso Cremoso por kg', barcode: '7790000001034', price: '4990', stock: '5' },
  /** Stock 1: sirve para probar el aviso de "stock insuficiente" (se vende igual). */
  pila: { name: 'Pila AAA', barcode: '7790000001041', price: '1200', stock: '1' },
  vino: { name: 'Vino Malbec 750', barcode: '7790000001058', price: '6000', stock: '10' },
  fernet: { name: 'Fernet 450', barcode: '7790000001065', price: '4000', stock: '10' },
  /** Para el doble Enter: nadie más lo vende. */
  turron: { name: 'Turrón Arcor', barcode: '7790000001072', price: '900', stock: '20' },
} as const;

/** Una clave de un solo uso, generada en el test. */
export function randomPassword(): string {
  return `clave-${crypto.randomUUID().slice(0, 12)}`;
}
