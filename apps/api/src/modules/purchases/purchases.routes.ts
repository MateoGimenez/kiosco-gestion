// Rutas de compras y adjuntos (docs/api/compras.md, secciones 1 y 5 a 8). Solo encargado y dueño.
import { Router } from 'express';
import {
  AttachmentDownloadQuerySchema,
  AttachmentParamsSchema,
  CreatePurchaseRequestSchema,
  IdParamSchema,
  PurchaseListQuerySchema,
  VoidPurchaseRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import {
  assertPurchaseExists,
  deleteAttachment,
  serveAttachment,
  uploadAttachment,
} from './attachments.service';
import { createPurchase, getPurchase, listPurchases, voidPurchase } from './purchases.service';

const MANAGERS = ['OWNER', 'MANAGER'] as const;

export function createPurchasesRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'post',
    '/api/purchases',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const input = CreatePurchaseRequestSchema.parse(req.body);
      const result = await createPurchase(ctx, req, input);
      res.status(result.status).json(result.body);
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/purchases',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await listPurchases(ctx, PurchaseListQuerySchema.parse(req.query)));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/purchases/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      res.json(await getPurchase(ctx, IdParamSchema.parse(req.params).id));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/purchases/:id/void',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      res.json(await voidPurchase(ctx, req, id, VoidPurchaseRequestSchema.parse(req.body)));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/purchases/:id/attachments',
    { auth: 'session', access: 'any', roles: MANAGERS, body: 'multipart' },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      await assertPurchaseExists(ctx, id);
      res.status(201).json(await uploadAttachment(ctx, req, id));
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/purchases/:id/attachments/:attachmentId',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id, attachmentId } = AttachmentParamsSchema.parse(req.params);
      const query = AttachmentDownloadQuerySchema.parse(req.query);
      await serveAttachment(ctx, res, id, attachmentId, query.download === 'true');
    },
  );

  defineRoute(
    ctx,
    router,
    'delete',
    '/api/purchases/:id/attachments/:attachmentId',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id, attachmentId } = AttachmentParamsSchema.parse(req.params);
      await deleteAttachment(ctx, req, id, attachmentId);
      res.status(204).end();
    },
  );

  return router;
}
