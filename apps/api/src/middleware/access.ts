// Primeros controles de cada pedido (ADR 003, punto 5): puerta + red, y Host.
import type { Request, RequestHandler } from 'express';
import { ERROR_CODES } from '@kiosco/shared';
import { writeAudit } from '../audit';
import type { AppContext } from '../context';
import { AppError } from '../errors';
import { auditIp, hostnameOf, isLocalAddress, parseCidrs } from '../network';

/**
 * Fija `req.access` según la PUERTA (nunca por encabezados). En la puerta local, además,
 * la IP real del socket tiene que estar en LOCAL_CIDRS: si no, 403 NETWORK_NOT_ALLOWED y
 * se audita como ACCESS_DENIED. No se "degrada" a remoto.
 */
export function classifyAccess(ctx: AppContext): RequestHandler {
  const ranges = parseCidrs(ctx.config.network.localCidrs);
  return async (req, _res, next) => {
    req.access = ctx.channel;
    req.socketAddress = ctx.remoteAddressOverride
      ? ctx.remoteAddressOverride(req)
      : req.socket.remoteAddress;

    if (ctx.channel === 'remote' || isLocalAddress(req.socketAddress, ranges)) {
      next();
      return;
    }
    // Fuera de las redes del local. Se audita sin romper la respuesta si la base falla.
    try {
      await writeAudit(ctx.prisma, {
        action: 'ACCESS_DENIED',
        entityType: 'Route',
        entityId: `${req.method} ${req.path}`,
        details: { reason: 'NETWORK_NOT_ALLOWED' },
        channel: 'LOCAL',
        ipAddress: auditIp('local', req.socketAddress, undefined),
      });
    } catch (err) {
      ctx.logger.error({ err }, 'No se pudo auditar ACCESS_DENIED');
    }
    next(
      new AppError(
        403,
        ERROR_CODES.NETWORK_NOT_ALLOWED,
        'Este equipo no está en la red del local.',
      ),
    );
  };
}

/** Control de `Host` contra "DNS rebinding". Los rechazos van solo al log. */
export function validateHost(ctx: AppContext): RequestHandler {
  const allowed = new Set(ctx.config.network.localAllowedHosts);
  const remoteHost = ctx.config.network.remoteHost;
  return (req, _res, next) => {
    const host = hostnameOf(req.headers.host);
    const ok = host !== null && (ctx.channel === 'local' ? allowed.has(host) : host === remoteHost);
    if (ok) {
      next();
      return;
    }
    ctx.logger.warn({ host: req.headers.host, channel: ctx.channel }, 'Host no permitido');
    next(
      new AppError(
        403,
        ERROR_CODES.HOST_NOT_ALLOWED,
        'El nombre con el que entraste no está permitido.',
      ),
    );
  };
}

/** Origen esperado para el CSRF según la puerta (ADR 003, punto 5, capa 3). */
export function expectedOrigin(ctx: AppContext, req: Request): string | null {
  if (ctx.channel === 'remote')
    return ctx.config.network.remoteHost ? `https://${ctx.config.network.remoteHost}` : null;
  return req.headers.host ? `http://${req.headers.host.toLowerCase()}` : null;
}
