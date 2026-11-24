// Fixtures comunes de los e2e. TODOS los specs importan `test` y `expect` de este archivo
// (no de @playwright/test), para que el guardián "sin internet" esté siempre activo.
// El guardián vale para el contexto del test y también para los contextos extra que se pidan
// con `newContext` (por ejemplo, un segundo navegador con otra sesión).
import { test as base, expect, type BrowserContext } from '@playwright/test';

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

/** Bloquea y registra todo pedido que no sea a localhost o 127.0.0.1. */
async function installGuard(context: BrowserContext, violations: string[]): Promise<void> {
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (isAllowedUrl(url)) return route.continue();
    violations.push(`${route.request().method()} ${url}`);
    return route.abort('blockedbyclient');
  });
}

export const test = base.extend<{
  offlineGuard: OfflineGuard;
  /** Abre otro contexto de navegador (otra sesión, sin cookies compartidas) ya con el guardián. */
  newContext: () => Promise<BrowserContext>;
}>({
  offlineGuard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      await installGuard(context, violations);
      await use({ violations });
      // Si algún pedido intentó salir, el test falla aunque la pantalla se vea bien.
      expect(
        violations,
        'La app hizo pedidos a hosts externos (debe funcionar sin internet)',
      ).toEqual([]);
    },
    { auto: true },
  ],
  newContext: async ({ browser, baseURL, locale, timezoneId, offlineGuard }, use) => {
    const opened: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        ...(baseURL ? { baseURL } : {}),
        ...(locale ? { locale } : {}),
        ...(timezoneId ? { timezoneId } : {}),
      });
      await installGuard(context, offlineGuard.violations);
      opened.push(context);
      return context;
    });
    await Promise.all(opened.map((context) => context.close()));
  },
});

export { expect };
