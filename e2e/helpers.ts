// Ayudas comunes de los e2e (pantalla de login).
import type { Page } from '@playwright/test';
import { expect } from './fixtures';
import type { TestUser } from './credentials';

/** Completa y envía el formulario de entrada (la pantalla de login tiene que estar abierta). */
export async function submitLogin(page: Page, user: TestUser): Promise<void> {
  await page.getByLabel('Usuario').fill(user.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

/** Abre la app, entra con el usuario y espera ver el inicio. */
export async function loginAs(page: Page, user: TestUser): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await submitLogin(page, user);
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();
}
