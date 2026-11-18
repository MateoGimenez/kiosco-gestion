// Carga y validación de la configuración (ADR 001, punto 5).
// Un solo .env en la RAÍZ del repo. Si falta algo obligatorio o está mal, la API no arranca.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Valores de ejemplo que nunca se aceptan como clave de sesión. */
const PLACEHOLDER_SECRET = /^(cambiar|changeme|change_me|ejemplo|example|secret|password)/i;

const LOOPBACK_HOSTS = ['127.0.0.1', '::1', 'localhost'];

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'Tiene que ser una URL de PostgreSQL (postgresql://...).'),
    // Clave para firmar las sesiones: larga, al azar y distinta del ejemplo.
    JWT_SECRET: z
      .string()
      .refine((v) => Buffer.byteLength(v, 'utf8') >= 32, 'Tiene que tener al menos 32 bytes.')
      .refine((v) => !PLACEHOLDER_SECRET.test(v), 'No puede ser el valor de ejemplo.'),
    SESSION_HOURS: z.coerce.number().int().min(1).max(168).default(12),
    // Puerta local (mostrador y WiFi del local).
    LOCAL_BIND: z.string().min(1).default('0.0.0.0'),
    LOCAL_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    // PORT es el nombre histórico de la variable (.env.example): se usa si no hay LOCAL_PORT.
    PORT: z.coerce.number().int().min(1).max(65535).optional(),
    // Puerta remota (etapa 9): preparada pero apagada.
    REMOTE_ENABLED: booleanString.default(false),
    REMOTE_BIND: z.string().min(1).default('127.0.0.1'),
    REMOTE_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .superRefine((env, ctx) => {
    // La puerta remota solo puede escuchar en loopback: a ella llega únicamente el proxy local.
    if (!LOOPBACK_HOSTS.includes(env.REMOTE_BIND)) {
      ctx.addIssue({
        code: 'custom',
        path: ['REMOTE_BIND'],
        message: 'Tiene que ser una dirección de loopback (127.0.0.1 o ::1).',
      });
    }
  })
  .transform((env) => ({
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    sessionHours: env.SESSION_HOURS,
    local: { bind: env.LOCAL_BIND, port: env.LOCAL_PORT ?? env.PORT ?? 3000 },
    remote: { enabled: env.REMOTE_ENABLED, bind: env.REMOTE_BIND, port: env.REMOTE_PORT },
  }));

export type AppConfig = z.infer<typeof envSchema>;

/** Error de configuración: el mensaje lista cada variable mal, SIN mostrar sus valores. */
export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Configuración inválida:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Valida un objeto de variables de entorno (por ejemplo `process.env`). Lanza ConfigError. */
export function loadConfig(env: Record<string, string | undefined>): AppConfig {
  // Una variable vacía (como "JWT_SECRET=" en .env.example) cuenta como no definida.
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((i) => {
        const name = i.path.join('.') || '(general)';
        return i.code === 'invalid_type' && cleaned[name] === undefined
          ? `${name}: falta definirla.`
          : `${name}: ${i.message}`;
      }),
    );
  }
  return result.data;
}

/**
 * Carga el .env de la raíz del repo (ruta explícita, no la carpeta actual) sin pisar
 * las variables que ya estén definidas en el entorno. Si no existe, no hace nada.
 */
export function loadRootEnvFile(): void {
  const envPath = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}
