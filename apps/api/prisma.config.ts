// Configuración de Prisma 7 (ADR 001, punto 5): usa el .env de la RAÍZ del repo.
// El cliente se conecta con el adapter de pg (ver src/db/prisma.ts); acá solo se
// configura la CLI (migraciones, generate, seed).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, env } from 'prisma/config';

// Ruta explícita a la raíz: los scripts corren dentro de apps/api. No pisa variables ya definidas.
const rootEnv = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

// Para los tests de integración: PRISMA_TARGET=test apunta la CLI a DATABASE_URL_TEST
// (lo usa el script db:test:prepare). Si no, se usa DATABASE_URL.
const urlVar = process.env.PRISMA_TARGET === 'test' ? 'DATABASE_URL_TEST' : 'DATABASE_URL';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env(urlVar),
  },
});
