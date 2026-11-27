// Etapa 5, cierre: devolución del proveedor (proveedores.md 15, "Cómo probarlo" paso 8).
// Circuito en orden (serial): compra pagada con efectivo de la caja, anulación (saldo a favor),
// devolución en efectivo que entra a la caja y variante con monto mayor que el saldo a favor.
import { SEED_CATALOG, SEED_REFUND, users } from './credentials';
import { db, disconnectDb } from './db';
import { expect, test } from './fixtures';
import { closeOpenCashViaApi, loginAs } from './helpers';

const { supplier: SUPPLIER, product: PRODUCT } = SEED_REFUND;

/** "$ 5.000,00" (el espacio puede ser común o fino). */
const money = (text: string) => new RegExp(text.replace('$', '\\$').replace(/ /g, '\\s'));

async function supplierEntries() {
  return db().supplierAccountEntry.findMany({
    where: { supplier: { name: SUPPLIER.name } },
    orderBy: { id: 'asc' },
  });
}

async function supplierBalance(): Promise<string> {
  const entries = await supplierEntries();
  return entries.reduce((sum, e) => sum + Number(e.amount), 0).toFixed(2);
}

test.describe.configure({ mode: 'serial' });

test.describe('devolución del proveedor', () => {
  let supplierId = 0;
  let purchaseId = 0;
  let cashId = 0;

  test.beforeAll(async () => {
    await closeOpenCashViaApi(users.owner());
    const subcategory = await db().subcategory.findFirstOrThrow({
      where: { name: SEED_CATALOG.subcategory },
    });
    await db().product.create({
      data: {
        subcategoryId: subcategory.id,
        saleUnit: 'UNIT',
        vatRatePercent: '21',
        name: PRODUCT.name,
        barcode: PRODUCT.barcode,
        netCostPrice: '1000',
        costPrice: '1210',
        salePrice: '2000',
        stockQuantity: '0',
      },
    });
    const created = await db().supplier.create({ data: { name: SUPPLIER.name } });
    supplierId = created.id;
  });

  test.afterAll(async () => {
    await closeOpenCashViaApi(users.owner());
    await disconnectDb();
  });

  test('compra pagada con efectivo de la caja y anulada: queda saldo a favor del kiosco', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.goto('/vender');
    await page.getByRole('radio', { name: 'Mañana' }).check();
    await page.getByLabel('Efectivo inicial ($)').fill('10000');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/Caja abierta · turno mañana/)).toBeVisible();
    cashId = (await db().cashSession.findFirstOrThrow({ where: { status: 'OPEN' } })).id;

    await page.goto('/compras/nueva');
    await page.getByLabel('Proveedor').selectOption({ label: SUPPLIER.name });
    await page.getByLabel(/^Número del comprobante/).fill('0009-00000001');
    await page.getByLabel('Buscar el producto por código de barras o nombre').fill(PRODUCT.barcode);
    await page.keyboard.press('Enter');
    const line = page.getByRole('listitem', { name: new RegExp(`^Línea 1: ${PRODUCT.name}`) });
    await line.getByRole('radio', { name: 'Por unidad' }).check();
    await line.getByLabel('Cantidad').fill('10');
    await line.getByLabel('Costo sin IVA por unidad').fill('1000');
    // Neto 10.000 + IVA 21 % = 12.100.
    await expect(page.getByTestId('purchase-total')).toContainText(money('$ 12.100,00'));

    // Pagar ahora $ 5.000 con efectivo de la caja.
    await page.getByLabel('Pagar ahora').check();
    await page.getByLabel('De dónde sale la plata').selectOption({ label: 'Efectivo de la caja' });
    await page.getByLabel('Monto que pagás ahora').fill('5000');
    await page.getByRole('button', { name: 'Guardar la compra' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Compra guardada' })).toBeVisible();
    purchaseId = (
      await db().purchase.findFirstOrThrow({ where: { supplierId }, orderBy: { id: 'desc' } })
    ).id;
    expect(await supplierBalance()).toBe('7100.00');

    // Anular la compra: los pagos quedan y el proveedor pasa a deberle $ 5.000 al kiosco.
    await page.goto(`/compras/${purchaseId}`);
    await page.getByRole('button', { name: 'Anular la compra' }).click();
    const dialog = page.getByRole('dialog', { name: 'Anular la compra' });
    await dialog.getByLabel('Motivo').fill('Mercadería equivocada, la devuelven');
    await dialog.getByRole('button', { name: 'Anular la compra' }).click();
    await expect(page.getByText(/Compra anulada/)).toBeVisible();
    expect(await supplierBalance()).toBe('-5000.00');

    await page.goto(`/proveedores/${supplierId}`);
    const balance = page.getByRole('region', { name: 'Saldo' });
    await expect(balance).toContainText('Saldo a favor del kiosco');
    await expect(balance).toContainText(money('$ 5.000,00'));
  });

  test('registra la devolución en efectivo a la caja: el saldo vuelve a 0 y sube el esperado', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    // Antes: la caja abrió con $ 10.000 y salieron $ 5.000 del pago.
    await page.goto('/caja');
    await expect(page.locator('.cash-now__expected')).toContainText(money('$ 5.000'));

    // Desde la compra anulada se llega con la descripción lista.
    await page.goto(`/compras/${purchaseId}`);
    await page.getByRole('link', { name: 'Registrar devolución' }).click();
    const dialog = page.getByRole('dialog', {
      name: `Registrar una devolución de ${SUPPLIER.name}`,
    });
    await expect(dialog.getByLabel('Monto devuelto')).toHaveValue(/^5000([.,]00)?$/);
    await dialog.getByLabel('¿Cómo te devolvió la plata?').selectOption('CASH_REGISTER');
    await dialog.getByRole('button', { name: 'Registrar devolución' }).click();
    await expect(dialog).toBeHidden();

    // Saldo en $ 0 y fila "Devolución del proveedor" en la cuenta corriente.
    const balance = page.getByRole('region', { name: 'Saldo' });
    await expect(balance).toContainText(money('$ 0,00'));
    await expect(balance).not.toContainText('Saldo a favor del kiosco');
    await expect(page.getByText('Devolución del proveedor').first()).toBeVisible();
    expect(await supplierBalance()).toBe('0.00');

    const entries = await supplierEntries();
    const refund = entries.at(-1)!;
    expect(refund.type).toBe('REFUND');
    expect(refund.amount.toFixed(2)).toBe('5000.00');
    expect(refund.paymentSource).toBe('CASH_REGISTER');

    // La caja: un ingreso del motivo nuevo, ligado a la cuenta, y el esperado sube $ 5.000.
    const income = await db().cashMovement.findFirstOrThrow({
      where: { cashSessionId: cashId, reason: 'SUPPLIER_REFUND' },
    });
    expect(income.direction).toBe('IN');
    expect(income.amount.toFixed(2)).toBe('5000.00');
    expect(income.supplierAccountEntryId).toBe(refund.id);

    await page.goto(`/caja/${cashId}`);
    const row = page.getByRole('row', { name: /Devolución del proveedor/ });
    await expect(row).toContainText(SUPPLIER.name);
    await expect(row).toContainText(money('$ 5.000'));
    await expect(page.getByRole('region', { name: 'Arqueo del efectivo' })).toContainText(
      money('Esperado hasta ahora\\s*$ 10.000'),
    );
    await page.goto('/caja');
    await expect(page.locator('.cash-now__expected')).toContainText(money('$ 10.000'));
  });

  test('una devolución mayor que el saldo a favor pide confirmar con "Registrar igual"', async ({
    page,
  }) => {
    await loginAs(page, users.owner());
    await page.goto(`/proveedores/${supplierId}`);
    await page.getByRole('button', { name: 'Registrar devolución' }).first().click();
    const dialog = page.getByRole('dialog', {
      name: `Registrar una devolución de ${SUPPLIER.name}`,
    });
    await dialog.getByLabel('Monto devuelto').fill('100');
    await dialog.getByLabel('¿Cómo te devolvió la plata?').selectOption('CASH_REGISTER');
    await dialog.getByRole('button', { name: 'Registrar devolución' }).click();

    // El saldo era 0: el sistema avisa y no guarda nada hasta que se confirma.
    const confirm = page.getByRole('dialog', {
      name: 'La devolución es mayor que el saldo a favor',
    });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText('Hoy no hay saldo a favor del kiosco');
    await expect(confirm).toContainText(money('$ 100,00'));
    expect(await supplierBalance()).toBe('0.00');
    expect(await db().cashMovement.count({ where: { reason: 'SUPPLIER_REFUND' } })).toBe(1);

    // "Revisar el monto" vuelve al formulario sin guardar.
    await confirm.getByRole('button', { name: 'Revisar el monto' }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Registrar devolución' }).click();
    await page
      .getByRole('dialog', { name: 'La devolución es mayor que el saldo a favor' })
      .getByRole('button', { name: 'Registrar igual' })
      .click();

    await expect(page.getByRole('region', { name: 'Saldo' })).toContainText(money('$ 100,00'));
    expect(await supplierBalance()).toBe('100.00');
    expect(await db().cashMovement.count({ where: { reason: 'SUPPLIER_REFUND' } })).toBe(2);
    await page.goto('/caja');
    await expect(page.locator('.cash-now__expected')).toContainText(money('$ 10.100'));
  });
});
