// Rutas de ventas (docs/api/ventas.md, secciones 6 a 8).
// Cobrar y anular son SOLO desde el local (VEN-15, H-02): `access: 'local'`.
import { Router } from 'express';
import {
  CreateSaleRequestSchema,
  IdParamSchema,
  SaleListQuerySchema,
  VoidSaleRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { getSale, listSales } from './sales.queries';
import { createSale, voidSale } from './sales.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createSalesRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'post',
    '/api/sales',
    { auth: 'session', access: 'local', localOnlyMessage: 'Las ventas se cobran desde el local.' },
    async (req, res) => {
      const input = CreateSaleRequestSchema.parse(req.body);
      const result = await createSale(ctx, req, input);
      res.status(result.status).json(result.body);
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/sales',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await listSales(ctx, SaleListQuerySchema.parse(req.query)));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/sales/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      res.json(await getSale(ctx, req.user!.role, id));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/sales/:id/void',
    {
      auth: 'session',
      access: 'local',
      roles: MANAGERS,
      localOnlyMessage: 'Las ventas se anulan desde el local.',
    },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = VoidSaleRequestSchema.parse(req.body);
      res.json(await voidSale(ctx, req, id, input));
    },
  );

  return router;
}
