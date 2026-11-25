// Empaquetado de la API para producción (ADR 001, punto 2): incluye @kiosco/shared;
// las dependencias de npm quedan en node_modules.
import { defineConfig } from 'tsdown';

export default defineConfig({
  // El worker de bcrypt (ADR 004) es una entrada más: queda como dist/bcrypt.worker.mjs, al lado de server.mjs.
  entry: {
    server: 'src/server.ts',
    'bcrypt.worker': 'src/modules/auth/bcrypt.worker.ts',
  },
  format: 'esm',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  deps: { alwaysBundle: [/^@kiosco\//] },
});
