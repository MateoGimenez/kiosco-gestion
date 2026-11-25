// Rutas de stock (docs/api/productos-stock.md, sección 8). Solo encargado y dueño.
import { Router } from 'express';
import {
  CreateStockAdjustmentRequestSchema,
  IdParamSchema,
  StockListQuerySchema,
  StockMovementListQuerySchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { createAdjustment, listMovements, listNegative, listRestock } from './stock.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createStockRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/products/:id/stock-movements',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const query = StockMovementListQuerySchema.parse(req.query);
      res.json(await listMovements(ctx, req.user!.role, id, query));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/products/:id/stock-adjustments',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = CreateStockAdjustmentRequestSchema.parse(req.body);
      res.status(201).json(await createAdjustment(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/stock/restock',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await listRestock(ctx, StockListQuerySchema.parse(req.query)));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/stock/negative',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await listNegative(ctx, StockListQuerySchema.parse(req.query)));
    },
  );

  return router;
}
