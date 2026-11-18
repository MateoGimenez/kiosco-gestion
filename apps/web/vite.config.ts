// Configuración de Vite y de Vitest para las pantallas del kiosco.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// El .env vive en la raíz del repo (un solo archivo para todo el proyecto).
const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

// Puerto de la puerta local de la API (igual que apps/api/src/config.ts).
const apiPort = process.env.LOCAL_PORT ?? process.env.PORT ?? '3000';

export default defineConfig({
  plugins: [react()],
  envDir: rootDir,
  resolve: {
    alias: {
      // Se importa el código fuente de shared directamente, sin compilarlo aparte.
      '@kiosco/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
    // Mismo origen en desarrollo: el navegador habla con Vite y Vite reenvía /api a la API.
    proxy: { '/api': { target: `http://localhost:${apiPort}`, changeOrigin: false } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: `http://localhost:${apiPort}` } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
