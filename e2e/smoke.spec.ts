import { users } from './credentials';
import { expect, test } from './fixtures';
import { loginAs } from './helpers';

test.describe('humo', () => {
  test('la página principal pide entrar y, ya adentro, muestra "Funcionando"', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    // Sin sesión no se ve nada del sistema.
    await expect(page.getByText('Funcionando')).toHaveCount(0);

    await loginAs(page, users.owner());
    await expect(page.getByText('Funcionando')).toBeVisible();
  });
});

test.describe('guardián "sin internet"', () => {
  test('bloquea y registra un pedido a un host externo', async ({ page, offlineGuard }) => {
    await page.goto('/');
    const failed = await page.evaluate(() =>
      fetch('https://example.com/ping').then(
        () => false,
        () => true,
      ),
    );
    expect(failed).toBe(true);
    expect(offlineGuard.violations).toEqual(['GET https://example.com/ping']);
    // Este test provocó la violación a propósito: se limpia para que el guardián no lo falle.
    offlineGuard.violations.length = 0;
  });

  test('también vigila los contextos extra (otra sesión de navegador)', async ({
    newContext,
    offlineGuard,
  }) => {
    const page = await (await newContext()).newPage();
    await page.goto('/');
    const failed = await page.evaluate(() =>
      fetch('https://example.org/otro').then(
        () => false,
        () => true,
      ),
    );
    expect(failed).toBe(true);
    expect(offlineGuard.violations).toEqual(['GET https://example.org/otro']);
    offlineGuard.violations.length = 0;
  });

  test('deja pasar localhost y 127.0.0.1', async ({ page, baseURL }) => {
    // Por "localhost" en vez de 127.0.0.1: es otro sitio para el navegador, hay que entrar de nuevo.
    await page.goto(new URL('/', baseURL).href.replace('127.0.0.1', 'localhost'));
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await page.getByLabel('Usuario').fill(users.owner().username);
    await page.getByLabel('Contraseña', { exact: true }).fill(users.owner().password);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Funcionando')).toBeVisible();
  });
});
