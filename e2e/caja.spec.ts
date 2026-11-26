// Etapa 4: caja (plan 4.4, "Cómo probarlo" pasos 1 a 6). Usa el cierre REAL (pantalla y API), sin SQL.
// Los tests van en orden (serial) y encadenan turnos, como en un día de verdad:
//   1. Tarde: el empleado abre con $5.000, vende $3.000 en efectivo y $2.000 con débito; el encargado
//      registra un gasto de $500; el empleado cierra a ciegas contando $7.400; el encargado ve el
//      esperado ($7.500) y la diferencia (-$100) y agrega una nota.
//   2. Noche: el empleado abre con $7.000 (se contaron $7.400): el encargado ve la marca de
//      "diferencia de apertura" en el detalle y en la lista (con filtro); el empleado no ve nada de eso.
//   3. No deja cerrar con un carrito sin cobrar.
//   4. Un encargado cierra la caja que dejó abierta el empleado.
// Para ventas se usa "Varios" (F4): no tiene stock, así que no toca el de los productos de otros specs.
import type { Page } from '@playwright/test';
import { users } from './credentials';
import { db, disconnectDb } from './db';
import { expect, test } from './fixtures';
import { closeOpenCashViaApi, loginAs } from './helpers';

/** "$ 7.500" (el espacio puede ser común o fino). */
const money = (text: string) => new RegExp(text.replace('$', '\\$').replace(/ /g, '\\s'));

type User = ReturnType<typeof users.employee>;

const searchBox = (page: Page) => page.getByLabel('Código de barras o nombre del producto');

/** Entra y abre la pantalla de venta, con el buscador ya listo (la caja cargó). */
async function openSaleScreen(page: Page, user: User): Promise<void> {
  await loginAs(page, user);
  await page.goto('/vender');
  await expect(page.getByRole('heading', { level: 1, name: 'Vender' })).toBeVisible();
}

/** Agrega una línea "Varios" (F4) con ese precio. */
async function addMisc(page: Page, price: string, description: string): Promise<void> {
  await expect(searchBox(page)).toBeFocused();
  // "Varios" se carga aparte: hasta que llega, el botón está deshabilitado y F4 no hace nada.
  await expect(page.getByRole('button', { name: /^Varios/ })).toBeEnabled();
  await page.keyboard.press('F4');
  await expect(page.getByRole('dialog', { name: 'Varios' })).toBeVisible();
  await page.keyboard.type(price);
  await page.keyboard.press('Tab');
  await page.keyboard.type(description);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('row').filter({ hasText: 'Varios' })).toContainText(
    money(`$ ${Number(price).toLocaleString('es-AR')}`),
  );
  await expect(searchBox(page)).toBeFocused();
}

/** Cobra el carrito entero en efectivo (el monto exacto, sin vuelto) o con débito. */
async function checkout(page: Page, method: 'Efectivo' | 'Débito'): Promise<void> {
  await page.keyboard.press('Control+Enter');
  const dialog = page.getByRole('dialog', { name: 'Cobrar' });
  await expect(dialog).toBeVisible();
  if (method === 'Débito') {
    await dialog.getByLabel('Medio de pago 1').selectOption({ label: 'Débito' });
  }
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ })).toBeVisible();
  await expect(searchBox(page)).toBeFocused();
}

/** El empleado abre la caja con ese turno y efectivo inicial. */
async function openCash(page: Page, shift: 'Mañana' | 'Tarde' | 'Noche', initial: string) {
  await expect(
    page.getByRole('heading', { name: 'Abrí la caja para empezar a vender' }),
  ).toBeVisible();
  await page.getByRole('radio', { name: shift }).check();
  await page.getByLabel('Efectivo inicial ($)').fill(initial);
  await page.keyboard.press('Enter');
  await expect(
    page.getByText(new RegExp(`Caja abierta · turno ${shift.toLowerCase()}`)),
  ).toBeVisible();
}

/** Cuenta el efectivo en la pantalla de cierre y confirma el monto escrito. */
async function closeCountingCash(page: Page, counted: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: 'Cerrar la caja' })).toBeVisible();
  await page.getByLabel('Efectivo contado ($)').fill(counted);
  await page.getByRole('button', { name: 'Revisar y cerrar' }).click();
  const confirm = page.getByRole('dialog', { name: 'Confirmá lo que contaste' });
  await expect(confirm).toContainText(
    money(`¿Contaste $ ${Number(counted).toLocaleString('es-AR')}?`),
  );
  await confirm.getByRole('button', { name: 'Sí, cerrar la caja' }).click();
}

test.describe.configure({ mode: 'serial' });

test.describe('caja: turno completo, cierre a ciegas y arqueo', () => {
  test.beforeAll(async () => {
    await closeOpenCashViaApi(users.owner());
  });
  test.afterAll(async () => {
    await closeOpenCashViaApi(users.owner());
    await disconnectDb();
  });

  test('turno Tarde: el empleado abre, vende y cierra a ciegas; el encargado registra un gasto y ve -$100 de diferencia', async ({
    page,
    newContext,
  }) => {
    // 1. Empleado: abre con $5.000 y vende $3.000 en efectivo y $2.000 con débito.
    await openSaleScreen(page, users.employee());
    await openCash(page, 'Tarde', '5000');
    await addMisc(page, '3000', 'venta en efectivo');
    await checkout(page, 'Efectivo');
    await addMisc(page, '2000', 'venta con débito');
    await checkout(page, 'Débito');

    // 2. Encargado (otro navegador): gasto de $500.
    const manager = await (await newContext()).newPage();
    await loginAs(manager, users.manager());
    await manager
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Caja' })
      .click();
    await expect(manager.getByRole('heading', { level: 1, name: 'Caja' })).toBeVisible();
    await manager.getByRole('button', { name: 'Registrar ingreso o salida' }).click();
    const movement = manager.getByRole('dialog', { name: 'Ingreso o salida de efectivo' });
    await movement.getByRole('radio', { name: 'Sale plata' }).check();
    await movement.getByRole('radio', { name: 'Gasto' }).check();
    await movement.getByLabel('Descripción').fill('Pago limpieza');
    await movement.getByLabel('Monto ($)').fill('500');
    await movement.getByRole('button', { name: 'Revisar' }).click();
    await manager
      .getByRole('dialog', { name: 'Confirmá la salida' })
      .getByRole('button', { name: 'Sí, registrar la salida' })
      .click();
    await expect(manager.getByText('Listo, el movimiento quedó registrado.')).toBeVisible();
    // Para el encargado, la caja abierta muestra el esperado "hasta ahora" (H-52): 5.000 + 3.000 - 500.
    await expect(manager.locator('.cash-now__expected')).toContainText(money('$ 7.500'));

    // 3. Empleado: cierra a ciegas contando $7.400. Antes de confirmar, no hay nada del esperado.
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cerrar la caja' })).toBeVisible();
    const blindText = (await page.locator('main').innerText()).toLowerCase();
    expect(blindText).not.toContain('esperado');
    expect(blindText).not.toContain('diferencia');
    expect(blindText).not.toMatch(/7\.500|8\.000|5\.000/);
    await closeCountingCash(page, '7400');

    // El empleado ve solo "Caja cerrada" y lo que contó (H-46): ni esperado ni diferencia.
    const closed = page.getByRole('status').filter({ hasText: 'Caja cerrada' });
    await expect(closed).toContainText(money('Contaste $ 7.400'));
    const afterClose = (await page.locator('main').innerText()).toLowerCase();
    expect(afterClose).not.toMatch(/esperado|diferencia|faltan|sobran|7\.500/);

    // 4. Encargado: ve el esperado ($7.500) y la diferencia (-$100) en la lista y en el detalle.
    await manager.reload();
    const row = manager.getByRole('listitem').filter({ hasText: 'Tarde' }).first();
    await expect(row).toContainText(money('$ 7.400'));
    await expect(row).toContainText(money('$ 7.500'));
    await expect(row).toContainText('(falta)');
    await row.getByRole('link').click();
    const arqueo = manager.getByRole('region', { name: 'Arqueo del efectivo' });
    await expect(arqueo).toContainText(/Efectivo inicial\s*\$\s5\.000/);
    await expect(arqueo).toContainText(/Cobrado en efectivo\s*\$\s3\.000/);
    await expect(arqueo).toContainText(/Salidas\s*\$\s500/);
    await expect(arqueo).toContainText(/Esperado\s*\$\s7\.500/);
    await expect(arqueo).toContainText(/Contado\s*\$\s7\.400/);
    await expect(arqueo).toContainText(/Faltan\s\$\s100/);
    // Los otros medios son solo informativos: el débito no entra en el esperado.
    await expect(manager.getByRole('region', { name: 'Por medio de pago' })).toContainText(
      'Débito',
    );
    await expect(manager.getByRole('region', { name: 'Ingresos y salidas' })).toContainText(
      'Pago limpieza',
    );

    // Nota del encargado.
    await manager
      .getByLabel('Agregar una nota')
      .fill('Emilio avisó que dio mal un vuelto de $100.');
    await manager.getByRole('button', { name: 'Agregar nota' }).click();
    await expect(manager.getByRole('region', { name: 'Notas' })).toContainText(
      'Emilio avisó que dio mal un vuelto de $100.',
    );

    // Lo guardado (solo lectura, para contrastar con lo que mostró la pantalla).
    const saved = await db().cashSession.findFirstOrThrow({ orderBy: { id: 'desc' } });
    expect(saved.status).toBe('CLOSED');
    expect(saved.expectedCash?.toFixed(2)).toBe('7500.00');
    expect(saved.countedCash?.toFixed(2)).toBe('7400.00');
    expect(saved.difference?.toFixed(2)).toBe('-100.00');
  });

  test('diferencia de apertura: abrir con $7.000 tras un cierre de $7.400; el encargado ve la marca y el empleado no', async ({
    page,
    newContext,
  }) => {
    // El empleado no ve lo contado en el cierre anterior al abrir (decisión del dueño).
    await openSaleScreen(page, users.employee());
    await expect(
      page.getByRole('heading', { name: 'Abrí la caja para empezar a vender' }),
    ).toBeVisible();
    await expect(page.getByText(/se contaron/)).toHaveCount(0);

    // El encargado, en cambio, ve la referencia en el formulario de apertura.
    const manager = await (await newContext()).newPage();
    await openSaleScreen(manager, users.manager());
    await expect(manager.getByText(/se contaron \$\s7\.400/)).toBeVisible();

    // El empleado abre con $7.000 (declara $400 menos).
    await openCash(page, 'Noche', '7000');

    // Encargado: marca en la lista...
    await manager.goto('/caja');
    const nightRow = manager.getByRole('listitem').filter({ hasText: 'Noche' }).first();
    await expect(nightRow).toContainText('Apertura con diferencia');
    const afternoonRow = manager.getByRole('listitem').filter({ hasText: 'Tarde' }).first();
    await expect(afternoonRow).not.toContainText('Apertura con diferencia');

    // ...filtro "Con diferencia de apertura": solo queda la Noche...
    await manager.getByLabel('Con diferencia de apertura').check();
    await expect(manager.getByRole('listitem').filter({ hasText: 'Noche' })).toHaveCount(1);
    await expect(manager.getByRole('listitem').filter({ hasText: 'Tarde' })).toHaveCount(0);

    // ...y aviso en el detalle (arqueo) con los $400.
    await nightRow.getByRole('link').click();
    const alert = manager
      .getByRole('note')
      .filter({ hasText: 'no coincide con el cierre anterior' });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText(money('se declararon $ 7.000'));
    await expect(alert).toContainText(money('se contaron $ 7.400'));
    await expect(alert).toContainText(money('−$ 400'));

    // El empleado: nada de la caja de arriba (ni la ruta ni el dato).
    await page.goto('/caja');
    await expect(page.getByRole('heading', { level: 1, name: 'Caja' })).toHaveCount(0);
    expect((await page.locator('body').innerText()).toLowerCase()).not.toContain(
      'apertura con diferencia',
    );
  });

  test('no deja cerrar la caja con un carrito sin cobrar', async ({ page }) => {
    await openSaleScreen(page, users.employee());
    await expect(searchBox(page)).toBeFocused();
    await addMisc(page, '500', 'chicle suelto');

    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(
      page.getByText('Tenés un carrito sin cobrar. Cobralo o vacialo antes de cerrar la caja.'),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/vender$/);
    // La caja sigue abierta en el servidor.
    expect(await db().cashSession.count({ where: { status: 'OPEN' } })).toBe(1);

    // Cobrado el carrito, ya se puede ir a cerrar.
    await checkout(page, 'Efectivo');
    await page.getByRole('button', { name: 'Cerrar caja' }).click();
    await expect(page).toHaveURL(/\/caja\/cerrar$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Cerrar la caja' })).toBeVisible();
  });

  test('un encargado cierra la caja que dejó abierta un empleado', async ({ page, newContext }) => {
    // El empleado (otro navegador) la dejó abierta; el encargado entra desde "Caja".
    await loginAs(page, users.manager());
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Caja' })
      .click();
    await expect(page.getByText(/abierta por Emilio Empleado/)).toBeVisible();
    await page.getByRole('link', { name: 'Cerrar caja' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Cerrar la caja' })).toBeVisible();
    await expect(page.getByText(/abierta por Emilio Empleado/)).toBeVisible();

    // Noche: 7.000 inicial + 500 vendidos en efectivo = 7.500 esperado. Cuenta 7.500: sin diferencia.
    await closeCountingCash(page, '7500');
    await expect(page).toHaveURL(/\/caja\/\d+$/);
    await expect(page.getByText('La caja quedó cerrada. Este es el resultado.')).toBeVisible();
    const arqueo = page.getByRole('region', { name: 'Arqueo del efectivo' });
    await expect(arqueo).toContainText(/Esperado\s*\$\s7\.500/);
    await expect(arqueo).toContainText('Sin diferencia');
    await expect(page.getByText(/cerró Marta Encargada/)).toBeVisible();
    await expect(page.getByText(/Abrió Emilio Empleado/)).toBeVisible();

    // Lo guardado: la abrió el empleado y la cerró el encargado.
    const saved = await db().cashSession.findFirstOrThrow({
      orderBy: { id: 'desc' },
      include: { openedBy: true, closedBy: true },
    });
    expect(saved.openedBy.username).toBe(users.employee().username);
    expect(saved.closedBy?.username).toBe(users.manager().username);
    expect(saved.difference?.toFixed(2)).toBe('0.00');

    // El empleado, que sigue con la pantalla de venta, ya no tiene caja: se le pide abrir otra.
    const employee = await (await newContext()).newPage();
    await openSaleScreen(employee, users.employee());
    await expect(
      employee.getByRole('heading', { name: 'Abrí la caja para empezar a vender' }),
    ).toBeVisible();
  });
});
