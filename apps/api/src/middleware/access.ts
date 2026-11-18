import type { RequestHandler } from 'express';
import type { Channel } from '../channel';

/**
 * Punto de enganche de la clasificación local/remoto: fija `req.access` según la puerta.
 * TODO (ADR 003, pendiente de aprobación): en la puerta local, verificar además que la IP real
 * del socket (`req.socket.remoteAddress`) esté en LOCAL_CIDRS y validar el encabezado Host;
 * si no, responder 403 y auditar. Nunca decidir con X-Forwarded-For ni `req.ip`.
 */
export function setAccess(channel: Channel): RequestHandler {
  return (req, _res, next) => {
    req.access = channel;
    next();
  };
}
