// Rutas de configuración (docs/api/productos-stock.md, sección 4).
import { Router } from 'express';
import { UpdateSettingsRequestSchema } from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { getSettings, updateSettings } from './settings.service';

export function createSettingsRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/settings',
    { auth: 'session', access: 'any' },
    async (_req, res) => {
      res.json(await getSettings(ctx));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/settings',
    { auth: 'session', access: 'any', roles: ['OWNER'] },
    async (req, res) => {
      const input = UpdateSettingsRequestSchema.parse(req.body);
      res.json(await updateSettings(ctx, req, input));
    },
  );

  return router;
}
