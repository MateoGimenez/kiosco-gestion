// ADR 003, punto 6: cada ruta declara `access` y un test falla si alguna no lo hace.
import type { Express } from 'express';
import { describe, expect, it } from 'vitest';
import { LOCAL_GUARD, ROUTE_SPEC, type RouteSpec } from '../src/middleware/route';
import { buildTestApp } from './helpers';

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
  handle: { stack?: Layer[] } & Record<symbol, unknown>;
}

interface FoundRoute {
  label: string;
  spec: RouteSpec | undefined;
  hasLocalGuard: boolean;
}

/** Recorre la pila de Express (incluidos los routers anidados) y junta todas las rutas. */
function collectRoutes(app: Express): FoundRoute[] {
  const found: FoundRoute[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        const handles = layer.route.stack.map((l) => l.handle as Record<symbol, unknown>);
        const method = Object.keys(layer.route.methods)[0]!.toUpperCase();
        found.push({
          label: `${method} ${layer.route.path}`,
          spec: handles.map((h) => h[ROUTE_SPEC] as RouteSpec | undefined).find(Boolean),
          hasLocalGuard: handles.some((h) => h[LOCAL_GUARD] === true),
        });
      } else if (layer.handle.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
  return found;
}

describe('declaración de `access` en cada ruta', () => {
  const routes = collectRoutes(buildTestApp());

  it('encuentra las rutas de la app', () => {
    expect(routes.length).toBeGreaterThanOrEqual(8);
  });

  it('todas las rutas declaran access: "any" o "local"', () => {
    const missing = routes.filter((r) => !r.spec || !['any', 'local'].includes(r.spec.access));
    expect(missing.map((r) => r.label)).toEqual([]);
  });

  it('las rutas "local" llevan el bloqueo de la puerta remota', () => {
    const unguarded = routes.filter((r) => r.spec?.access === 'local' && !r.hasLocalGuard);
    expect(unguarded.map((r) => r.label)).toEqual([]);
  });

  it('crear usuarios y resetear contraseñas son solo locales; el resto de /api/users es any', () => {
    const access = Object.fromEntries(routes.map((r) => [r.label, r.spec?.access]));
    expect(access['POST /api/users']).toBe('local');
    expect(access['POST /api/users/:id/reset-password']).toBe('local');
    expect(access['PATCH /api/users/:id']).toBe('any');
    expect(access['GET /api/users']).toBe('any');
  });

  it('una ruta registrada sin defineRoute sería detectada', () => {
    const app = buildTestApp();
    app.get('/api/sin-declarar', (_req, res) => void res.end());
    const missing = collectRoutes(app).filter((r) => !r.spec);
    expect(missing.map((r) => r.label)).toEqual(['GET /api/sin-declarar']);
  });
});
