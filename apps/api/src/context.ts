// Dependencias compartidas de la aplicación (se inyectan en createApp, así los tests las reemplazan).
import type { Logger } from 'pino';
import type { AuditThrottle } from './audit';
import type { Channel } from './channel';
import type { AppConfig } from './config';
import type { PrismaClient } from './generated/client';
import type { LoginLimiter } from './modules/auth/login-limiter';

export interface AppContext {
  channel: Channel;
  config: AppConfig;
  prisma: PrismaClient;
  logger: Logger;
  loginLimiter: LoginLimiter;
  /** Límite de 1 fila por minuto para ACCESS_DENIED y LOGIN_LOCKED. */
  auditThrottle: AuditThrottle;
  /**
   * Solo para tests: dirección del socket a usar en lugar de la real, para probar la
   * clasificación por IP (ADR 003, punto 10). El servidor real nunca lo pasa.
   */
  remoteAddressOverride?: ((req: import('express').Request) => string | undefined) | undefined;
}
