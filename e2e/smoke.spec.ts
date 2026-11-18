import { expect, test } from './fixtures';

test.describe('humo', () => {
  test('la página principal abre y muestra "Funcionando"', async ({ page }) => {
    await page.goto('/');
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

  test('deja pasar localhost y 127.0.0.1', async ({ page, baseURL }) => {
    await page.goto(new URL('/', baseURL).href.replace('127.0.0.1', 'localhost'));
    await expect(page.getByText('Funcionando')).toBeVisible();
  });
});
