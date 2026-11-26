// Etapa 5: proveedores y compras (plan 4.5, "Cómo probarlo" pasos 1 a 7).
// Un solo circuito de punta a punta, en orden (serial): proveedor, compra por bulto y por unidad con
// foto y PDF, pagos (transferencia y efectivo de la caja), pedido sugerido, anulación y permisos.
// Los productos son propios de este archivo (`SEED_PURCHASES`) y se crean por la base de pruebas.
// Los adjuntos se guardan en la carpeta temporal `UPLOADS_DIR` que define la config de Playwright.
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { SEED_CATALOG, SEED_PURCHASES, users } from './credentials';
import { db, disconnectDb } from './db';
import { expect, test } from './fixtures';
import { closeOpenCashViaApi, loginAs } from './helpers';

const PHOTO = fileURLToPath(new URL('./test-files/factura-prueba.jpg', import.meta.url));
const PDF = fileURLToPath(new URL('./test-files/remito-prueba.pdf', import.meta.url));
const { supplier: SUPPLIER, pack: PACK, unit: UNIT } = SEED_PURCHASES;

/** "$ 24.563,00" (el espacio puede ser común o fino). */
const money = (text: string) => new RegExp(text.replace('$', '\\$').replace(/ /g, '\\s'));

async function stockOf(barcode: string): Promise<string> {
  return (await db().product.findUniqueOrThrow({ where: { barcode } })).stockQuantity.toFixed(3);
}

async function netCostOf(barcode: string): Promise<string> {
  const p = await db().product.findUniqueOrThrow({ where: { barcode } });
  return p.netCostPrice?.toFixed(2) ?? 'null';
}

async function supplierBalance(): Promise<string> {
  const entries = await db().supplierAccountEntry.findMany({
    where: { supplier: { name: SUPPLIER.name } },
  });
  return entries.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2);
}

/** Busca el producto en el buscador de la compra y lo agrega (código + Enter). */
async function addProductLine(page: Page, barcode: string): Promise<void> {
  await page.getByLabel('Buscar el producto por código de barras o nombre').fill(barcode);
  await page.keyboard.press('Enter');
}

test.describe.configure({ mode: 'serial' });

test.describe('proveedores y compras', () => {
  let purchaseId = 0;
  let supplierId = 0;

  test.beforeAll(async () => {
    await closeOpenCashViaApi(users.owner());
    const subcategory = await db().subcategory.findFirstOrThrow({
      where: { name: SEED_CATALOG.subcategory },
    });
    const base = { subcategoryId: subcategory.id, saleUnit: 'UNIT' as const, vatRatePercent: '21' };
    await db().product.create({
      data: {
        ...base,
        name: PACK.name,
        barcode: PACK.barcode,
        netCostPrice: '700',
        costPrice: '847',
        salePrice: '1500',
        stockQuantity: '5',
      },
    });
    await db().product.create({
      data: {
        ...base,
        name: UNIT.name,
        barcode: UNIT.barcode,
        netCostPrice: '90',
        costPrice: '108.9',
        salePrice: '300',
        stockQuantity: '1',
        minStock: '10',
      },
    });
  });

  test.afterAll(async () => {
    await closeOpenCashViaApi(users.owner());
    await disconnectDb();
  });

  test('el dueño crea un proveedor y le asigna productos habituales', async ({ page }) => {
    await loginAs(page, users.owner());
    await page.goto('/proveedores/nuevo');
    await page.getByLabel('Nombre', { exact: true }).fill(SUPPLIER.name);
    await page.getByLabel(/^Teléfono/).fill(SUPPLIER.phone);
    await page.getByLabel(/^CUIT/).fill(SUPPLIER.taxId);
    await page.getByRole('button', { name: 'Crear proveedor' }).click();

    await expect(page.getByRole('heading', { level: 1, name: SUPPLIER.name })).toBeVisible();
    await expect(page.getByText('11 2345-6789')).toBeVisible();
    await expect(page.getByText('30-71234567-1')).toBeVisible();
    const saved = await db().supplier.findFirstOrThrow({ where: { name: SUPPLIER.name } });
    supplierId = saved.id;
    // Se guarda normalizado: 10 números (el link de WhatsApp lo lleva con 549).
    expect(saved.phone).toBe('1123456789');
    expect(saved.taxId).toBe('30712345671');

    await page.getByRole('link', { name: 'Asignar productos' }).click();
    await page.getByLabel('Buscar por código de barras o nombre').fill('E2E');
    const list = page.getByRole('list', { name: 'Productos' });
    await list.getByRole('checkbox', { name: new RegExp(PACK.name) }).check();
    await list.getByRole('checkbox', { name: new RegExp(UNIT.name) }).check();
    await page.getByRole('button', { name: `Asignar a ${SUPPLIER.name}` }).click();
    await expect(page.getByText('Listo: 2 productos asignados')).toBeVisible();
    const assigned = await db().product.count({ where: { defaultSupplierId: supplierId } });
    expect(assigned).toBe(2);
  });

  test('carga una compra por bulto y por unidad con foto y PDF: sube el stock, cambia el costo y queda la deuda', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.goto('/compras/nueva');
    await expect(page.getByRole('heading', { level: 1, name: 'Cargar una compra' })).toBeVisible();
    await page.getByLabel('Proveedor').selectOption({ label: SUPPLIER.name });
    await page.getByLabel(/^Número del comprobante/).fill('0001-00001234');

    // Línea 1: 2 bultos de 12 a $ 10.000 sin IVA, IVA 21 %.
    await addProductLine(page, PACK.barcode);
    const line1 = page.getByRole('listitem', { name: new RegExp(`^Línea 1: ${PACK.name}`) });
    await line1.getByRole('radio', { name: 'Por bulto' }).check();
    await line1.getByLabel('Bultos').fill('2');
    await line1.getByLabel('Unidades por bulto').fill('12');
    await line1.getByLabel('Costo sin IVA de un bulto').fill('10000');
    await expect(line1).toContainText('Entran 24');
    await expect(line1).toContainText(money('$ 833,33'));
    await expect(line1).toContainText(money('Subtotal sin IVA: $ 20.000,00'));

    // Línea 2: por unidad, 3 a $ 100 sin IVA.
    await addProductLine(page, UNIT.barcode);
    const line2 = page.getByRole('listitem', { name: new RegExp(`^Línea 2: ${UNIT.name}`) });
    await line2.getByRole('radio', { name: 'Por unidad' }).check();
    await line2.getByLabel('Cantidad').fill('3');
    await line2.getByLabel('Costo sin IVA por unidad').fill('100');

    // Neto 20.300 + IVA 21 % (4.263) = 24.563.
    await expect(page.getByTestId('purchase-total')).toContainText(money('$ 24.563,00'));

    await page.getByLabel('Elegir archivo').setInputFiles([PHOTO, PDF]);
    const picked = page.getByRole('list', { name: 'Archivos para adjuntar' });
    await expect(picked.getByRole('listitem')).toHaveCount(2);

    await page.getByRole('button', { name: 'Guardar la compra' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compra guardada' })).toBeVisible();
    await expect(page.getByText(/el stock subió y la deuda se sumó/)).toBeVisible();
    await expect(page.getByText(money('$ 24.563,00')).first()).toBeVisible();
    await expect(page.getByRole('list', { name: 'Productos con costo nuevo' })).toContainText(
      PACK.name,
    );

    // Lo guardado: stock, costo, deuda y los dos adjuntos.
    expect(await stockOf(PACK.barcode)).toBe('29.000');
    expect(await stockOf(UNIT.barcode)).toBe('4.000');
    expect(await netCostOf(PACK.barcode)).toBe('833.33');
    expect(await netCostOf(UNIT.barcode)).toBe('100.00');
    expect(await supplierBalance()).toBe('24563.00');
    const product = await db().product.findUniqueOrThrow({ where: { barcode: PACK.barcode } });
    expect(product.salePrice.toFixed(2)).toBe('1500.00'); // el precio de venta no cambia solo
    const purchase = await db().purchase.findFirstOrThrow({
      where: { supplier: { name: SUPPLIER.name } },
      include: { attachments: { where: { deletedAt: null } } },
    });
    purchaseId = purchase.id;
    expect(purchase.attachments.map((a) => a.mimeType).sort()).toEqual([
      'application/pdf',
      'image/jpeg',
    ]);

    await page.getByRole('link', { name: 'Ver la compra' }).click();
    await expect(page).toHaveURL(new RegExp(`/compras/${purchaseId}$`));
  });

  test('en el detalle de la compra se ve la foto, el PDF se descarga y se puede borrar un archivo', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.goto(`/compras/${purchaseId}`);
    await expect(page.getByText('Confirmada')).toBeVisible();
    const files = page.getByRole('list', { name: 'Archivos adjuntos' });
    await expect(files.getByRole('listitem')).toHaveCount(2);

    // La foto se sirve como imagen y el PDF siempre como descarga (ADR 005).
    const photoHref = await page
      .getByRole('link', { name: 'Abrir factura-prueba.jpg' })
      .getAttribute('href');
    const photo = await page.request.get(photoHref ?? '');
    expect(photo.status()).toBe(200);
    expect(photo.headers()['content-type']).toContain('image/jpeg');
    const pdfHref = await page
      .getByRole('link', { name: 'Descargar remito-prueba.pdf' })
      .getAttribute('href');
    const pdf = await page.request.get(pdfHref ?? '');
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-disposition']).toContain('attachment');

    await page.getByRole('button', { name: 'Borrar remito-prueba.pdf' }).click();
    await page.getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(files.getByRole('listitem')).toHaveCount(1);
    expect(await db().purchaseAttachment.count({ where: { purchaseId, deletedAt: null } })).toBe(1);
  });

  test('paga una parte con transferencia y otra con efectivo de la caja: solo el efectivo toca el arqueo', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    // Sin caja abierta, el efectivo de la caja no se puede usar: se abre la caja con $ 10.000.
    await page.goto('/vender');
    await expect(
      page.getByRole('heading', { name: 'Abrí la caja para empezar a vender' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Mañana' }).check();
    await page.getByLabel('Efectivo inicial ($)').fill('10000');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Caja abierta · turno mañana/)).toBeVisible();

    await page.goto(`/proveedores/${supplierId}`);
    const balance = page.getByRole('region', { name: 'Saldo' });
    await expect(balance).toContainText(money('$ 24.563,00'));

    // Transferencia de $ 10.000.
    await page.getByRole('button', { name: 'Registrar un pago' }).click();
    let dialog = page.getByRole('dialog', { name: `Registrar un pago a ${SUPPLIER.name}` });
    await dialog.getByLabel('Monto pagado').fill('10000');
    await dialog.getByLabel('De dónde sale la plata').selectOption({ label: 'Transferencia' });
    await dialog.getByLabel(/^Referencia/).fill('TR-123');
    await dialog.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(dialog).toBeHidden();
    await expect(balance).toContainText(money('$ 14.563,00'));

    // Efectivo de la caja: $ 3.000.
    await page.getByRole('button', { name: 'Registrar un pago' }).click();
    dialog = page.getByRole('dialog', { name: `Registrar un pago a ${SUPPLIER.name}` });
    await dialog.getByLabel('Monto pagado').fill('3000');
    await dialog
      .getByLabel('De dónde sale la plata')
      .selectOption({ label: 'Efectivo de la caja' });
    await dialog.getByRole('button', { name: 'Registrar pago' }).click();
    await expect(dialog).toBeHidden();
    await expect(balance).toContainText(money('$ 11.563,00'));
    expect(await supplierBalance()).toBe('11563.00');

    // La caja tiene UNA sola salida (la del efectivo), no la transferencia.
    const session = await db().cashSession.findFirstOrThrow({ where: { status: 'OPEN' } });
    const movements = await db().cashMovement.findMany({ where: { cashSessionId: session.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]?.amount.toFixed(2)).toBe('3000.00');

    await page.goto('/caja');
    await expect(page.locator('.cash-now__expected')).toContainText(money('$ 7.000'));
    await page.goto(`/caja/${session.id}`);
    await expect(page.getByText(`Pago a proveedor: ${SUPPLIER.name}`)).toBeVisible();
  });

  test('el pedido sugerido pide el mínimo menos el stock, se copia y arma el link de WhatsApp', async ({
    page,
    context,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await loginAs(page, users.owner());
    await page.goto(`/proveedores/${supplierId}`);
    await page.getByRole('link', { name: 'Pedido sugerido' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: `Pedido sugerido para ${SUPPLIER.name}` }),
    ).toBeVisible();

    // Alfajor: hay 4, mínimo 10 -> 6. La gaseosa tiene stock de sobra y no entra.
    const items = page.getByRole('list', { name: 'Productos del pedido' });
    await expect(items).toContainText(UNIT.name);
    await expect(items).not.toContainText(PACK.name);
    const unit = await db().product.findUniqueOrThrow({ where: { barcode: UNIT.barcode } });
    await expect(page.locator(`#qty-${unit.id}`)).toHaveValue('6');

    const text = page.getByLabel('Texto del pedido');
    await expect(text).toHaveValue(new RegExp(`6.*${UNIT.name}|${UNIT.name}.*6`));
    await page.getByRole('button', { name: 'Copiar' }).click();
    await expect(page.getByText('Copiado. Ya lo podés pegar donde quieras.')).toBeVisible();
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe(await text.inputValue());

    const href = await page.getByRole('link', { name: 'Abrir WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
    expect(decodeURIComponent(href ?? '')).toContain(UNIT.name);
  });

  test('anula la compra: vuelven el stock y la deuda, los costos quedan', async ({ page }) => {
    await loginAs(page, users.owner());
    await page.goto(`/compras/${purchaseId}`);
    await page.getByRole('button', { name: 'Anular la compra' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anular la compra' });
    // Sin motivo no se puede.
    await dialog.getByRole('button', { name: 'Anular la compra' }).click();
    await expect(dialog).toBeVisible();
    expect(await db().purchase.count({ where: { id: purchaseId, voidedAt: { not: null } } })).toBe(
      0,
    );
    await dialog.getByLabel('Motivo').fill('Se cargó con el proveedor equivocado');
    await dialog.getByRole('button', { name: 'Anular la compra' }).click();
    await expect(
      page.getByText(/Compra anulada: el stock y la deuda volvieron atrás/),
    ).toBeVisible();
    await expect(page.getByText('Anulada', { exact: true })).toBeVisible();

    expect(await stockOf(PACK.barcode)).toBe('5.000');
    expect(await stockOf(UNIT.barcode)).toBe('1.000');
    // Los costos no vuelven atrás.
    expect(await netCostOf(PACK.barcode)).toBe('833.33');
    expect(await netCostOf(UNIT.barcode)).toBe('100.00');
    // La deuda de la compra se revierte; los pagos ($ 13.000) quedan: saldo a favor del kiosco.
    expect(await supplierBalance()).toBe('-13000.00');
    await page.goto(`/proveedores/${supplierId}`);
    await expect(page.getByRole('region', { name: 'Saldo' })).toContainText('A favor del kiosco');
    // Anular dos veces no se puede: el botón ya no está.
    await page.goto(`/compras/${purchaseId}`);
    await expect(page.getByRole('button', { name: 'Anular la compra' })).toHaveCount(0);
  });

  test('el empleado no ve Compras ni Proveedores, ni por URL ni por la API', async ({ page }) => {
    await loginAs(page, users.employee());
    const menu = page.getByRole('navigation', { name: 'Principal' });
    await expect(menu.getByRole('link', { name: 'Inicio' })).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Compras' })).toHaveCount(0);
    await expect(menu.getByRole('link', { name: 'Proveedores' })).toHaveCount(0);

    for (const path of [
      '/compras',
      '/compras/nueva',
      '/proveedores',
      `/proveedores/${supplierId}`,
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'No tenés permiso para ver esta pantalla' }),
      ).toBeVisible();
    }

    for (const api of [
      '/api/purchases',
      `/api/purchases/${purchaseId}`,
      '/api/suppliers',
      `/api/suppliers/${supplierId}/account`,
      `/api/suppliers/${supplierId}/suggested-order`,
    ]) {
      expect((await page.request.get(api)).status(), api).toBe(403);
    }
    // El archivo adjunto tampoco se sirve al empleado.
    const attachment = await db().purchaseAttachment.findFirstOrThrow({
      where: { purchaseId, deletedAt: null },
    });
    expect(
      (
        await page.request.get(`/api/purchases/${purchaseId}/attachments/${attachment.id}`)
      ).status(),
    ).toBe(403);
  });
});
