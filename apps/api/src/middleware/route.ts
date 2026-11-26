// Declaración obligatoria de cada ruta (ADR 003, punto 6): sesión, puerta (`access`) y roles.
// Toda ruta se registra con `defineRoute`; un test recorre la pila de Express y falla si alguna
// ruta no pasó por acá (así nadie agrega una ruta de caja olvidándose del bloqueo "solo local").
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { ERROR_CODES, type UserRole } from '@kiosco/shared';
import { auditContext, writeAuditThrottled } from '../audit';
import type { AppContext } from '../context';
import { AppError } from '../errors';
import { optionalSession, requireSession } from '../modules/auth/session';

export interface RouteSpec {
  /** `public`: sin sesión. `optional`: si hay, se usa (logout). `session`: obligatoria. */
  auth: 'public' | 'optional' | 'session';
  /** `local`: solo por la puerta local (403 LOCAL_ONLY desde la remota). Obligatorio. */
  access: 'any' | 'local';
  /** Roles permitidos (solo con auth `session`). Sin lista: cualquier usuario con sesión. */
  roles?: readonly UserRole[];
  /**
   * Con auth `session`: si es true, la ruta también se puede usar mientras el usuario tiene
   * `mustChangePassword` (solo `me` y `change-password`). Por defecto, esas rutas dan 403 PASSWORD_CHANGE_REQUIRED.
   */
  allowPasswordChangePending?: boolean;
  /**
   * Tipo de cuerpo. `json` (por defecto) o `multipart` (subidas, ADR 003 punto 5): solo la ruta de
   * adjuntos. Una ruta `multipart` tiene que figurar en `MULTIPART_ROUTES` (lo verifica un test).
   */
  body?: 'json' | 'multipart';
  /** Mensaje del 403 LOCAL_ONLY. */
  localOnlyMessage?: string;
}

/** Marca que lleva el primer middleware de cada ruta; el test la busca. */
export const ROUTE_SPEC = Symbol.for('kiosco.routeSpec');
/** Marca del middleware que bloquea la puerta remota. */
export const LOCAL_GUARD = Symbol.for('kiosco.localGuard');

type Marked = RequestHandler & { [ROUTE_SPEC]?: RouteSpec; [LOCAL_GUARD]?: true };

/** H-21: mientras tenga que cambiar la contraseña, el resto de la API responde 403 PASSWORD_CHANGE_REQUIRED. */
export const requirePasswordChanged: RequestHandler = (req, _res, next) => {
  if (req.user?.mustChangePassword) {
    next(
      new AppError(
        403,
        ERROR_CODES.PASSWORD_CHANGE_REQUIRED,
        'Tenés que cambiar tu contraseña antes de seguir.',
      ),
    );
    return;
  }
  next();
};

/** Rol: si el rol nunca puede hacer la acción, 403 FORBIDDEN (va antes que la puerta). */
export function requireRole(roles: readonly UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (req.user && roles.includes(req.user.role)) {
      next();
      return;
    }
    next(new AppError(403, ERROR_CODES.FORBIDDEN, 'No tenés permiso para hacer esto.'));
  };
}

/**
 * Rechaza un pedido que vino por la puerta remota: audita `ACCESS_DENIED` (como máximo 1 fila por
 * minuto por usuario, o por IP si no hay sesión) y lanza 403 LOCAL_ONLY. Lo usan `requireLocal` y los
 * servicios que solo bloquean una parte de la acción (pago con efectivo de la caja, ADR 003 punto 6).
 */
export async function denyRemote(ctx: AppContext, req: Request, message?: string): Promise<never> {
  const audit = auditContext(req);
  const who = req.user ? `user:${req.user.id}` : `ip:${audit.ipAddress ?? 'desconocida'}`;
  await writeAuditThrottled(ctx, who, {
    userId: req.user?.id ?? null,
    action: 'ACCESS_DENIED',
    entityType: 'Route',
    entityId: `${req.method} ${req.route?.path ?? req.path}`,
    details: { reason: 'LOCAL_ONLY' },
    channel: audit.channel,
    ipAddress: audit.ipAddress,
  });
  throw new AppError(
    403,
    ERROR_CODES.LOCAL_ONLY,
    message ?? 'Esta acción solo se puede hacer desde el local.',
  );
}

/** Bloquea el pedido remoto con 403 LOCAL_ONLY y lo audita como ACCESS_DENIED. */
export function requireLocal(ctx: AppContext, message?: string): RequestHandler {
  const guard: Marked = async (req: Request, _res: Response, next: NextFunction) => {
    if (req.access !== 'remote') {
      next();
      return;
    }
    try {
      await denyRemote(ctx, req, message);
    } catch (err) {
      next(err);
    }
  };
  guard[LOCAL_GUARD] = true;
  return guard;
}

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Registra una ruta con su declaración. Es la única forma permitida de crear rutas. */
export function defineRoute(
  ctx: AppContext,
  router: Router,
  method: HttpMethod,
  path: string,
  spec: RouteSpec,
  handler: RequestHandler,
): void {
  const chain: Marked[] = [];
  const sessionMiddleware: Marked =
    spec.auth === 'session'
      ? requireSession(ctx)
      : spec.auth === 'optional'
        ? optionalSession(ctx)
        : (_req, _res, next) => next();
  sessionMiddleware[ROUTE_SPEC] = spec;
  chain.push(sessionMiddleware);
  if (spec.auth === 'session' && !spec.allowPasswordChangePending)
    chain.push(requirePasswordChanged);
  if (spec.roles) chain.push(requireRole(spec.roles));
  if (spec.access === 'local') chain.push(requireLocal(ctx, spec.localOnlyMessage));
  router[method](path, ...chain, handler);
}
