// Configuración de ESLint (formato plano) para todo el monorepo.
// Un solo archivo en la raíz: cada bloque aplica reglas según la carpeta.
import js from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Dinero: nunca pasar por números de coma flotante (ADR 002).
const moneySafetyRules = {
  'no-restricted-globals': [
    'error',
    {
      name: 'parseFloat',
      message: 'No uses parseFloat: el dinero y las cantidades se manejan con Decimal (ADR 002).',
    },
  ],
  'no-restricted-properties': [
    'error',
    {
      object: 'Number',
      property: 'parseFloat',
      message: 'No uses parseFloat: el dinero y las cantidades se manejan con Decimal (ADR 002).',
    },
  ],
};

export default defineConfig(
  // Carpetas generadas o de terceros: no se revisan.
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/build/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    'apps/api/src/generated/',
  ]),

  // Base para todos los archivos JS y TS.
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      ...moneySafetyRules,
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // Variables sin usar: error, salvo las que empiezan con "_" (por ejemplo, el
      // cuarto parámetro del manejador de errores de Express).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Código que corre en Node: API, tests e2e y archivos de configuración de la raíz.
  {
    files: ['apps/api/**/*.{js,ts}', 'e2e/**/*.{js,ts}', '*.{js,ts}', '**/*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Pantallas (React en el navegador).
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite()],
  },

  // Va al final: apaga las reglas de formato que maneja Prettier.
  eslintConfigPrettier,
);
