// Ayudas comunes de los e2e (pantalla de login).
import { request, type Page } from '@playwright/test';
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

/**
 * Primera entrada de un usuario recién creado (o con la contraseña reseteada): el sistema lo lleva
 * a "Elegí tu nueva contraseña". La cambia por `chosen` y espera ver el inicio.
 */
export async function firstLoginChoosingPassword(
  page: Page,
  user: TestUser,
  chosen: string,
): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await submitLogin(page, user);
  await choosePassword(page, user.password, chosen);
  await expect(page.getByRole('heading', { name: /^Hola, / })).toBeVisible();
}

/** Completa la pantalla "Elegí tu nueva contraseña" (ya abierta) y la envía. */
export async function choosePassword(page: Page, current: string, chosen: string): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Elegí tu nueva contraseña' })).toBeVisible();
  await page.getByLabel('Contraseña actual', { exact: true }).fill(current);
  await page.getByLabel('Contraseña nueva', { exact: true }).fill(chosen);
  await page.getByLabel('Repetí la contraseña nueva', { exact: true }).fill(chosen);
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
}

/**
 * Deja el estado limpio entre specs: cierra por la API REAL (`POST /api/cash-sessions/:id/close`)
 * la caja abierta, si hay, entrando como dueño por la puerta local. Cuenta $0: no importa el arqueo.
 * Reemplaza al cierre por SQL de las etapas 3 (ya no hace falta saltearse la API).
 */
export async function closeOpenCashViaApi(owner: TestUser): Promise<void> {
  const origin = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 3100}`;
  const api = await request.newContext({
    baseURL: origin,
    extraHTTPHeaders: { 'X-Kiosco': '1', Origin: origin },
  });
  try {
    const login = await api.post('/api/auth/login', {
      data: { username: owner.username, password: owner.password },
    });
    if (!login.ok())
      throw new Error(`Login del dueño falló: ${login.status()} ${await login.text()}`);
    const current = (await (await api.get('/api/cash-sessions/current')).json()) as {
      cashSession: { id: number } | null;
    };
    if (!current.cashSession) return;
    const closed = await api.post(`/api/cash-sessions/${current.cashSession.id}/close`, {
      data: { countedCash: '0' },
    });
    if (!closed.ok())
      throw new Error(`No se pudo cerrar la caja: ${closed.status()} ${await closed.text()}`);
  } finally {
    await api.dispose();
  }
}
