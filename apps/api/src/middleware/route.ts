// Declaración obligatoria de cada ruta (ADR 003, punto 6): sesión, puerta (`access`) y roles.
// Toda ruta se registra con `defineRoute`; un test recorre la pila de Express y falla si alguna
// ruta no pasó por acá (así nadie agrega una ruta de caja olvidándose del bloqueo "solo local").
import type { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import { ERROR_CODES, type UserRole } from '@kiosco/shared';
import { auditContext, writeAudit } from '../audit';
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
  /** Mensaje del 403 LOCAL_ONLY. */
  localOnlyMessage?: string;
}

/** Marca que lleva el primer middleware de cada ruta; el test la busca. */
export const ROUTE_SPEC = Symbol.for('kiosco.routeSpec');
/** Marca del middleware que bloquea la puerta remota. */
export const LOCAL_GUARD = Symbol.for('kiosco.localGuard');

type Marked = RequestHandler & { [ROUTE_SPEC]?: RouteSpec; [LOCAL_GUARD]?: true };

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

/** Bloquea el pedido remoto con 403 LOCAL_ONLY y lo audita como ACCESS_DENIED. */
export function requireLocal(ctx: AppContext, message?: string): RequestHandler {
  const guard: Marked = async (req: Request, _res: Response, next: NextFunction) => {
    if (req.access !== 'remote') {
      next();
      return;
    }
    try {
      const audit = auditContext(req);
      await writeAudit(ctx.prisma, {
        userId: req.user?.id ?? null,
        action: 'ACCESS_DENIED',
        entityType: 'Route',
        entityId: `${req.method} ${req.route?.path ?? req.path}`,
        details: { reason: 'LOCAL_ONLY' },
        channel: audit.channel,
        ipAddress: audit.ipAddress,
      });
    } catch (err) {
      ctx.logger.error({ err }, 'No se pudo auditar ACCESS_DENIED');
    }
    next(
      new AppError(
        403,
        ERROR_CODES.LOCAL_ONLY,
        message ?? 'Esta acción solo se puede hacer desde el local.',
      ),
    );
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
  if (spec.roles) chain.push(requireRole(spec.roles));
  if (spec.access === 'local') chain.push(requireLocal(ctx, spec.localOnlyMessage));
  router[method](path, ...chain, handler);
}
