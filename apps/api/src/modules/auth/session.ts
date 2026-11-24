// Sesión: JWT en cookie httpOnly, una cookie por puerta (ADR 003, punto 4).
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '@kiosco/shared';
import type { Db } from '../../audit';
import type { Channel } from '../../channel';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';

/** Los nombres NO son configurables a propósito. */
export const COOKIE_NAMES: Record<Channel, string> = {
  local: 'kiosco_sid',
  remote: '__Host-kiosco_sid',
};

/** Lo único que lleva el JWT: nada de rol, nombre ni datos sensibles. */
interface TokenPayload {
  sub: string;
  tv: number;
  ch: Channel;
  /** Id de la fila de `sessions`: sin esa fila vigente, el token no vale. */
  sid: string;
}

function cookieOptions(channel: Channel): CookieOptions {
  return {
    httpOnly: true,
    // Secure lo decide la PUERTA (remota = HTTPS), nunca NODE_ENV.
    secure: channel === 'remote',
    sameSite: 'strict',
    path: '/',
  };
}

function sessionHours(ctx: AppContext): number {
  return ctx.channel === 'remote' ? ctx.config.remoteSessionHours : ctx.config.sessionHours;
}

/** Segundos de vida de una sesión nueva en esta puerta. */
export function sessionSeconds(ctx: AppContext): number {
  return sessionHours(ctx) * 3600;
}

/** Registra una sesión nueva (id aleatorio) con vencimiento fijo. Se llama dentro de la transacción del login. */
export async function createSessionRecord(
  db: Db,
  ctx: AppContext,
  userId: number,
  ipAddress: string | null,
): Promise<{ id: string; expiresAt: Date }> {
  const id = randomBytes(32).toString('base64url');
  // Segundos enteros: el vencimiento de la fila y el `exp` del JWT coinciden.
  const expiresAt = new Date(Math.floor(Date.now() / 1000) * 1000 + sessionSeconds(ctx) * 1000);
  await db.session.create({
    data: {
      id,
      userId,
      channel: ctx.channel === 'remote' ? 'REMOTE' : 'LOCAL',
      expiresAt,
      ipAddress,
    },
  });
  return { id, expiresAt };
}

/** Crea el JWT y la cookie de la puerta para una sesión ya registrada. */
export function startSession(
  ctx: AppContext,
  res: Response,
  user: { id: number; tokenVersion: number },
  session: { id: string; expiresAt: Date },
): void {
  const payload: TokenPayload = {
    sub: String(user.id),
    tv: user.tokenVersion,
    ch: ctx.channel,
    sid: session.id,
  };
  // `exp` explícito: coincide con el vencimiento de la fila de `sessions`.
  const token = jwt.sign(
    { ...payload, exp: Math.floor(session.expiresAt.getTime() / 1000) },
    ctx.config.jwtSecret,
    { algorithm: 'HS256' },
  );
  res.cookie(COOKIE_NAMES[ctx.channel], token, {
    ...cookieOptions(ctx.channel),
    maxAge: sessionSeconds(ctx) * 1000,
  });
}

/** Revoca una sesión (logout). No falla si ya estaba revocada o no existe. */
export async function revokeSession(db: Db, sessionId: string): Promise<void> {
  await db.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Corta TODAS las sesiones vigentes de un usuario (reseteo de contraseña, desactivación). */
export async function revokeUserSessions(db: Db, userId: number): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function clearSessionCookie(ctx: AppContext, res: Response): void {
  res.clearCookie(COOKIE_NAMES[ctx.channel], cookieOptions(ctx.channel));
}

/** Lee una cookie por nombre (la primera que aparezca). */
function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      const raw = part.slice(eq + 1).trim();
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return undefined;
}

/**
 * Valida la sesión del pedido: firma HS256, `exp` obligatorio y `sid`; después consulta la fila
 * de `sessions` (existe, no revocada, no vencida, de esta puerta y de ese usuario) y RELEE al
 * usuario: existe, isActive, tokenVersion igual a `tv` y, en la remota, que no sea EMPLOYEE.
 * Devuelve true si la sesión es válida (y deja `req.user`, `req.sessionId`, `req.sessionExpiresAt`).
 */
async function loadSession(ctx: AppContext, req: Request): Promise<boolean> {
  const token = readCookie(req, COOKIE_NAMES[ctx.channel]);
  if (!token) return false;

  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(token, ctx.config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') return false;
    payload = decoded;
  } catch {
    return false;
  }
  const id = Number(payload.sub);
  if (
    !Number.isInteger(id) ||
    payload.ch !== ctx.channel ||
    typeof payload.tv !== 'number' ||
    typeof payload.sid !== 'string' ||
    // Un token sin vencimiento nunca se acepta.
    typeof payload.exp !== 'number'
  ) {
    return false;
  }

  const session = await ctx.prisma.session.findUnique({
    where: { id: payload.sid },
    select: {
      id: true,
      userId: true,
      channel: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          fullName: true,
          role: true,
          isActive: true,
          tokenVersion: true,
        },
      },
    },
  });
  if (
    !session ||
    session.revokedAt !== null ||
    session.expiresAt.getTime() <= Date.now() ||
    session.userId !== id ||
    session.channel !== (ctx.channel === 'remote' ? 'REMOTE' : 'LOCAL')
  ) {
    return false;
  }
  const user = session.user;
  if (!user.isActive || user.tokenVersion !== payload.tv) return false;
  if (ctx.channel === 'remote' && user.role === 'EMPLOYEE') return false;

  req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  req.sessionId = session.id;
  req.sessionExpiresAt = new Date(payload.exp * 1000);
  return true;
}

/**
 * Revoca la sesión que trae el pedido, si es válida (al entrar con otra cuenta en la misma
 * puerta, la sesión anterior no puede quedar abierta).
 */
export async function revokeRequestSession(ctx: AppContext, req: Request): Promise<void> {
  if (await loadSession(ctx, req)) await revokeSession(ctx.prisma, req.sessionId!);
}

/** Sesión obligatoria: si no es válida, 401 UNAUTHENTICATED y se borra la cookie. */
export function requireSession(ctx: AppContext): RequestHandler {
  return async (req, res, next) => {
    if (await loadSession(ctx, req)) {
      next();
      return;
    }
    clearSessionCookie(ctx, res);
    next(new AppError(401, ERROR_CODES.UNAUTHENTICATED, 'Tu sesión terminó. Volvé a entrar.'));
  };
}

/** Sesión opcional (logout): si es válida deja `req.user`; si no, sigue sin error. */
export function optionalSession(ctx: AppContext): RequestHandler {
  return async (req, _res, next) => {
    await loadSession(ctx, req);
    next();
  };
}
