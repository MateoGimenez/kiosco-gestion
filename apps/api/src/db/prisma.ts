// Cliente de Prisma (singleton). Prisma 7 se conecta a PostgreSQL con el adapter de pg.
// Un PrismaClient crea un pool de conexiones: se usa UNA sola instancia por proceso.
import { PrismaPg } from '@prisma/adapter-pg';
import { loadConfig, loadRootEnvFile } from '../config';
import { PrismaClient } from '../generated/client';

let instance: PrismaClient | undefined;

/** Crea un cliente con la URL dada (para tests que necesiten otra base). */
export function createPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}

/** Devuelve el cliente compartido; lo crea la primera vez con DATABASE_URL de la configuración validada. */
export function getPrisma(): PrismaClient {
  if (!instance) {
    loadRootEnvFile();
    instance = createPrismaClient(loadConfig(process.env).databaseUrl);
  }
  return instance;
}

/** Cierra el pool (al apagar la API o al terminar los tests). */
export async function disconnectPrisma(): Promise<void> {
  if (instance) {
    await instance.$disconnect();
    instance = undefined;
  }
}
