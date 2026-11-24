// Lógica de usuarios (docs/api/auth-usuarios.md, sección 4). Solo la usa el dueño.
import type { Request } from 'express';
import {
  ERROR_CODES,
  type CreateUserRequest,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type User,
  type UserListQuery,
} from '@kiosco/shared';
import { auditContext, writeAudit, type Db } from '../../audit';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import type { User as DbUser } from '../../generated/client';
import { hashPassword } from '../auth/password';
import { revokeUserSessions } from '../auth/session';

/** Campos que se pueden auditar/cambiar desde el ABM. */
type Editable = 'username' | 'fullName' | 'role' | 'isActive';
const EDITABLE: Editable[] = ['username', 'fullName', 'role', 'isActive'];

/**
 * Arma la respuesta campo por campo: nunca se devuelve el objeto de la base tal cual
 * (así passwordHash y tokenVersion no pueden salir por error).
 */
export function toUserDto(u: DbUser): User {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === 'P2002';
}

function usernameTaken(): AppError {
  return new AppError(409, ERROR_CODES.USERNAME_TAKEN, 'Ya existe un usuario con ese nombre.', {
    field: 'username',
  });
}

async function findOrThrow(db: Db, id: number): Promise<DbUser> {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new AppError(404, ERROR_CODES.NOT_FOUND, 'El usuario no existe.');
  return user;
}

export async function listUsers(ctx: AppContext, query: UserListQuery): Promise<User[]> {
  const users = await ctx.prisma.user.findMany({
    where: {
      ...(query.isActive ? { isActive: query.isActive === 'true' } : {}),
      ...(query.role ? { role: query.role } : {}),
    },
    orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
  });
  return users.map(toUserDto);
}

export async function getUser(ctx: AppContext, id: number): Promise<User> {
  return toUserDto(await findOrThrow(ctx.prisma, id));
}

export async function createUser(
  ctx: AppContext,
  req: Request,
  input: CreateUserRequest,
): Promise<User> {
  const passwordHash = await hashPassword(input.password, ctx.config.bcryptCost);
  const audit = auditContext(req);
  try {
    const created = await ctx.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          fullName: input.fullName,
          role: input.role,
          passwordHash,
        },
      });
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'USER_CREATE',
        entityType: 'User',
        entityId: user.id,
        details: {
          after: {
            username: user.username,
            fullName: user.fullName,
            role: user.role,
            isActive: user.isActive,
          },
        },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return user;
    });
    return toUserDto(created);
  } catch (err) {
    if (isUniqueViolation(err)) throw usernameTaken();
    throw err;
  }
}

export async function updateUser(
  ctx: AppContext,
  req: Request,
  id: number,
  input: UpdateUserRequest,
): Promise<User> {
  const audit = auditContext(req);
  // Nombre anterior y si cambió el nombre o el rol: en ese caso se borra el contador de intentos.
  let previousUsername: string | null = null;
  let identityChanged = false;
  try {
    const result = await ctx.prisma.$transaction(async (tx) => {
      const current = await findOrThrow(tx, id);
      previousUsername = current.username;

      // Solo cuentan los campos que realmente cambian.
      const before: Record<string, string | boolean> = {};
      const after: Record<string, string | boolean> = {};
      for (const field of EDITABLE) {
        const next = input[field];
        if (next !== undefined && next !== current[field]) {
          before[field] = current[field];
          after[field] = next;
        }
      }
      if (Object.keys(after).length === 0) return toUserDto(current); // nada cambió: 200 sin auditar

      // TODO (H-19, pendiente del dueño): si el cambio deja al sistema sin ningún dueño activo
      // (desactivar o bajar de rol al último), responder 422 LAST_ACTIVE_OWNER.
      // H-20 (pendiente): hoy subir de rol o reactivar desde la puerta remota está permitido.

      identityChanged = 'username' in after || 'role' in after;
      const deactivating = current.isActive && after.isActive === false;
      const updated = await tx.user.update({
        where: { id },
        data: {
          ...after,
          // Desactivar corta todas las sesiones del usuario.
          ...(deactivating ? { tokenVersion: { increment: 1 } } : {}),
        },
      });
      // Además de tokenVersion (respaldo), se revocan todas sus sesiones.
      if (deactivating) await revokeUserSessions(tx, id);
      await writeAudit(tx, {
        userId: req.user?.id ?? null,
        action: 'USER_UPDATE',
        entityType: 'User',
        entityId: id,
        details: { before, after },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
      return toUserDto(updated);
    });
    // Renombrar o cambiar de rol borra el contador de intentos (del nombre viejo y del nuevo).
    if (identityChanged) {
      if (previousUsername) ctx.loginLimiter.resetUser(previousUsername);
      ctx.loginLimiter.resetUser(result.username);
    }
    return result;
  } catch (err) {
    if (isUniqueViolation(err)) throw usernameTaken();
    throw err;
  }
}

export async function resetPassword(
  ctx: AppContext,
  req: Request,
  id: number,
  input: ResetPasswordRequest,
): Promise<User> {
  const passwordHash = await hashPassword(input.newPassword, ctx.config.bcryptCost);
  const audit = auditContext(req);
  const updated = await ctx.prisma.$transaction(async (tx) => {
    await findOrThrow(tx, id);
    // tokenVersion + 1: se cortan todas las sesiones de ese usuario.
    const user = await tx.user.update({
      where: { id },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    // Se revocan todas sus sesiones (tokenVersion queda como respaldo).
    await revokeUserSessions(tx, id);
    await writeAudit(tx, {
      userId: req.user?.id ?? null,
      action: 'PASSWORD_RESET',
      entityType: 'User',
      entityId: id,
      details: {},
      channel: audit.channel,
      ipAddress: audit.ipAddress,
    });
    return user;
  });
  // Borra el contador de intentos fallidos en las dos puertas.
  ctx.loginLimiter.resetUser(updated.username);
  return toUserDto(updated);
}
