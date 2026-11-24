// Marca para middlewares montados con `use(...)` que NO atienden rutas de negocio (por ejemplo,
// un encabezado `Cache-Control` o el 404 de /api). El test routes-access los deja pasar; cualquier
// otro handler montado fuera de `defineRoute` hace fallar el test.
export const SAFE_MIDDLEWARE = Symbol.for('kiosco.safeMiddleware');

export function markSafeMiddleware<T extends (...args: never[]) => unknown>(fn: T): T {
  (fn as unknown as Record<symbol, unknown>)[SAFE_MIDDLEWARE] = true;
  return fn;
}
