// Configuración de Playwright (tests e2e). Se corre desde la raíz: `npm run test:e2e`.
// Levanta la API y la web en puertos propios (no pisa un `npm run dev` abierto) y siempre
// contra la base `kiosco_test`: si DATABASE_URL_TEST no termina en `_test`, se aborta.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const rootDir = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const rootEnv = resolve(rootDir, '.env');
// Sin pisar variables ya definidas (en CI vienen del entorno).
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const testDatabaseUrl = process.env.DATABASE_URL_TEST;
if (!testDatabaseUrl) {
  throw new Error(
    'Falta DATABASE_URL_TEST (ver .env.example). Los e2e solo usan la base de pruebas.',
  );
}
const dbName = decodeURIComponent(new URL(testDatabaseUrl).pathname.replace(/^\//, ''));
if (!dbName.endsWith('_test')) {
  throw new Error(
    `Los e2e solo corren contra una base cuyo nombre termina en "_test" (la URL apunta a "${dbName}").`,
  );
}

const API_PORT = Number(process.env.E2E_API_PORT ?? 3100);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5183);
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

// En esta máquina Chromium viene preinstalado; en CI se instala con `npx playwright install`.
const localChromium = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';
const executablePath = !process.env.CI && existsSync(localChromium) ? localChromium : undefined;

// Entorno de los dos servidores: base de pruebas, puertos de e2e y sin salir de la máquina.
const serverEnv = {
  ...(process.env as Record<string, string>),
  NODE_ENV: 'test',
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: process.env.JWT_SECRET || randomBytes(48).toString('base64url'),
  LOCAL_BIND: '127.0.0.1',
  LOCAL_PORT: String(API_PORT),
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  outputDir: resolve(rootDir, 'test-results'),
  globalSetup: './global-setup.ts',
  // Una sola base compartida: sin paralelismo entre archivos.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: resolve(rootDir, 'playwright-report'), open: 'never' }]]
    : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } },
    },
  ],
  webServer: [
    {
      name: 'api',
      command: 'npx tsx apps/api/src/server.ts',
      cwd: rootDir,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: 'web',
      command: `npm run dev -w @kiosco/web -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: rootDir,
      url: WEB_URL,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
