// Rutas de productos y precios (docs/api/productos-stock.md, secciones 6 y 7).
// IMPORTANTE: `/api/products/search` se registra ANTES que `/api/products/:id` (si no, "search" se tomaría como id).
import { Router } from 'express';
import {
  CreateProductRequestSchema,
  IdParamSchema,
  ProductListQuerySchema,
  ProductSearchQuerySchema,
  UpdateProductPricingRequestSchema,
  UpdateProductRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { assertOwnerFields } from '../../lib/owner-fields';
import { defineRoute } from '../../middleware/route';
import {
  createProduct,
  getPricing,
  getProduct,
  listProducts,
  searchProducts,
  updatePricing,
  updateProduct,
} from './products.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createProductsRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/products/search',
    { auth: 'session', access: 'any' },
    async (req, res) => {
      const query = ProductSearchQuerySchema.parse(req.query);
      res.json(await searchProducts(ctx, query));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/products',
    { auth: 'session', access: 'any' },
    async (req, res) => {
      const query = ProductListQuerySchema.parse(req.query);
      res.json(await listProducts(ctx, req.user!.role, query));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/products',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const input = CreateProductRequestSchema.parse(req.body);
      assertOwnerFields(req, input, ['marginPercent']);
      res.status(201).json(await createProduct(ctx, req, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/products/:id',
    { auth: 'session', access: 'any' },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      res.json(await getProduct(ctx, req.user!.role, id));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/products/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = UpdateProductRequestSchema.parse(req.body);
      res.json(await updateProduct(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/products/:id/pricing',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      res.json(await getPricing(ctx, id));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/products/:id/pricing',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = UpdateProductPricingRequestSchema.parse(req.body);
      assertOwnerFields(req, input, ['marginPercent']);
      res.json(await updatePricing(ctx, req, id, input));
    },
  );

  return router;
}
