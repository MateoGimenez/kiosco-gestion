// Rutas de proveedores (docs/api/proveedores.md, sección 1). Todas piden encargado o dueño; saldo
// inicial y ajustes, solo dueño. El pago con efectivo de la caja se bloquea en el servicio.
import { Router } from 'express';
import {
  AssignProductsRequestSchema,
  CreateAccountAdjustmentRequestSchema,
  CreateOpeningBalanceRequestSchema,
  CreateSupplierPaymentRequestSchema,
  CreateSupplierRefundRequestSchema,
  CreateSupplierRequestSchema,
  IdParamSchema,
  SupplierAccountQuerySchema,
  SupplierListQuerySchema,
  UpdateSupplierRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import * as svc from './suppliers.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;
const OWNER_ONLY = ['OWNER'] as const;

export function createSuppliersRouter(ctx: AppContext): Router {
  const router = Router();
  const idOf = (params: unknown) => IdParamSchema.parse(params).id;

  defineRoute(
    ctx,
    router,
    'get',
    '/api/suppliers',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await svc.listSuppliers(ctx, SupplierListQuerySchema.parse(req.query)));
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res
        .status(201)
        .json(await svc.createSupplier(ctx, req, CreateSupplierRequestSchema.parse(req.body)));
    },
  );
  defineRoute(
    ctx,
    router,
    'get',
    '/api/suppliers/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await svc.getSupplier(ctx, idOf(req.params)));
    },
  );
  defineRoute(
    ctx,
    router,
    'patch',
    '/api/suppliers/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const id = idOf(req.params);
      res.json(await svc.updateSupplier(ctx, req, id, UpdateSupplierRequestSchema.parse(req.body)));
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers/:id/assign-products',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const id = idOf(req.params);
      res.json(await svc.assignProducts(ctx, req, id, AssignProductsRequestSchema.parse(req.body)));
    },
  );
  defineRoute(
    ctx,
    router,
    'get',
    '/api/suppliers/:id/account',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const id = idOf(req.params);
      res.json(await svc.getAccount(ctx, id, SupplierAccountQuerySchema.parse(req.query)));
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers/:id/payments',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const id = idOf(req.params);
      const r = await svc.createPayment(
        ctx,
        req,
        id,
        CreateSupplierPaymentRequestSchema.parse(req.body),
      );
      res.status(r.status).json(r.body);
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers/:id/refunds',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const id = idOf(req.params);
      const r = await svc.createRefund(
        ctx,
        req,
        id,
        CreateSupplierRefundRequestSchema.parse(req.body),
      );
      res.status(r.status).json(r.body);
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers/:id/opening-balance',
    { auth: 'session', access: 'any', roles: OWNER_ONLY },
    async (req, res) => {
      const id = idOf(req.params);
      res
        .status(201)
        .json(
          await svc.createOpeningBalance(
            ctx,
            req,
            id,
            CreateOpeningBalanceRequestSchema.parse(req.body),
          ),
        );
    },
  );
  defineRoute(
    ctx,
    router,
    'post',
    '/api/suppliers/:id/adjustments',
    { auth: 'session', access: 'any', roles: OWNER_ONLY },
    async (req, res) => {
      const id = idOf(req.params);
      res
        .status(201)
        .json(
          await svc.createAdjustment(
            ctx,
            req,
            id,
            CreateAccountAdjustmentRequestSchema.parse(req.body),
          ),
        );
    },
  );
  defineRoute(
    ctx,
    router,
    'get',
    '/api/suppliers/:id/suggested-order',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await svc.getSuggestedOrder(ctx, idOf(req.params)));
    },
  );
  return router;
}
