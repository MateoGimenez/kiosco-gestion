// Vitest de la API con dos proyectos:
//  - unit: tests sin base de datos (`test/**/*.test.ts`, salvo los de integración).
//  - integration: tests contra PostgreSQL `kiosco_test` (`test/**/*.int.test.ts`).
// Por separado: `npm run test:unit` / `npm run test:int`. Juntos: `npm test`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['test/**/*.int.test.ts', 'src/**/*.int.test.ts'],
          globalSetup: ['./test/db/global-setup.ts'],
          setupFiles: ['./test/db/setup-env.ts'],
          // Una sola base compartida: los archivos corren de a uno para no pisarse.
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
