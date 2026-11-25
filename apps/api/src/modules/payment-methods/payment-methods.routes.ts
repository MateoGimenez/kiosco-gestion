// Rutas de medios de pago (docs/api/ventas.md, sección 5).
import { Router } from 'express';
import { IdParamSchema, UpdatePaymentMethodRequestSchema } from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { listPaymentMethods, updatePaymentMethod } from './payment-methods.service';

export function createPaymentMethodsRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/payment-methods',
    { auth: 'session', access: 'any' },
    async (_req, res) => {
      res.json(await listPaymentMethods(ctx));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/payment-methods/:id',
    { auth: 'session', access: 'any', roles: ['OWNER'] },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = UpdatePaymentMethodRequestSchema.parse(req.body);
      res.json(await updatePaymentMethod(ctx, req, id, input));
    },
  );

  return router;
}
