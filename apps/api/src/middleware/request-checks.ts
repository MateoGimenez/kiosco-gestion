// CSRF (X-Kiosco + Origin) y tipo de contenido (ADR 003, punto 5).
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@kiosco/shared';
import type { AppContext } from '../context';
import { AppError } from '../errors';
import { expectedOrigin } from './access';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * En todo POST, PUT, PATCH y DELETE (login incluido): `X-Kiosco: 1` y `Origin` del mismo sitio.
 * GET y HEAD nunca cambian datos (regla de diseño de las rutas).
 */
export function csrfCheck(ctx: AppContext): RequestHandler {
  return (req, _res, next) => {
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }
    const origin = req.headers.origin;
    const expected = expectedOrigin(ctx, req);
    const ok =
      req.headers['x-kiosco'] === '1' &&
      typeof origin === 'string' &&
      expected !== null &&
      origin.toLowerCase() === expected;
    if (ok) {
      next();
      return;
    }
    ctx.logger.warn({ method: req.method, path: req.path }, 'Falló el control CSRF');
    next(
      new AppError(
        403,
        ERROR_CODES.CSRF_CHECK_FAILED,
        'El pedido no es válido. Recargá la página.',
      ),
    );
  };
}

/**
 * Si el pedido trae cuerpo, tiene que ser JSON (415 si no). Un pedido sin cuerpo no necesita
 * Content-Type. TODO (etapa 5): rutas de subida con `body: 'multipart'`.
 */
export const requireJsonBody: RequestHandler = (req, _res, next) => {
  const hasBody =
    req.headers['transfer-encoding'] !== undefined ||
    (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0');
  if (hasBody && !req.is('application/json')) {
    next(new AppError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'El pedido tiene que ser JSON.'));
    return;
  }
  next();
};
