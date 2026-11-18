// Empaquetado de la API para producción (ADR 001, punto 2): incluye @kiosco/shared;
// las dependencias de npm quedan en node_modules.
import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/server.ts'],
  format: 'esm',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  deps: { alwaysBundle: [/^@kiosco\//] },
});
