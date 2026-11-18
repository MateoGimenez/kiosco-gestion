// Fixtures comunes de los e2e. TODOS los specs importan `test` y `expect` de este archivo
// (no de @playwright/test), para que el guardián "sin internet" esté siempre activo.
import { test as base, expect } from '@playwright/test';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1']);

/** Guardián "sin internet": el sistema tiene que funcionar sin salir de la máquina. */
export interface OfflineGuard {
  /** Pedidos bloqueados por ir a un host que no es localhost ni 127.0.0.1. */
  violations: string[];
}

export function isAllowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    // data:, blob: y about: no salen a la red.
    if (['data:', 'blob:', 'about:'].includes(url.protocol)) return true;
    return ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export const test = base.extend<{ offlineGuard: OfflineGuard }>({
  offlineGuard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      await context.route('**/*', (route) => {
        const url = route.request().url();
        if (isAllowedUrl(url)) return route.continue();
        violations.push(`${route.request().method()} ${url}`);
        return route.abort('blockedbyclient');
      });
      await use({ violations });
      // Si algún pedido intentó salir, el test falla aunque la pantalla se vea bien.
      expect(
        violations,
        'La app hizo pedidos a hosts externos (debe funcionar sin internet)',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
