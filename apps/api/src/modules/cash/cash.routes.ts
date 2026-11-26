// Rutas de caja (docs/api/caja.md, sección 1). `/current` va ANTES de `/:id`.
import { Router } from 'express';
import {
  CashSessionListQuerySchema,
  CloseCashSessionRequestSchema,
  CreateCashMovementRequestSchema,
  CreateCashSessionNoteRequestSchema,
  IdParamSchema,
  OpenCashSessionRequestSchema,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { buildCashSessionDetail, listCashSessions } from './cash.queries';
import {
  addCashSessionNote,
  closeCashSession,
  createCashMovement,
  getCurrent,
  openCashSession,
} from './cash.service';

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
      res.json(await getCurrent(ctx, req.user!));
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

  defineRoute(
    ctx,
    router,
    'get',
    '/api/cash-sessions/:id',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      res.json(await buildCashSessionDetail(ctx.prisma, id));
    },
  );

  // Cierre a ciegas: lo puede hacer cualquier rol (el empleado solo la caja que abrió: lo controla el servicio).
  defineRoute(
    ctx,
    router,
    'post',
    '/api/cash-sessions/:id/close',
    { auth: 'session', access: 'local', localOnlyMessage: 'La caja se cierra desde el local.' },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = CloseCashSessionRequestSchema.parse(req.body);
      res.json(await closeCashSession(ctx, req, id, input));
    },
  );

  // Las notas no mueven plata: también se pueden agregar desde afuera (ADR 003 punto 6).
  defineRoute(
    ctx,
    router,
    'post',
    '/api/cash-sessions/:id/notes',
    { auth: 'session', access: 'any', roles: MANAGERS },
    async (req, res) => {
      const { id } = IdParamSchema.parse(req.params);
      const input = CreateCashSessionNoteRequestSchema.parse(req.body);
      res.status(201).json(await addCashSessionNote(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/cash-movements',
    {
      auth: 'session',
      access: 'local',
      roles: MANAGERS,
      localOnlyMessage: 'Los ingresos y salidas de efectivo se registran desde el local.',
    },
    async (req, res) => {
      const input = CreateCashMovementRequestSchema.parse(req.body);
      res.status(201).json(await createCashMovement(ctx, req, input));
    },
  );

  return router;
}
