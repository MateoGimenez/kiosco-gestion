// Fábrica de la aplicación Express. Se llama una vez por puerta (local y remota),
// así cada listener tiene su propio `channel` (ADR 003).
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { AuditThrottle } from './audit';
import type { Channel } from './channel';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import { apiNotFound, createErrorHandler } from './errors';
import type { PrismaClient } from './generated/client';
import { markSafeMiddleware } from './middleware/marks';
import { classifyAccess, validateHost } from './middleware/access';
import { csrfCheck, requireJsonBody } from './middleware/request-checks';
import { createAuthRouter } from './modules/auth/auth.routes';
import { LoginLimiter } from './modules/auth/login-limiter';
import { createCashRouter } from './modules/cash/cash.routes';
import { createCategoriesRouter } from './modules/categories/categories.routes';
import { createHealthRouter } from './modules/health/health.routes';
import { createPaymentMethodsRouter } from './modules/payment-methods/payment-methods.routes';
import { createProductsRouter } from './modules/products/products.routes';
import { createPurchasesRouter } from './modules/purchases/purchases.routes';
import { createSuppliersRouter } from './modules/suppliers/suppliers.routes';
import { createSalesRouter } from './modules/sales/sales.routes';
import { createSettingsRouter } from './modules/settings/settings.routes';
import { createStockRouter } from './modules/stock/stock.routes';
import { createUsersRouter } from './modules/users/users.routes';

export interface CreateAppOptions {
  channel: Channel;
  logger: Logger;
  config: AppConfig;
  prisma: PrismaClient;
  /** Contador de intentos de login. Si no se pasa, se crea uno propio de esta puerta. */
  loginLimiter?: LoginLimiter;
  /** SOLO PARA TESTS: dirección de socket simulada (ADR 003, punto 10). */
  remoteAddressOverride?: AppContext['remoteAddressOverride'];
}

/** Tamaño máximo del cuerpo JSON. Alcanza de sobra para una venta con muchas líneas. */
const JSON_BODY_LIMIT = '100kb';

export function createApp(options: CreateAppOptions): Express {
  const { channel, logger, config, prisma } = options;
  const ctx: AppContext = {
    channel,
    config,
    prisma,
    logger,
    loginLimiter: options.loginLimiter ?? new LoginLimiter(config.login),
    auditThrottle: new AuditThrottle(),
    remoteAddressOverride: options.remoteAddressOverride,
  };
  const app = express();

  // Sin proxy confiable: las IP y encabezados X-Forwarded-* no se usan para decidir nada (ADR 003).
  // No hay variable para cambiarlo.
  app.set('trust proxy', false);
  app.disable('x-powered-by');

  // CSP sin fuentes externas (ADR 003): el frontend no carga nada de internet.
  const csp = {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'font-src': ["'self'", 'data:'],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      // La puerta local es HTTP (WiFi del local): sin "upgrade-insecure-requests", que dejaría
      // las pantallas sin cargar. La remota es HTTPS.
      ...(channel === 'local' ? { 'upgrade-insecure-requests': null } : {}),
    },
  };
  app.use(
    helmet({
      contentSecurityPolicy: csp,
      // Sin HSTS en la local (HTTP); con HSTS en la remota.
      ...(channel === 'local' ? { hsts: false } : {}),
    }),
  );

  // Orden de los controles (ADR 003, punto 5): puerta y red -> Host -> registro -> CSRF ->
  // cuerpo -> (por ruta) sesión, rol, puerta de la ruta y validación.
  app.use(classifyAccess(ctx));
  app.use(validateHost(ctx));
  app.use(pinoHttp({ logger }));
  app.use(csrfCheck(ctx));
  app.use(requireJsonBody);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // Nada de /api se guarda en disco ni en cachés (hay costos y márgenes en las respuestas).
  app.use(
    '/api',
    markSafeMiddleware((_req, res, next) => {
      res.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' });
      next();
    }),
  );

  // Sin CORS a propósito (ADR 001): no se responde nunca Access-Control-Allow-*.
  app.use(createHealthRouter(ctx));
  app.use(createAuthRouter(ctx));
  app.use(createUsersRouter(ctx));
  app.use(createSettingsRouter(ctx));
  app.use(createCategoriesRouter(ctx));
  app.use(createProductsRouter(ctx));
  app.use(createStockRouter(ctx));
  app.use(createCashRouter(ctx));
  app.use(createPaymentMethodsRouter(ctx));
  app.use(createSalesRouter(ctx));
  app.use(createSuppliersRouter(ctx));
  app.use(createPurchasesRouter(ctx));
  // Acá se montan los módulos de cada etapa (products, sales...). Toda ruta nueva se
  // registra con `defineRoute`: un test falla si alguna no declara `access`.

  app.use('/api', apiNotFound);
  app.use(createErrorHandler(logger));
  return app;
}
