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
  /** Solo para el test de bloqueo: así no se bloquea a nadie más. */
  lockable: () => fromEnv('LOCKABLE', 'bloqueable'),
};

export const OWNER_FULL_NAME = 'Dora Dueña';
export const EMPLOYEE_FULL_NAME = 'Emilio Empleado';

/** Una clave de un solo uso, generada en el test. */
export function randomPassword(): string {
  return `clave-${crypto.randomUUID().slice(0, 12)}`;
}
