// Sesión: JWT en cookie httpOnly, una cookie por puerta (ADR 003, punto 4).
import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ERROR_CODES } from '@kiosco/shared';
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

/** Crea el JWT y la cookie de la puerta. Devuelve el vencimiento fijo de la sesión. */
export function startSession(
  ctx: AppContext,
  res: Response,
  user: { id: number; tokenVersion: number },
): Date {
  const seconds = sessionHours(ctx) * 3600;
  const payload: TokenPayload = { sub: String(user.id), tv: user.tokenVersion, ch: ctx.channel };
  const token = jwt.sign(payload, ctx.config.jwtSecret, { algorithm: 'HS256', expiresIn: seconds });
  res.cookie(COOKIE_NAMES[ctx.channel], token, {
    ...cookieOptions(ctx.channel),
    maxAge: seconds * 1000,
  });
  return new Date(Date.now() + seconds * 1000);
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
 * Valida la sesión del pedido: firma HS256 y vencimiento, y después RELEE al usuario de la base
 * y exige: existe, isActive, tokenVersion igual a `tv`, `ch` igual a la puerta y, en la remota,
 * que no sea EMPLOYEE. Devuelve true si la sesión es válida (y deja `req.user`).
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
  if (!Number.isInteger(id) || payload.ch !== ctx.channel || typeof payload.tv !== 'number') {
    return false;
  }

  const user = await ctx.prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      fullName: true,
      role: true,
      isActive: true,
      tokenVersion: true,
    },
  });
  if (!user || !user.isActive || user.tokenVersion !== payload.tv) return false;
  if (ctx.channel === 'remote' && user.role === 'EMPLOYEE') return false;

  req.user = { id: user.id, username: user.username, fullName: user.fullName, role: user.role };
  req.sessionExpiresAt = new Date((payload.exp ?? 0) * 1000);
  return true;
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
