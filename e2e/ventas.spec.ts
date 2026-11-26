// Etapa 3: ventas en el mostrador (plan 4.3, "Cómo probarlo" pasos 1 a 8).
// El mostrador se maneja con el TECLADO, como lo haría un cajero: el lector de códigos se simula
// tipeando el código + Enter, y se cobra con Ctrl+Enter. Solo la administración (lista de ventas,
// anular) usa clics.
//
// Estado de la caja: todavía no hay cierre de caja (etapa 4), así que entre tests la caja se
// resuelve directo en la base (ver `db.ts`): se cierra al empezar y al terminar este archivo, y
// dentro del archivo los tests van en orden (serial): el primero la abre por la pantalla y los
// demás la usan abierta. Los productos son propios de este archivo (`SEED_SALES`), así que su
// stock es el sembrado.
import type { Page } from '@playwright/test';
import { SEED_SALES, users } from './credentials';
import { closeOpenCashSession, db, disconnectDb, salesWithProduct, stockOfBarcode } from './db';
import { expect, test } from './fixtures';
import { loginAs } from './helpers';

/** "$ 4.247" (el espacio puede ser común o fino). */
const money = (text: string) => new RegExp(text.replace('$', '\\$').replace(/ /g, '\\s'));

const searchBox = (page: Page) => page.getByLabel('Código de barras o nombre del producto');
const cartRow = (page: Page, name: string) => page.getByRole('row').filter({ hasText: name });

/** Simula el lector: tipea el código seguido de Enter (sin pausas, como lo hace el aparato). */
async function scan(page: Page, barcode: string): Promise<void> {
  await page.keyboard.type(barcode);
  await page.keyboard.press('Enter');
}

/** Entra con el usuario y abre la pantalla de venta. */
async function openSaleScreen(page: Page, user: ReturnType<typeof users.employee>): Promise<void> {
  await loginAs(page, user);
  await page.goto('/vender');
  await expect(page.getByRole('heading', { level: 1, name: 'Vender' })).toBeVisible();
}

/**
 * Entra y espera a que el buscador tenga el foco (la caja ya cargó). Hay que esperarlo: mientras la
 * pantalla dice "Cargando la caja…" el título ya se ve, pero lo que se tipea se pierde.
 */
async function openSaleScreenReady(
  page: Page,
  user: ReturnType<typeof users.employee>,
): Promise<void> {
  await openSaleScreen(page, user);
  await expect(searchBox(page)).toBeFocused();
}

test.describe.configure({ mode: 'serial' });

test.describe('ventas en el mostrador', () => {
  /** Id de la venta del encargado (ejemplo 2), para anularla después. */
  let mixedSaleId = 0;

  test.beforeAll(async () => {
    await closeOpenCashSession();
  });
  test.afterAll(async () => {
    await closeOpenCashSession();
    await disconnectDb();
  });

  test('el empleado abre la caja (turno Mañana, $5.000) con el teclado y no ve el efectivo inicial', async ({
    page,
  }) => {
    await openSaleScreen(page, users.employee());
    await expect(
      page.getByRole('heading', { name: 'Abrí la caja para empezar a vender' }),
    ).toBeVisible();

    await page.getByRole('radio', { name: 'Mañana' }).check();
    await page.getByLabel('Efectivo inicial ($)').fill('5000');
    await page.keyboard.press('Enter');

    await expect(page.getByText(/Caja abierta · turno mañana/)).toBeVisible();
    // H-40 a: el empleado no ve cuánto había al abrir (el cierre es a ciegas).
    await expect(page.getByText(/inicial/i)).toHaveCount(0);
    // Y el foco queda listo para el lector.
    await expect(searchBox(page)).toBeFocused();

    const open = await db().cashSession.findMany({ where: { status: 'OPEN' } });
    expect(open).toHaveLength(1);
    expect(open[0]?.shift).toBe('MORNING');
    expect(open[0]?.openingCash.toFixed(2)).toBe('5000.00');
  });

  test('el empleado vende con el lector (mismo código dos veces), por nombre, por peso y "Varios"', async ({
    page,
  }) => {
    await openSaleScreenReady(page, users.employee());
    await expect(searchBox(page)).toBeFocused();

    // Lector: el mismo código dos veces suma una unidad a la misma línea.
    await scan(page, SEED_SALES.chicle.barcode);
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(1);
    await scan(page, SEED_SALES.chicle.barcode);
    await expect(
      page.getByRole('button', { name: `Cantidad de ${SEED_SALES.chicle.name}: 2. Cambiar` }),
    ).toBeVisible();
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(1);
    // El foco vuelve solo al buscador: se puede seguir escaneando.
    await expect(searchBox(page)).toBeFocused();

    // Por nombre: escribir, Enter (aparecen los resultados), Enter (agrega el elegido).
    await page.keyboard.type('Vainilla');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('listbox', { name: 'Resultados' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(cartRow(page, SEED_SALES.galletita.name)).toHaveCount(1);

    // Por peso: el código abre "Cuántos kilos"; se escribe con coma.
    await scan(page, SEED_SALES.queso.barcode);
    const kilos = page.getByRole('dialog', { name: 'Cuántos kilos' });
    await expect(kilos).toBeVisible();
    await page.keyboard.type('0,350');
    await page.keyboard.press('Enter');
    await expect(kilos).toBeHidden();
    // 0,350 kg x $4.990 = $1.746,50 -> $1.747 (H-06).
    await expect(cartRow(page, SEED_SALES.queso.name)).toContainText('0,350 kg');
    await expect(cartRow(page, SEED_SALES.queso.name)).toContainText(money('$ 1.747'));

    // "Varios" con F4: precio, Tab, descripción, Enter.
    await page.keyboard.press('F4');
    await expect(page.getByRole('dialog', { name: 'Varios' })).toBeVisible();
    await page.keyboard.type('700');
    await page.keyboard.press('Tab');
    await page.keyboard.type('pila AA');
    await page.keyboard.press('Enter');
    await expect(cartRow(page, 'Varios')).toContainText(money('$ 700'));
    await expect(searchBox(page)).toBeFocused();

    // 2 x 500 + 800 + 1.747 + 700 = 4.247. El empleado no ve el descuento (lo prueba otro test).
    await expect(page.locator('.totalbox__value')).toHaveText(money('$ 4.247'));

    // Cobrar con Ctrl+Enter: todo en efectivo, entrega $5.000 -> vuelto $753.
    await page.keyboard.press('Control+Enter');
    const checkout = page.getByRole('dialog', { name: 'Cobrar' });
    await expect(checkout).toBeVisible();
    await expect(checkout.getByText('Total a cobrar')).toBeVisible();
    await expect(checkout.locator('.checkout__total-value')).toHaveText(money('$ 4.247'));
    await page.keyboard.type('5000');
    await expect(checkout.getByText(/Vuelto/)).toContainText(money('$ 753'));
    await page.keyboard.press('Enter');

    const summary = page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(money('$ 4.247'));
    await expect(summary).toContainText(money('$ 753'));
    await expect(searchBox(page)).toBeFocused();
    // El carrito quedó vacío.
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(0);

    // Lo guardado: stock descontado, "Varios" sin stock y con su descripción.
    expect(await stockOfBarcode(SEED_SALES.chicle.barcode)).toBe('48.000');
    expect(await stockOfBarcode(SEED_SALES.galletita.barcode)).toBe('29.000');
    expect(await stockOfBarcode(SEED_SALES.queso.barcode)).toBe('4.650');
    const [sale] = await salesWithProduct(SEED_SALES.queso.barcode);
    expect(sale?.total.toFixed(2)).toBe('4247.00');
    expect(sale?.items).toHaveLength(4);
    const misc = sale?.items.find((i) => i.customDescription !== null);
    expect(misc?.customDescription).toBe('pila AA');
    expect(misc?.unitPrice.toFixed(2)).toBe('700.00');
    expect(await db().stockMovement.count({ where: { saleItemId: misc?.id } })).toBe(0);
  });

  test('un producto sin stock suficiente avisa y se vende igual (stock negativo)', async ({
    page,
  }) => {
    await openSaleScreenReady(page, users.employee());
    await scan(page, SEED_SALES.pila.barcode);
    await expect(cartRow(page, SEED_SALES.pila.name)).toHaveCount(1);
    await expect(page.getByText(/Stock insuficiente \(hay 1\)/)).toHaveCount(0);
    await scan(page, SEED_SALES.pila.barcode);
    await expect(page.getByText(/Stock insuficiente \(hay 1\)/)).toBeVisible();

    await page.keyboard.press('Control+Enter');
    await expect(page.getByRole('dialog', { name: 'Cobrar' })).toBeVisible();
    await page.keyboard.press('Enter');

    const summary = page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Quedó con stock negativo');
    await expect(summary).toContainText(`${SEED_SALES.pila.name}: -1`);
    expect(await stockOfBarcode(SEED_SALES.pila.barcode)).toBe('-1.000');
  });

  test('el encargado cobra el ejemplo 2: $10.000, 10 % de descuento, $4.500 en efectivo y $4.500 con crédito -> $9.500', async ({
    newContext,
  }) => {
    const page = await (await newContext()).newPage();
    await openSaleScreenReady(page, users.manager());
    // La caja la abrió el empleado: el encargado vende en esa.
    await expect(page.getByText(/Esta caja la abrió/)).toBeVisible();

    await scan(page, SEED_SALES.vino.barcode);
    await expect(cartRow(page, SEED_SALES.vino.name)).toHaveCount(1);
    await scan(page, SEED_SALES.fernet.barcode);
    await expect(cartRow(page, SEED_SALES.fernet.name)).toHaveCount(1);
    await expect(page.locator('.totalbox__value')).toHaveText(money('$ 10.000'));

    // F8: descuento del 10 %.
    await page.keyboard.press('F8');
    const discount = page.getByRole('dialog', { name: 'Descuento' });
    await expect(discount).toBeVisible();
    // El valor se escribe en el campo directamente: el foco NO llega solo (ver el test `fail` de abajo).
    await discount.getByLabel('Cuántos %').fill('10');
    await page.keyboard.press('Enter');
    await expect(discount).toBeHidden();
    await expect(page.locator('.totalbox__value')).toHaveText(money('$ 9.000'));

    // Cobro mixto: $4.500 en efectivo y el resto con crédito.
    await page.keyboard.press('Control+Enter');
    const checkout = page.getByRole('dialog', { name: 'Cobrar' });
    await expect(checkout).toBeVisible();
    await checkout.getByLabel('Monto del pago 1 (sin recargo)').fill('4500');
    await checkout
      .getByRole('group', { name: 'Resto con:' })
      .getByRole('button', { name: 'Crédito' })
      .press('Enter');
    await expect(checkout.getByLabel('Monto del pago 2 (sin recargo)')).toHaveValue('4500');
    await expect(checkout.getByText(/Cobrá/)).toContainText(money('$ 5.000'));
    await expect(checkout.getByText(/Cobrá/)).toContainText('en el posnet');
    await expect(checkout.locator('.checkout__total-value')).toHaveText(money('$ 9.500'));
    await expect(checkout.getByText('Los pagos cubren el total.')).toBeVisible();

    // Entrega $5.000 -> vuelto $500. Se cobra con Ctrl+Enter desde el campo.
    const tendered = checkout.getByLabel(/Efectivo que entrega el cliente/);
    await tendered.fill('5000');
    await expect(checkout.getByText(/Vuelto/)).toContainText(money('$ 500'));
    await tendered.press('Control+Enter');

    const summary = page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(money('$ 9.500'));
    await expect(summary).toContainText(money('$ 500'));
    await expect(summary).toContainText(/Crédito\s*\$\s*5\.000/);

    const [sale] = await salesWithProduct(SEED_SALES.vino.barcode);
    expect(sale).toBeDefined();
    mixedSaleId = sale!.id;
    expect(sale!.total.toFixed(2)).toBe('9500.00');
    expect(sale!.subtotal.toFixed(2)).toBe('10000.00');
    expect(sale!.discountAmount.toFixed(2)).toBe('1000.00');
    expect(sale!.surchargeAmount.toFixed(2)).toBe('500.00');
    const byKind = Object.fromEntries(
      sale!.payments.map((p) => [p.paymentMethod.kind, p.amount.toFixed(2)]),
    );
    expect(byKind).toEqual({ CASH: '4500.00', CREDIT_CARD: '4500.00' });
    expect(await stockOfBarcode(SEED_SALES.vino.barcode)).toBe('9.000');
    expect(await stockOfBarcode(SEED_SALES.fernet.barcode)).toBe('9.000');
    expect(
      await db().auditLog.count({
        where: { action: 'DISCOUNT_APPLIED', entityId: String(mixedSaleId) },
      }),
    ).toBe(1);
  });

  // Bug de QA (etapa 3), ya arreglado: al abrir el diálogo de descuento con F8 el foco cae en el botón
  // "Porcentaje (%)" y no en el campo "Cuántos %", así que lo que tipea el cajero se pierde.
  // `autoFocus` de React no alcanza dentro de un <dialog>: `showModal()` elige el primer elemento
  // enfocable. Mientras el bug exista, este test falla A PROPÓSITO (`test.fail`); cuando se arregle,
  // Playwright avisa que "pasó inesperadamente" y hay que sacar la marca.
  test('F8: el foco queda en el campo del descuento y se puede tipear el valor', async ({
    newContext,
  }) => {
    const page = await (await newContext()).newPage();
    await openSaleScreenReady(page, users.manager());
    await scan(page, SEED_SALES.chicle.barcode);
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(1);
    await page.keyboard.press('F8');
    const discount = page.getByRole('dialog', { name: 'Descuento' });
    await expect(discount).toBeVisible();
    await page.keyboard.type('10');
    await expect(discount.getByLabel('Cuántos %')).toHaveValue('10');
  });

  // Bug de QA (etapa 3), ya arreglado: después de elegir "Resto con: Crédito" con el teclado, ese botón queda
  // deshabilitado (ya no falta nada), el foco se pierde en <body> y Ctrl+Enter ya no cobra.
  test('Ctrl+Enter cobra aunque se haya usado "Resto con" con el teclado', async ({
    newContext,
  }) => {
    const page = await (await newContext()).newPage();
    await openSaleScreenReady(page, users.manager());
    await scan(page, SEED_SALES.vino.barcode);
    await expect(cartRow(page, SEED_SALES.vino.name)).toHaveCount(1);
    await page.keyboard.press('Control+Enter');
    const checkout = page.getByRole('dialog', { name: 'Cobrar' });
    await expect(checkout).toBeVisible();
    await checkout.getByLabel('Monto del pago 1 (sin recargo)').fill('3000');
    await checkout
      .getByRole('group', { name: 'Resto con:' })
      .getByRole('button', { name: 'Débito' })
      .press('Enter');
    await expect(checkout.getByText('Los pagos cubren el total.')).toBeVisible();
    await page.keyboard.press('Control+Enter');
    await expect(page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ })).toBeVisible({
      timeout: 3000,
    });
  });

  // Bug de QA (etapa 3), ya arreglado: si se sacan todos los productos con Supr, el descuento queda aplicado
  // (con un cartel "El descuento es tan chico que da $ 0" y todo en $ 0) y se le aplica a la venta
  // siguiente sin que nadie lo pida. Solo se limpia al cobrar o con "Vaciar carrito" (F9).
  test('el descuento no pasa a la venta siguiente si se sacaron todos los productos', async ({
    newContext,
  }) => {
    const page = await (await newContext()).newPage();
    await openSaleScreenReady(page, users.manager());
    await scan(page, SEED_SALES.chicle.barcode);
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(1);
    await page.keyboard.press('F8');
    const discount = page.getByRole('dialog', { name: 'Descuento' });
    await discount.getByLabel('Cuántos %').fill('10');
    await page.keyboard.press('Enter');
    await expect(discount).toBeHidden();
    await page.keyboard.press('Delete');
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(0);
    await scan(page, SEED_SALES.galletita.barcode);
    await expect(cartRow(page, SEED_SALES.galletita.name)).toHaveCount(1);
    await expect(page.locator('.totalbox__value')).toHaveText(money('$ 800'));
  });

  test('el encargado anula esa venta: el stock vuelve y los $4.500 salen de la caja abierta', async ({
    newContext,
  }) => {
    expect(mixedSaleId, 'depende del test anterior (la venta del ejemplo 2)').toBeGreaterThan(0);
    const page = await (await newContext()).newPage();
    await loginAs(page, users.manager());

    await page.goto('/ventas');
    await expect(page.getByRole('heading', { level: 1, name: 'Ventas' })).toBeVisible();
    await page.getByRole('link', { name: new RegExp(`#${mixedSaleId}\\b`) }).click();
    await page.getByRole('button', { name: 'Anular esta venta' }).click();

    const dialog = page.getByRole('dialog', { name: `Anular la venta #${mixedSaleId}` });
    await expect(dialog).toBeVisible();
    // Sin motivo no se anula (VEN-11).
    await dialog.getByRole('button', { name: 'Sí, anular la venta' }).click();
    await expect(dialog.getByText(/motivo/i).first()).toBeVisible();
    expect((await db().sale.findUniqueOrThrow({ where: { id: mixedSaleId } })).status).toBe(
      'COMPLETED',
    );

    await dialog.getByLabel('Motivo (obligatorio)').fill('El cliente se arrepintió');
    await dialog.getByRole('button', { name: 'Sí, anular la venta' }).press('Enter');
    await expect(page.getByText(/La venta se anuló y el stock volvió/)).toBeVisible();
    await expect(
      page.getByText(/Salieron\s\$\s4\.500 en efectivo de la caja abierta/),
    ).toBeVisible();
    await expect(page.getByText(/Devolvé por fuera: Crédito\s\$\s5\.000/)).toBeVisible();

    const sale = await db().sale.findUniqueOrThrow({ where: { id: mixedSaleId } });
    expect(sale.status).toBe('VOIDED');
    expect(sale.voidReason).toBe('El cliente se arrepintió');
    // El stock vuelve.
    expect(await stockOfBarcode(SEED_SALES.vino.barcode)).toBe('10.000');
    expect(await stockOfBarcode(SEED_SALES.fernet.barcode)).toBe('10.000');
    // La devolución en efectivo (solo la parte en efectivo) sale de la caja abierta.
    const refunds = await db().cashMovement.findMany({ where: { saleId: mixedSaleId } });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.direction).toBe('OUT');
    expect(refunds[0]?.reason).toBe('SALE_VOID_REFUND');
    expect(refunds[0]?.amount.toFixed(2)).toBe('4500.00');
    const open = await db().cashSession.findFirstOrThrow({ where: { status: 'OPEN' } });
    expect(refunds[0]?.cashSessionId).toBe(open.id);
    // Anular dos veces no se puede: el botón desaparece.
    await expect(page.getByRole('button', { name: 'Anular esta venta' })).toHaveCount(0);
  });

  test('el empleado no ve el descuento, ni el menú ni la lista de ventas (y la API se lo niega)', async ({
    page,
  }) => {
    await openSaleScreenReady(page, users.employee());
    await scan(page, SEED_SALES.chicle.barcode);
    await expect(cartRow(page, SEED_SALES.chicle.name)).toHaveCount(1);

    await page.keyboard.press('F8');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Descuento/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ventas', exact: true })).toHaveCount(0);

    // Entrar a mano a la lista tampoco muestra nada.
    await page.goto('/ventas');
    await expect(page.getByRole('heading', { level: 1, name: 'Ventas' })).toHaveCount(0);
    expect((await page.request.get('/api/sales')).status()).toBe(403);
    expect((await page.request.get(`/api/sales/${mixedSaleId}`)).status()).toBe(403);
  });

  test('doble Enter en "Cobrar" con el servidor lento crea una sola venta', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/sales') posts.push(r.url());
    });
    // El servidor tarda: el segundo Enter llega con el primer pedido todavía en el aire.
    await page.route('**/api/sales', async (route) => {
      if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 700));
      await route.continue();
    });
    await openSaleScreenReady(page, users.employee());
    await scan(page, SEED_SALES.turron.barcode);
    await expect(cartRow(page, SEED_SALES.turron.name)).toHaveCount(1);

    await page.keyboard.press('Control+Enter');
    await expect(page.getByRole('dialog', { name: 'Cobrar' })).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+Enter');

    await expect(page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await salesWithProduct(SEED_SALES.turron.barcode)).toHaveLength(1);
    expect(await stockOfBarcode(SEED_SALES.turron.barcode)).toBe('19.000');
  });

  test('doble Enter muy rápido (sin demora del servidor) tampoco duplica la venta', async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on('request', (r) => {
      if (r.method() === 'POST' && new URL(r.url()).pathname === '/api/sales') posts.push(r.url());
    });
    await openSaleScreenReady(page, users.employee());
    await scan(page, SEED_SALES.turron.barcode);
    await expect(cartRow(page, SEED_SALES.turron.name)).toHaveCount(1);
    await page.keyboard.press('Control+Enter');
    await expect(page.getByRole('dialog', { name: 'Cobrar' })).toBeVisible();
    // Los dos Enter salen en el mismo instante.
    await Promise.all([page.keyboard.press('Enter'), page.keyboard.press('Enter')]);

    await expect(page.getByRole('status').filter({ hasText: /Venta #\d+ cobrada/ })).toBeVisible();
    expect(posts).toHaveLength(1);
    expect(await salesWithProduct(SEED_SALES.turron.barcode)).toHaveLength(2);
    expect(await stockOfBarcode(SEED_SALES.turron.barcode)).toBe('18.000');
  });
});
