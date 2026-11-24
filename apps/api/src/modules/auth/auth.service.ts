// Lógica del login (docs/api/auth-usuarios.md, sección 3.1).
import type { Request } from 'express';
import { ERROR_CODES, type ChangePasswordRequest, type LoginRequest } from '@kiosco/shared';
import { auditContext, usernameHmac, writeAudit, writeAuditThrottled } from '../../audit';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import type { Ticket } from './login-limiter';
import { getDummyHash, hashCost, hashPassword, noteStoredCost, verifyPassword } from './password';
import { createSessionRecord } from './session';

type FailReason = 'UNKNOWN_USER' | 'BAD_PASSWORD' | 'USER_INACTIVE' | 'REMOTE_ROLE_NOT_ALLOWED';

export interface LoginResult {
  user: {
    id: number;
    username: string;
    fullName: string;
    role: 'OWNER' | 'MANAGER' | 'EMPLOYEE';
    tokenVersion: number;
    mustChangePassword: boolean;
  };
  /** Sesión ya registrada en la base (la cookie la arma el controlador). */
  session: { id: string; expiresAt: Date };
}

/** Las sesiones vencidas hace más de un día se borran al entrar alguien (la tabla no crece sin fin). */
const OLD_SESSIONS_MS = 24 * 3600 * 1000;

/**
 * Valida las credenciales y audita. Lanza AppError (401, 403, 429 o 503); si todo sale bien
 * devuelve el usuario y la sesión creada.
 *
 * El intento se RESERVA en el limiter antes de tocar bcrypt (el chequeo de bloqueo y la anotación
 * son síncronos): una ráfaga en paralelo no puede probar más de LOGIN_MAX_ATTEMPTS contraseñas.
 */
export async function login(
  ctx: AppContext,
  req: Request,
  input: LoginRequest,
): Promise<LoginResult> {
  const { username } = input;
  const { channel } = ctx;

  // 1. Reserva del intento: bloqueado, demasiados en curso o tope por minuto -> sin mirar la contraseña.
  //    El tope por IP solo aplica a la puerta local (en la remota todos llegan desde el proxy local).
  const begun = ctx.loginLimiter.begin(
    username,
    channel,
    channel === 'local' ? req.socketAddress : null,
  );
  if (!begun.ok) {
    ctx.logger.warn({ channel, reason: begun.reason }, 'Intento de login rechazado por el límite');
    if (begun.reason === 'RATE') {
      throw new AppError(
        429,
        ERROR_CODES.LOGIN_RATE_LIMITED,
        'Demasiados intentos de entrada. Esperá un momento y probá de nuevo.',
        { retryAfterSeconds: begun.retryAfterSeconds },
      );
    }
    throw lockedError(begun.retryAfterSeconds);
  }
  const ticket = begun.ticket;
  try {
    return await attemptLogin(ctx, req, input, ticket);
  } finally {
    // Si no se resolvió (error interno, cola de bcrypt llena), se libera el lugar sin sumar fallo.
    ticket.cancel();
  }
}

async function attemptLogin(
  ctx: AppContext,
  req: Request,
  input: LoginRequest,
  ticket: Ticket,
): Promise<LoginResult> {
  const { username, password } = input;
  const { channel } = ctx;
  const audit = auditContext(req);
  const extra = audit.tailscaleUser ? { tailscaleUser: audit.tailscaleUser } : {};

  // 2. Siempre se compara con bcrypt (contra un hash de relleno si no existe) para tardar igual.
  const user = await ctx.prisma.user.findUnique({ where: { username } });
  if (user) noteStoredCost(user.passwordHash);
  const hash = user?.passwordHash ?? (await getDummyHash(ctx.config.bcryptCost));
  const passwordOk = await verifyPassword(password, hash);

  // Con un usuario inexistente NO se guarda lo escrito (podría ser una contraseña): se guarda un HMAC.
  const who = user
    ? { username: username.slice(0, 30) }
    : { usernameHmac: usernameHmac(ctx.config.jwtSecret, username) };

  const fail = async (reason: FailReason): Promise<never> => {
    const result = ticket.fail();
    const base = { userId: user?.id ?? null, entityType: 'User', entityId: user?.id ?? null };
    await writeAudit(ctx.prisma, {
      ...base,
      action: 'LOGIN_FAILED',
      details: { ...who, reason, ...extra },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    if (result.locked) {
      // Como máximo 1 vez por minuto por usuario (o por IP si el nombre no existe).
      await writeAuditThrottled(
        ctx,
        user ? `user:${user.id}` : `ip:${audit.ipAddress ?? 'desconocida'}`,
        {
          ...base,
          action: 'LOGIN_LOCKED',
          details: { ...who, lockMinutes: ctx.config.login.lockMinutes, ...extra },
          channel: audit.channel,
          ipAddress: audit.ipAddress,
        },
      );
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

  // Si BCRYPT_COST cambió desde que se guardó el hash, se recalcula ahora que tenemos la clave.
  const newHash =
    hashCost(user.passwordHash) !== ctx.config.bcryptCost
      ? await hashPassword(password, ctx.config.bcryptCost)
      : null;

  // 4. Éxito: sesión, lastLoginAt y auditoría en la misma transacción.
  const session = await ctx.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), ...(newHash ? { passwordHash: newHash } : {}) },
    });
    await tx.session.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - OLD_SESSIONS_MS) } },
    });
    const created = await createSessionRecord(tx, ctx, user.id, audit.ipAddress);
    await writeAudit(tx, {
      userId: user.id,
      action: 'LOGIN',
      entityType: 'User',
      entityId: user.id,
      details: { ...extra },
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return created;
  });
  ticket.succeed();
  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.role,
      tokenVersion: user.tokenVersion,
      mustChangePassword: user.mustChangePassword,
    },
    session,
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

/**
 * Cambia la contraseña propia (H-21). Pide la actual; la compara contando intentos con el mismo
 * límite del login (si alguien con una sesión robada adivina la actual, se bloquea igual).
 *
 * Efectos, en una transacción: nueva contraseña, `tokenVersion` + 1, `mustChangePassword = false`,
 * se revocan TODAS las demás sesiones del usuario y se audita `PASSWORD_CHANGE`.
 * La sesión actual sigue abierta: el controlador renueva su cookie con el nuevo `tokenVersion`.
 */
export async function changePassword(
  ctx: AppContext,
  req: Request,
  input: ChangePasswordRequest,
): Promise<{ id: number; tokenVersion: number }> {
  const me = req.user!; // la ruta exige sesión
  const audit = auditContext(req);

  const begun = ctx.loginLimiter.begin(
    me.username,
    ctx.channel,
    ctx.channel === 'local' ? req.socketAddress : null,
  );
  if (!begun.ok) {
    if (begun.reason === 'RATE') {
      throw new AppError(
        429,
        ERROR_CODES.LOGIN_RATE_LIMITED,
        'Demasiados intentos. Esperá un momento y probá de nuevo.',
        { retryAfterSeconds: begun.retryAfterSeconds },
      );
    }
    throw lockedError(begun.retryAfterSeconds);
  }
  const ticket = begun.ticket;
  try {
    const user = await ctx.prisma.user.findUnique({ where: { id: me.id } });
    if (!user)
      throw new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Tu sesión terminó. Volvé a entrar.');
    noteStoredCost(user.passwordHash);
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      const result = ticket.fail();
      if (result.locked) throw lockedError(result.retryAfterSeconds);
      throw new AppError(
        422,
        ERROR_CODES.INVALID_CURRENT_PASSWORD,
        'La contraseña actual no es correcta.',
        { remainingAttempts: result.remainingAttempts },
      );
    }
    const passwordHash = await hashPassword(input.newPassword, ctx.config.bcryptCost);
    const updated = await ctx.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, tokenVersion: { increment: 1 }, mustChangePassword: false },
      });
      // Se cierran las demás sesiones (otros dispositivos); la actual se conserva.
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: req.sessionId! } },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, {
        userId: user.id,
        action: 'PASSWORD_CHANGE',
        entityType: 'User',
        entityId: user.id,
        details: {},
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return u;
    });
    ticket.succeed();
    return { id: updated.id, tokenVersion: updated.tokenVersion };
  } finally {
    ticket.cancel();
  }
}
