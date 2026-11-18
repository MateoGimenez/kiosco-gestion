// Carga y validación de la configuración (ADR 001, punto 5).
// Un solo .env en la RAÍZ del repo. Si falta algo obligatorio o está mal, la API no arranca.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';

/** Valores de ejemplo que nunca se aceptan como clave de sesión. */
const PLACEHOLDER_SECRET = /^(cambiar|changeme|change_me|ejemplo|example|secret|password)/i;

const LOOPBACK_HOSTS = ['127.0.0.1', '::1'];

/** Si están definidas pero vacías, es un error (no se cae al valor por defecto en silencio). */
const REJECT_IF_EMPTY = ['LOCAL_CIDRS', 'LOCAL_ALLOWED_HOSTS'];

/** Redes de Tailscale: no pueden formar parte de "el local" (ADR 003, punto 3). */
const TAILSCALE_CIDRS = ['100.64.0.0/10', 'fd7a:115c:a1e0::/48'];

/** Nombre de host (sin esquema, puerto ni barra). */
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;

/** Dos rangos CIDR se superponen si uno contiene la dirección base del otro. */
function cidrsOverlap(
  a: [ipaddr.IPv4 | ipaddr.IPv6, number],
  b: [ipaddr.IPv4 | ipaddr.IPv6, number],
) {
  if (a[0].kind() !== b[0].kind()) return false;
  return a[0].match(b) || b[0].match(a);
}

function parseCidr(value: string): [ipaddr.IPv4 | ipaddr.IPv6, number] | null {
  if (!value.includes('/') || !ipaddr.isValidCIDR(value)) return null;
  return ipaddr.parseCIDR(value);
}

function isIp(value: string): boolean {
  return ipaddr.isValid(value);
}

/** Lista separada por comas, sin vacíos intermedios. */
function splitList(value: string): string[] {
  return value.split(',').map((v) => v.trim().toLowerCase());
}

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
    // USR-07: la sesión dura "hasta 12 horas". La remota no puede durar más que la local.
    SESSION_HOURS: z.coerce.number().int().min(1).max(12).default(12),
    REMOTE_SESSION_HOURS: z.coerce.number().int().min(1).max(12).default(4),
    // Límite de intentos de login (ADR 003, punto 7).
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(10).default(5),
    LOGIN_WINDOW_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    LOGIN_LOCK_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
    BCRYPT_COST: z.coerce.number().int().max(14).default(12),
    // Redes y nombres de la puerta local. Por defecto, lo más cerrado: solo la propia PC.
    LOCAL_CIDRS: z.string().default('127.0.0.1/32,::1/128'),
    LOCAL_ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,::1'),
    REMOTE_HOST: z.string().optional(),
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
    const fail = (name: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [name], message });

    // bcrypt: de 10 a 14; solo en tests se acepta desde 4 (tests rápidos).
    const minCost = env.NODE_ENV === 'test' ? 4 : 10;
    if (env.BCRYPT_COST < minCost) fail('BCRYPT_COST', `Tiene que estar entre ${minCost} y 14.`);

    if (env.REMOTE_SESSION_HOURS > env.SESSION_HOURS) {
      fail('REMOTE_SESSION_HOURS', 'No puede ser mayor que SESSION_HOURS.');
    }

    // LOCAL_CIDRS: bien formada, sin "todo internet" y sin superponerse con Tailscale.
    const cidrs = splitList(env.LOCAL_CIDRS);
    const parsed = cidrs.map(parseCidr);
    if (cidrs.some((c) => c === '') || parsed.some((p) => p === null)) {
      fail('LOCAL_CIDRS', 'Tiene que ser una lista de redes CIDR (ej.: 192.168.1.0/24).');
    } else {
      const ranges = parsed as [ipaddr.IPv4 | ipaddr.IPv6, number][];
      if (ranges.some(([, bits]) => bits === 0)) {
        fail('LOCAL_CIDRS', 'No puede incluir todo internet (0.0.0.0/0 o ::/0).');
      }
      const tailscale = TAILSCALE_CIDRS.map((c) => parseCidr(c)!);
      if (ranges.some((r) => tailscale.some((t) => cidrsOverlap(r, t)))) {
        fail('LOCAL_CIDRS', 'No puede superponerse con las direcciones de Tailscale.');
      }
    }

    // LOCAL_ALLOWED_HOSTS: solo nombres o IP (sin esquema, puerto ni barra).
    const hosts = splitList(env.LOCAL_ALLOWED_HOSTS);
    if (hosts.some((h) => !(HOSTNAME_PATTERN.test(h) || ipaddr.IPv6.isValid(h)))) {
      fail(
        'LOCAL_ALLOWED_HOSTS',
        'Tiene que ser una lista de nombres o IP, sin http://, puerto ni "/".',
      );
    }

    // REMOTE_HOST: obligatorio con la puerta remota; nombre válido, no IP, distinto de los locales.
    const remoteHost = env.REMOTE_HOST?.trim().toLowerCase();
    if (env.REMOTE_ENABLED && !remoteHost)
      fail('REMOTE_HOST', 'Hace falta con REMOTE_ENABLED=true.');
    if (remoteHost) {
      if (!HOSTNAME_PATTERN.test(remoteHost) || isIp(remoteHost)) {
        fail('REMOTE_HOST', 'Tiene que ser un nombre de host (no una IP) sin http:// ni puerto.');
      } else if (hosts.includes(remoteHost)) {
        fail('REMOTE_HOST', 'No puede figurar también en LOCAL_ALLOWED_HOSTS.');
      }
    }

    if (env.REMOTE_PORT === (env.LOCAL_PORT ?? env.PORT ?? 3000)) {
      fail('REMOTE_PORT', 'No puede ser igual a LOCAL_PORT.');
    }

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
    remoteSessionHours: env.REMOTE_SESSION_HOURS,
    bcryptCost: env.BCRYPT_COST,
    login: {
      maxAttempts: env.LOGIN_MAX_ATTEMPTS,
      windowMinutes: env.LOGIN_WINDOW_MINUTES,
      lockMinutes: env.LOGIN_LOCK_MINUTES,
    },
    network: {
      localCidrs: splitList(env.LOCAL_CIDRS),
      localAllowedHosts: splitList(env.LOCAL_ALLOWED_HOSTS),
      remoteHost: env.REMOTE_HOST?.trim().toLowerCase() ?? null,
    },
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
    Object.entries(env).filter(
      ([k, v]) => v !== undefined && (v.trim() !== '' || REJECT_IF_EMPTY.includes(k)),
    ),
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
