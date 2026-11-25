// Rutas de categorías y subcategorías (docs/api/productos-stock.md, sección 5).
import { Router } from 'express';
import {
  CategoryListQuerySchema,
  CreateCategoryRequestSchema,
  CreateSubcategoryRequestSchema,
  IdParamSchema,
  UpdateCategoryRequestSchema,
  UpdateSubcategoryRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { assertOwnerFields } from '../../lib/owner-fields';
import { defineRoute } from '../../middleware/route';
import {
  createCategory,
  createSubcategory,
  listCategories,
  updateCategory,
  updateSubcategory,
} from './categories.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createCategoriesRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/categories',
    { auth: 'session', access: 'any' },
    async (req, res) => {
      const query = CategoryListQuerySchema.parse(req.query);
      res.json(await listCategories(ctx, req.user!.role, query));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/categories',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      // H-23: el encargado también manda `marginPercent` acá (es el margen inicial).
      const input = CreateCategoryRequestSchema.parse(req.body);
      res.status(201).json(await createCategory(ctx, req, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/categories/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = UpdateCategoryRequestSchema.parse(req.body);
      assertOwnerFields(req, input, ['marginPercent']);
      res.json(await updateCategory(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/categories/:id/subcategories',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = CreateSubcategoryRequestSchema.parse(req.body);
      assertOwnerFields(req, input, ['marginPercent']);
      res.status(201).json(await createSubcategory(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/subcategories/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = UpdateSubcategoryRequestSchema.parse(req.body);
      assertOwnerFields(req, input, ['marginPercent']);
      res.json(await updateSubcategory(ctx, req, id, input));
    },
  );

  return router;
}
