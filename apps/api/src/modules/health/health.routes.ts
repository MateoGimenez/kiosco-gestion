import { Router } from 'express';
import { ERROR_CODES } from '@kiosco/shared';
import type { AppContext } from '../../context';
import { AppError } from '../../errors';
import { defineRoute } from '../../middleware/route';

export function createHealthRouter(ctx: AppContext): Router {
  const router = Router();

  // Sin sesión. No expone versión, entorno ni datos internos.
  defineRoute(
    ctx,
    router,
    'get',
    '/api/health',
    { auth: 'public', access: 'any' },
    async (_req, res) => {
      try {
        await ctx.prisma.$queryRaw`SELECT 1`;
      } catch (err) {
        ctx.logger.error({ err }, 'La base de datos no responde');
        throw new AppError(
          503,
          ERROR_CODES.DATABASE_UNAVAILABLE,
          'No se puede conectar con la base de datos.',
        );
      }
      res.set('Cache-Control', 'no-store').json({ status: 'ok' });
    },
  );

  return router;
}
