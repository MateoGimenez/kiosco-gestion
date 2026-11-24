// Rutas de login, logout y "quién soy" (docs/api/auth-usuarios.md, sección 3).
import { Router, type RequestHandler } from 'express';
import { LoginRequestSchema, type SessionResponse } from '@kiosco/shared';
import { auditContext, writeAudit } from '../../audit';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import { markSafeMiddleware } from '../../middleware/marks';
import { defineRoute } from '../../middleware/route';
import { login } from './auth.service';
import { clearSessionCookie, revokeRequestSession, revokeSession, startSession } from './session';

export function createAuthRouter(ctx: AppContext): Router {
  const router = Router();
  const access = ctx.channel === 'remote' ? 'REMOTE' : 'LOCAL';

  // Las respuestas de /api/auth/* no se guardan en ninguna caché.
  const noStore: RequestHandler = markSafeMiddleware((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.use('/api/auth', noStore);

  defineRoute(
    ctx,
    router,
    'post',
    '/api/auth/login',
    { auth: 'public', access: 'any' },
    async (req, res) => {
      const input = LoginRequestSchema.parse(req.body);
      try {
        const { user, session } = await login(ctx, req, input);
        // Si el pedido traía una sesión de esta puerta (otro usuario), se revoca: no queda abierta.
        await revokeRequestSession(ctx, req);
        startSession(ctx, res, user, session);
        const expiresAt = session.expiresAt;
        const body: SessionResponse = {
          user: { id: user.id, username: user.username, fullName: user.fullName, role: user.role },
          access,
          expiresAt: expiresAt.toISOString(),
        };
        res.json(body);
      } catch (err) {
        if (err instanceof AppError && (err.status === 429 || err.status === 503)) {
          const seconds = Number(err.details?.retryAfterSeconds ?? 0);
          res.set('Retry-After', String(seconds));
        }
        throw err;
      }
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/auth/logout',
    { auth: 'optional', access: 'any' },
    async (req, res) => {
      if (req.user) {
        // La sesión queda revocada en la base: el token ya no sirve aunque alguien lo haya copiado.
        await revokeSession(ctx.prisma, req.sessionId!);
        const audit = auditContext(req);
        await writeAudit(ctx.prisma, {
          userId: req.user.id,
          action: 'LOGOUT',
          entityType: 'User',
          entityId: req.user.id,
          details: {},
          channel: audit.channel,
          ipAddress: audit.ipAddress,
        });
      }
      clearSessionCookie(ctx, res);
      res.status(204).end();
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/auth/me',
    { auth: 'session', access: 'any' },
    (req, res) => {
      const user = req.user!; // requireSession garantiza que existe
      const body: SessionResponse = {
        user,
        access,
        expiresAt: (req.sessionExpiresAt ?? new Date()).toISOString(),
      };
      res.json(body);
    },
  );

  return router;
}
