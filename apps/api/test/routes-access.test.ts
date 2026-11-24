// ADR 003, punto 6: cada ruta declara `access` y un test falla si alguna no lo hace.
import { Router, type Express } from 'express';
import { describe, expect, it } from 'vitest';
import { SAFE_MIDDLEWARE } from '../src/middleware/marks';
import { LOCAL_GUARD, ROUTE_SPEC, type RouteSpec } from '../src/middleware/route';
import { buildTestApp } from './helpers';

interface Layer {
  route?: { path: string; methods: Record<string, boolean>; stack: { handle: unknown }[] };
  handle: { stack?: Layer[]; length: number } & Record<symbol, unknown>;
  /** true = `use()` sin ruta (se aplica a todo). */
  slash?: boolean;
  matchers?: ((path: string) => { path: string } | false)[];
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
    // Un `use()` global ANTES de las rutas es parte de la cadena de controles (helmet, CSRF...).
    // Uno que viene DESPUÉS de la primera ruta o router podría atender pedidos sin pasar por defineRoute.
    let seenRoutes = false;
    for (const layer of stack) {
      if (layer.route) {
        seenRoutes = true;
        const handles = layer.route.stack.map((l) => l.handle as Record<symbol, unknown>);
        const verbs = Object.keys(layer.route.methods);
        // `app.all(...)` registra todos los verbos: se muestra como ALL.
        const method = verbs.length > 8 ? 'ALL' : verbs[0]!.toUpperCase();
        found.push({
          label: `${method} ${layer.route.path}`,
          spec: handles.map((h) => h[ROUTE_SPEC] as RouteSpec | undefined).find(Boolean),
          hasLocalGuard: handles.some((h) => h[LOCAL_GUARD] === true),
        });
      } else if (layer.handle.stack) {
        seenRoutes = true;
        walk(layer.handle.stack);
      } else {
        // Handler montado con `router.use(...)` / `app.use(...)`: tiene que estar marcado como seguro.
        const isErrorHandler = layer.handle.length === 4; // solo recibe errores, no pedidos
        const mountedOnPath = layer.slash === false;
        if (
          (mountedOnPath || seenRoutes) &&
          !isErrorHandler &&
          layer.handle[SAFE_MIDDLEWARE] !== true
        ) {
          found.push({
            label: `USE ${mountedOnPath ? '(con ruta)' : '(sin ruta, después de las rutas)'}`,
            spec: undefined,
            hasLocalGuard: false,
          });
        }
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

  it('un handler montado con app.use sobre una ruta, sin defineRoute, sería detectado', () => {
    const app = buildTestApp();
    app.use('/api/archivos', (_req, res) => void res.end());
    expect(collectRoutes(app).filter((r) => !r.spec)).toHaveLength(1);
  });

  it('un app.use sin ruta registrado después de las rutas sería detectado', () => {
    const app = buildTestApp();
    app.use((_req, res) => void res.end());
    expect(collectRoutes(app).filter((r) => !r.spec)).toHaveLength(1);
  });

  it('un router.use dentro de un router montado sería detectado', () => {
    const app = buildTestApp();
    const router = Router();
    router.use('/api/otra-cosa', (_req, res) => void res.end());
    app.use(router);
    expect(collectRoutes(app).filter((r) => !r.spec)).toHaveLength(1);
  });

  it('un app.all sin defineRoute sería detectado', () => {
    const app = buildTestApp();
    app.all('/api/todo', (_req, res) => void res.end());
    expect(
      collectRoutes(app)
        .filter((r) => !r.spec)
        .map((r) => r.label),
    ).toEqual(['ALL /api/todo']);
  });

  it('una ruta registrada sin defineRoute sería detectada', () => {
    const app = buildTestApp();
    app.get('/api/sin-declarar', (_req, res) => void res.end());
    const missing = collectRoutes(app).filter((r) => !r.spec);
    expect(missing.map((r) => r.label)).toEqual(['GET /api/sin-declarar']);
  });
});
