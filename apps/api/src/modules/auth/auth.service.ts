// Lógica del login (docs/api/auth-usuarios.md, sección 3.1).
import type { Request } from 'express';
import { ERROR_CODES, type LoginRequest } from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import { getDummyHash, verifyPassword } from './password';

type FailReason = 'UNKNOWN_USER' | 'BAD_PASSWORD' | 'USER_INACTIVE' | 'REMOTE_ROLE_NOT_ALLOWED';

export interface LoginResult {
  user: {
    id: number;
    username: string;
    fullName: string;
    role: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
    tokenVersion: number;
  };
}

/**
 * Valida las credenciales y audita. Lanza AppError (401, 403 o 429); si todo sale bien
 * devuelve el usuario (la cookie la arma el controlador).
 */
export async function login(
  ctx: AppContext,
  req: Request,
  input: LoginRequest,
): Promise<LoginResult> {
  const { username, password } = input;
  const { channel } = ctx;
  const limiter = ctx.loginLimiter;
  const audit = auditContext(req);
  const extra = audit.tailscaleUser ? { tailscaleUser: audit.tailscaleUser } : {};

  // 1. Bloqueado: 429 sin mirar la contraseña (solo log, no se audita cada intento).
  const lockedFor = limiter.lockedSeconds(username, channel);
  if (lockedFor > 0) throw lockedError(lockedFor);

  // 2. Siempre se compara con bcrypt (contra un hash de relleno si no existe) para tardar igual.
  const user = await ctx.prisma.user.findUnique({ where: { username } });
  const hash = user?.passwordHash ?? (await getDummyHash(ctx.config.bcryptCost));
  const passwordOk = await verifyPassword(password, hash);

  const fail = async (reason: FailReason): Promise<never> => {
    const result = limiter.recordFailure(username, channel);
    const base = { userId: user?.id ?? null, entityType: 'User', entityId: user?.id ?? null };
    await writeAudit(ctx.prisma, {
      ...base,
      action: 'LOGIN_FAILED',
      details: { username: username.slice(0, 30), reason, ...extra },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    if (result.locked) {
      await writeAudit(ctx.prisma, {
        ...base,
        action: 'LOGIN_LOCKED',
        details: {
          username: username.slice(0, 30),
          lockMinutes: ctx.config.login.lockMinutes,
          ...extra,
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      throw lockedError(result.retryAfterSeconds);
    }
    throw new AppError(401, ERROR_CODES.INVALID_CREDENTIALS, 'Usuario o contraseña incorrectos.', {
      remainingAttempts: result.remainingAttempts,
    });
  };

  if (!user) return fail('UNKNOWN_USER');
  if (!passwordOk) return fail('BAD_PASSWORD');
  if (!user.isActive) return fail('USER_INACTIVE');

  // 3. Contraseña correcta: un empleado no entra por la puerta remota (no suma fallo).
  if (user.role === 'EMPLOYEE' && channel === 'remote') {
    await writeAudit(ctx.prisma, {
      userId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'User',
      entityId: user.id,
      details: { username: username.slice(0, 30), reason: 'REMOTE_ROLE_NOT_ALLOWED', ...extra },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    throw new AppError(403, ERROR_CODES.LOCAL_ONLY, 'Tu usuario solo puede entrar desde el local.');
  }

  // 4. Éxito: lastLoginAt y auditoría en la misma transacción.
  await ctx.prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await writeAudit(tx, {
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: { ...extra },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
  });
  limiter.reset(username, channel);
  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion,
    },
  };
}

function lockedError(retryAfterSeconds: number): AppError {
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return new AppError(
    429,
    ERROR_CODES.LOGIN_LOCKED,
    `Demasiados intentos. Probá de nuevo en ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    { retryAfterSeconds },
  );
}
