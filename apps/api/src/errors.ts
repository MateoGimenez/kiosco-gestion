// Errores de la aplicación y manejo centralizado (docs/api/README.md, punto 4).
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { ERROR_CODES, type ApiErrorBody } from '@kiosco/shared';

/** Error "esperado" de la app: se traduce tal cual a la respuesta HTTP. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

function body(code: string, message: string, details?: Record<string, unknown>): ApiErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

/** 404 en JSON para cualquier ruta de /api/* que no existe. */
export const apiNotFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, ERROR_CODES.NOT_FOUND, 'La ruta no existe.'));
};

/** Convierte un error de Zod en el formato `details.fields` del contrato. */
function zodDetails(err: ZodError): Record<string, unknown> {
  return {
    fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}

/** Manejador final de errores. Nunca filtra stack, SQL ni detalles internos al cliente. */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  // Express necesita los 4 parámetros para reconocerlo como manejador de errores.
  return (err: unknown, req, res, _next) => {
    if (res.headersSent) {
      // La respuesta ya empezó: no se puede cambiar; se corta la conexión.
      req.socket.destroy();
      return;
    }

    if (err instanceof AppError) {
      res.status(err.status).json(body(err.code, err.message, err.details));
      return;
    }
    if (err instanceof ZodError) {
      res
        .status(400)
        .json(body(ERROR_CODES.VALIDATION_ERROR, 'Hay datos inválidos.', zodDetails(err)));
      return;
    }

    // Errores del parser de JSON (los marca body-parser con `type`).
    const parserType = (err as { type?: unknown } | null)?.type;
    if (parserType === 'entity.parse.failed') {
      res
        .status(400)
        .json(body(ERROR_CODES.VALIDATION_ERROR, 'El cuerpo del pedido no es un JSON válido.'));
      return;
    }
    if (parserType === 'entity.too.large') {
      res.status(413).json(body(ERROR_CODES.PAYLOAD_TOO_LARGE, 'El pedido es demasiado grande.'));
      return;
    }

    // Cualquier otra cosa es un error inesperado: se registra completo y al cliente va el genérico.
    logger.error({ err }, 'Error inesperado');
    res
      .status(500)
      .json(body(ERROR_CODES.INTERNAL_ERROR, 'Ocurrió un error inesperado. Probá de nuevo.'));
  };
}
