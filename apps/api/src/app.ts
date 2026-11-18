// Fábrica de la aplicación Express. Se llama una vez por puerta (local y remota),
// así cada listener tiene su propio `channel` (ver análisis de seguridad / ADR 003).
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { Channel } from './channel';
import { apiNotFound, createErrorHandler } from './errors';
import { setAccess } from './middleware/access';
import { healthRouter } from './modules/health/health.routes';

export interface CreateAppOptions {
  channel: Channel;
  logger: Logger;
}

/** Tamaño máximo del cuerpo JSON. Alcanza de sobra para una venta con muchas líneas. */
const JSON_BODY_LIMIT = '100kb';

export function createApp({ channel, logger }: CreateAppOptions): Express {
  const app = express();

  // Sin proxy confiable: las IP y encabezados X-Forwarded-* no se usan para decidir nada (ADR 003).
  app.set('trust proxy', false);
  app.disable('x-powered-by');

  app.use(
    helmet(
      channel === 'local'
        ? {
            // La puerta local es HTTP (WiFi del local): sin HSTS ni "upgrade-insecure-requests",
            // que dejarían las pantallas sin cargar.
            hsts: false,
            contentSecurityPolicy: {
              useDefaults: true,
              directives: { 'upgrade-insecure-requests': null },
            },
          }
        : {}, // La remota es HTTPS (Tailscale): helmet con sus valores por defecto, con HSTS.
    ),
  );
  app.use(pinoHttp({ logger }));
  app.use(setAccess(channel));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use('/api/health', healthRouter);
  // Acá se montan los módulos de cada etapa (auth, users, products...).

  app.use('/api', apiNotFound);
  app.use(createErrorHandler(logger));
  return app;
}
