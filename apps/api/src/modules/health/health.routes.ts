import { Router } from 'express';

export const healthRouter: Router = Router();

// Sin sesión. No expone versión, entorno ni datos internos.
// TODO (paso de base de datos): responder 503 DATABASE_UNAVAILABLE si la base no responde.
healthRouter.get('/', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ status: 'ok' });
});
