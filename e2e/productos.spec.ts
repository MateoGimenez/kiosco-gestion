// Etapa 2: productos y stock (plan 4.2, "Cómo probarlo" pasos 2 a 8).
// El catálogo base (Bebidas, y tres productos) lo siembra `global-setup.ts`. Estos tests crean el
// resto desde la pantalla, así que dentro de cada bloque `serial` el orden importa.
import type { Page } from '@playwright/test';
import { SEED_CATALOG, users } from './credentials';
import { expect, test } from './fixtures';
import { loginAs } from './helpers';

const NEW_PRODUCT = 'Chocolate Marmolado';

/** Abre el formulario "Nueva categoría" y la crea con su margen inicial. */
async function createCategory(page: Page, name: string, margin: string): Promise<void> {
  await page.getByRole('button', { name: 'Nueva categoría' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Nombre').fill(name);
  await dialog.getByLabel('Margen inicial (%)').fill(margin);
  await dialog.getByRole('button', { name: 'Crear categoría' }).click();
  await expect(page.getByText(`Se creó la categoría "${name}".`)).toBeVisible();
}

/** Desde la lista, abre la ficha de un producto buscándolo por nombre. */
async function openProductBySearch(page: Page, name: string): Promise<void> {
  await page.goto('/productos');
  await page.getByLabel('Buscar por código de barras o nombre').fill(name);
  await page.getByRole('button', { name: 'Buscar' }).click();
  await page.getByRole('link', { name: name, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

/** Ajusta el stock desde la ficha: elige el motivo, escribe la cantidad y confirma. */
async function adjustStock(page: Page, reason: string, amount: string): Promise<void> {
  await page.getByRole('link', { name: 'Ajustar stock' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustar stock' })).toBeVisible();
  await page.getByRole('radio', { name: new RegExp(`^${reason}`) }).check();
  await page.getByLabel(/^(Cantidad a|¿Cuántos)/).fill(amount);
  await page.getByRole('button', { name: 'Revisar ajuste' }).click();
  await page.getByRole('button', { name: 'Confirmar ajuste' }).click();
}

test.describe.serial('el dueño carga el catálogo y mueve el stock', () => {
  test('crea una categoría, una subcategoría y un producto con precio sugerido', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.goto('/categorias');
    await createCategory(page, 'Golosinas', '40');

    await page.getByRole('button', { name: 'Agregar subcategoría a Golosinas' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nombre').fill('Chocolates');
    await dialog.getByLabel('Margen propio (%)').fill('50');
    await dialog.getByRole('button', { name: 'Crear subcategoría' }).click();
    await expect(page.getByText('Se creó la subcategoría "Chocolates".')).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Subcategorías de Golosinas' }).getByText('Chocolates'),
    ).toBeVisible();

    // $1.000 × 1,50 × 1,21 = $1.815, redondeado hacia arriba a $10: $1.820.
    await page.goto('/productos/nuevo');
    await page.getByLabel('Nombre', { exact: true }).fill(NEW_PRODUCT);
    await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Golosinas' });
    await page.getByLabel('Subcategoría').selectOption({ label: 'Chocolates' });
    await page.getByLabel('Costo sin IVA').fill('1000');
    await page.getByLabel('Stock inicial (opcional)').fill('12');
    await page.getByLabel('Stock mínimo').fill('3');
    await expect(page.getByTestId('suggested-price')).toContainText('1.820');
    await expect(page.getByLabel('Precio de venta (con IVA)')).toHaveValue('1820');
    await page.getByRole('button', { name: 'Crear producto' }).click();

    await expect(page.getByText('Producto creado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: NEW_PRODUCT })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Venta' })).toContainText('1.820');
    await expect(page.getByRole('region', { name: 'Stock' })).toContainText('12');
    await expect(page.getByRole('region', { name: 'Costo y margen' })).toContainText('50 %');
  });

  test('cambia el precio a mano y ve el margen real; después ajusta por rotura', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await openProductBySearch(page, NEW_PRODUCT);
    await page.getByRole('link', { name: 'Ir a precios' }).click();
    await expect(page.getByRole('heading', { level: 1, name: NEW_PRODUCT })).toBeVisible();

    await page.getByLabel('Precio de venta (con IVA)').fill('1900');
    // $1.900 / 1,21 = $1.570,25 de neto sobre un costo de $1.000: margen real 57,02 %.
    await expect(page.getByText(/Margen real con este precio/)).toContainText('57,02 %');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    // El formulario se recarga con lo guardado: ya no hay cambios pendientes.
    await expect(page.getByRole('button', { name: 'Sin cambios para guardar' })).toBeVisible();

    await openProductBySearch(page, NEW_PRODUCT);
    await expect(page.getByRole('region', { name: 'Venta' })).toContainText('1.900');

    await adjustStock(page, 'Rotura', '2');
    await expect(page.getByText('Stock ajustado. Ahora hay 10.')).toBeVisible();

    await page.getByRole('link', { name: 'Ver movimientos' }).click();
    const rows = page.getByRole('list', { name: 'Movimientos' }).getByRole('listitem');
    await expect(rows).toHaveCount(2);
    // El más nuevo va primero: la rotura (-2, quedó en 10), y debajo la carga inicial (+12).
    await expect(rows.nth(0)).toContainText('Ajuste: Rotura');
    await expect(rows.nth(0)).toContainText('-2');
    await expect(rows.nth(0)).toContainText('10');
    await expect(rows.nth(1)).toContainText('Ajuste: Carga inicial');
    await expect(rows.nth(1)).toContainText('+12');
    // El dueño ve el costo del movimiento.
    await expect(rows.nth(0)).toContainText('Costo sin IVA');
  });

  test('una corrección por conteo calcula la diferencia (22 en sistema, 19 contados: -3)', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await openProductBySearch(page, SEED_CATALOG.count.name);
    await adjustStock(page, 'Corrección por conteo', '19');
    await expect(page.getByText('Stock ajustado. Ahora hay 19.')).toBeVisible();

    await page.getByRole('link', { name: 'Ver movimientos' }).click();
    const first = page.getByRole('list', { name: 'Movimientos' }).getByRole('listitem').first();
    await expect(first).toContainText('Ajuste: Corrección por conteo');
    await expect(first).toContainText('-3');
    await expect(first).toContainText('19');
  });

  test('contar lo mismo que dice el sistema no deja confirmar el ajuste', async ({ page }) => {
    await loginAs(page, users.owner());
    await openProductBySearch(page, SEED_CATALOG.count.name);
    await page.getByRole('link', { name: 'Ajustar stock' }).first().click();
    await page.getByRole('radio', { name: /^Corrección por conteo/ }).check();
    await page.getByLabel('¿Cuántos contaste?').fill('19');
    await page.getByRole('button', { name: 'Revisar ajuste' }).click();
    await expect(page.getByRole('button', { name: 'Confirmar ajuste' })).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe.serial('para reponer', () => {
  test('el encargado ve el producto con stock bajo el mínimo', async ({ page }) => {
    await loginAs(page, users.manager());
    await page
      .getByRole('navigation', { name: 'Principal' })
      .getByRole('link', { name: 'Para reponer' })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: 'Para reponer' })).toBeVisible();
    const row = page
      .getByRole('list', { name: 'Productos' })
      .getByRole('listitem')
      .filter({ hasText: SEED_CATALOG.restock.name });
    await expect(row).toBeVisible();
    // Hay 2, mínimo 5: faltan 3.
    await expect(row).toContainText('Mínimo · Falta');
    await expect(row).toContainText('5 · 3');
    // El que está bien de stock no aparece.
    await expect(page.getByText(SEED_CATALOG.count.name)).toHaveCount(0);
  });

  test('al subir el mínimo de un producto por encima de su stock, pasa a "Para reponer"', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await openProductBySearch(page, SEED_CATALOG.cola.name);
    await page.getByRole('link', { name: 'Editar datos' }).click();
    await page.getByLabel('Stock mínimo').fill('50');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados.')).toBeVisible();
    await expect(page.getByRole('main').getByText('Para reponer', { exact: true })).toBeVisible();

    await page.goto('/reponer');
    await expect(
      page
        .getByRole('list', { name: 'Productos' })
        .getByRole('listitem')
        .filter({ hasText: SEED_CATALOG.cola.name }),
    ).toBeVisible();
  });
});

test.describe('permisos en pantalla', () => {
  test('el empleado ve la lista y la ficha, pero ningún costo ni margen', async ({ page }) => {
    await loginAs(page, users.employee());
    const menu = page.getByRole('navigation', { name: 'Principal' });
    await expect(menu.getByRole('link', { name: 'Productos' })).toBeVisible();
    for (const hidden of ['Precios', 'Categorías', 'Para reponer', 'Configuración']) {
      await expect(menu.getByRole('link', { name: hidden })).toHaveCount(0);
    }

    await page.goto('/productos');
    await expect(page.getByRole('link', { name: 'Nuevo producto' })).toHaveCount(0);
    await openProductBySearch(page, SEED_CATALOG.cola.name);
    await expect(page.getByRole('region', { name: 'Venta' })).toContainText('1.700');

    for (const forbidden of ['Costo y margen', 'Precios']) {
      await expect(page.getByRole('heading', { name: forbidden })).toHaveCount(0);
    }
    await expect(page.getByText(/Costo sin IVA|Costo con IVA|Margen/)).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ajustar stock' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ver movimientos' })).toHaveCount(0);

    // Aunque abra la dirección a mano, las pantallas de gestión no se muestran.
    await page.goto('/pricing');
    await expect(page.getByRole('heading', { level: 1, name: 'Precios' })).toHaveCount(0);
    await page.goto('/categorias');
    await expect(page.getByRole('heading', { level: 1, name: 'Categorías' })).toHaveCount(0);
  });

  test('la respuesta de la API al empleado no trae ningún campo de costo', async ({ page }) => {
    await loginAs(page, users.employee());
    const bodies = await page.evaluate(async () => {
      const get = async (url: string) => (await fetch(url, { credentials: 'include' })).text();
      return [await get('/api/products?pageSize=50'), await get('/api/products/1')];
    });
    for (const body of bodies) {
      expect(body).toContain('Gaseosa Cola 500');
      expect(body).not.toMatch(
        /netCostPrice|costPrice|suggestedPrice|realMarginPercent|marginPercent|effectiveMarginPercent|unitNetCost/,
      );
    }
  });

  test('el encargado crea una categoría con margen, pero no puede cambiarlo después', async ({
    page,
  }) => {
    await loginAs(page, users.manager());
    await page.goto('/categorias');
    await createCategory(page, 'Cigarrillos', '25');
    await expect(page.getByRole('region', { name: 'Cigarrillos' })).toContainText('Margen 25 %');

    await page.getByRole('button', { name: 'Editar la categoría Cigarrillos' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel(/^Margen/)).toHaveCount(0);
    await expect(dialog.getByText('Solo el dueño cambia los márgenes.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();

    // Si igual se lo pide a la API, el servidor lo rechaza (403), incluso con el mismo valor.
    const status = await page.evaluate(async () => {
      const list = await (await fetch('/api/categories', { credentials: 'include' })).json();
      const cat = list.items.find((c: { name: string }) => c.name === 'Cigarrillos');
      const res = await fetch(`/api/categories/${cat.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-Kiosco': '1' },
        body: JSON.stringify({ marginPercent: '25' }),
      });
      return res.status;
    });
    expect(status).toBe(403);
  });

  test('el encargado no ve el margen propio en "Precios", pero sí cambia el costo', async ({
    page,
  }) => {
    await loginAs(page, users.manager());
    await page.goto('/pricing');
    await page.getByLabel('Buscar por código de barras o nombre').fill(SEED_CATALOG.restock.name);
    await page.getByRole('link', { name: SEED_CATALOG.restock.name, exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: SEED_CATALOG.restock.name }),
    ).toBeVisible();

    await expect(page.getByLabel('Margen propio de este producto')).toHaveCount(0);
    await expect(page.getByText('Solo el dueño cambia los márgenes.')).toBeVisible();

    await page.getByLabel('Costo sin IVA').fill('550');
    await expect(page.getByText(/Cambiar el costo o el margen no cambia el precio/)).toBeVisible();
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('button', { name: 'Sin cambios para guardar' })).toBeVisible();
    // El precio de venta quedó como estaba y el costo nuevo sobrevive a una recarga.
    await page.reload();
    await expect(page.getByLabel('Precio de venta (con IVA)')).toHaveValue('900');
    await expect(page.getByLabel('Costo sin IVA')).toHaveValue('550');
  });

  test('después de guardar, la pantalla avisa "Se guardó"', async ({ page }) => {
    await loginAs(page, users.manager());
    await page.goto('/pricing');
    await page.getByLabel('Buscar por código de barras o nombre').fill(SEED_CATALOG.count.name);
    await page.getByRole('link', { name: SEED_CATALOG.count.name, exact: true }).click();
    await page.getByLabel('Precio de venta (con IVA)').fill('1450');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText(/Se guardó\./)).toBeVisible();
  });
});
