// Rutas de usuarios, solo para el dueño (docs/api/auth-usuarios.md, sección 4).
import { Router } from 'express';
import {
  CreateUserRequestSchema,
  ResetPasswordRequestSchema,
  UpdateUserRequestSchema,
  UserIdParamSchema,
  UserListQuerySchema,
  type UserListResponse,
} from '@kiosco/shared';
import type { AppContext } from '../../context';
import { defineRoute } from '../../middleware/route';
import { clearSessionCookie } from '../auth/session';
import { createUser, getUser, listUsers, resetPassword, updateUser } from './users.service';

const OWNER_ONLY = ['OWNER'] as const;

export function createUsersRouter(ctx: AppContext): Router {
  const router = Router();

  defineRoute(
    ctx,
    router,
    'get',
    '/api/users',
    { auth: 'session', access: 'any', roles: OWNER_ONLY },
    async (req, res) => {
      const query = UserListQuerySchema.parse(req.query);
      const body: UserListResponse = { items: await listUsers(ctx, query) };
      res.json(body);
    },
  );

  defineRoute(
    ctx,
    router,
    'get',
    '/api/users/:id',
    { auth: 'session', access: 'any', roles: OWNER_ONLY },
    async (req, res) => {
      const { id } = UserIdParamSchema.parse(req.params);
      res.json(await getUser(ctx, id));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/users',
    {
      auth: 'session',
      access: 'local',
      roles: OWNER_ONLY,
      localOnlyMessage: 'Los usuarios se crean desde el local.',
    },
    async (req, res) => {
      const input = CreateUserRequestSchema.parse(req.body);
      res.status(201).json(await createUser(ctx, req, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'patch',
    '/api/users/:id',
    { auth: 'session', access: 'any', roles: OWNER_ONLY },
    async (req, res) => {
      const { id } = UserIdParamSchema.parse(req.params);
      const input = UpdateUserRequestSchema.parse(req.body);
      res.json(await updateUser(ctx, req, id, input));
    },
  );

  defineRoute(
    ctx,
    router,
    'post',
    '/api/users/:id/reset-password',
    {
      auth: 'session',
      access: 'local',
      roles: OWNER_ONLY,
      localOnlyMessage: 'Las contraseñas se resetean desde el local.',
    },
    async (req, res) => {
      const { id } = UserIdParamSchema.parse(req.params);
      const input = ResetPasswordRequestSchema.parse(req.body);
      const user = await resetPassword(ctx, req, id, input);
      // Si el dueño se reseteó a sí mismo, su sesión ya no vale: se borra la cookie.
      if (req.user?.id === id) clearSessionCookie(ctx, res);
      res.json(user);
    },
  );

  return router;
}
