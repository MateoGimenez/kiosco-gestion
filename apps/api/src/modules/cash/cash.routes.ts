// Rutas de caja (docs/api/caja.md). `/current` va ANTES de cualquier `/:id` (la etapa 4 lo agrega).
import { Router } from 'express';
import { CashSessionListQuerySchema, OpenCashSessionRequestSchema } from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { getCurrent, listCashSessions, openCashSession } from './cash.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createCashRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/cash-sessions/current',
    { auth: 'session', access: 'any' },
    async (req, res) => {
      res.json(await getCurrent(ctx, req.user!.role));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/cash-sessions',
    { auth: 'session', access: 'local', localOnlyMessage: 'La caja se abre desde el local.' },
    async (req, res) => {
      const input = OpenCashSessionRequestSchema.parse(req.body);
      res.status(201).json(await openCashSession(ctx, req, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/cash-sessions',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await listCashSessions(ctx, CashSessionListQuerySchema.parse(req.query)));
    },
  );

  return router;
}
