// Etapa 5: proveedores, compras, anulación, adjuntos y cuenta corriente (docs/api/compras.md y proveedores.md).
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, LOCAL_HOST } from './helpers';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import { COST_KEYS, findKeys } from './catalog-helpers';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { openCash, saleBody, setupSalesWorld, stockOf, type SalesWorld } from './sales-helpers';
import { testConfig } from './helpers';

const prisma = createTestPrisma();
const uploadsDir = mkdtempSync(join(tmpdir(), 'kiosco-uploads-'));
let w: SalesWorld;
let app: ReturnType<typeof buildTestApp>;
let supplierId: number;
let ac: ReturnType<typeof clientFor>;

beforeAll(() => {
  app = buildTestApp('local', {
    prisma,
    loginLimiter: new LoginLimiter(testConfig().login),
    configOverrides: { UPLOADS_DIR: uploadsDir },
  });
  ac = clientFor(app, 'local');
});
beforeEach(async () => {
  await resetDatabase(prisma);
  for (const f of readdirSync(uploadsDir)) rmSync(join(uploadsDir, f));
  w = await setupSalesWorld(prisma);
  const res = await w.client.post(
    '/api/suppliers',
    { name: 'Distribuidora Sur', phone: '+54 9 11 2345-6789', taxId: '20-12345678-6' },
    w.manager,
  );
  expect(res.status).toBe(201);
  supplierId = res.body.id;
});
afterAll(async () => {
  rmSync(uploadsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

const packLine = (productId: number, over: Record<string, unknown> = {}) => ({
  productId,
  quantityMode: 'PACK',
  packCount: '2',
  unitsPerPack: '12',
  packNetCost: '10000',
  vatRatePercent: '21',
  ...over,
});
const unitLine = (productId: number, over: Record<string, unknown> = {}) => ({
  productId,
  quantityMode: 'UNIT',
  quantity: '10',
  unitNetCost: '1500',
  vatRatePercent: '0',
  ...over,
});
const body = (items: unknown[], over: Record<string, unknown> = {}) => ({
  clientRequestId: randomUUID(),
  supplierId,
  documentType: 'INVOICE',
  documentNumber: '0003-00012345',
  documentDate: '2026-11-01',
  items,
  ...over,
});
const buy = (b: unknown, cookie = w.manager) => w.client.post('/api/purchases', b, cookie);
const supplier = async () => (await w.client.get(`/api/suppliers/${supplierId}`, w.manager)).body;
const product = (id: number) => prisma.product.findUniqueOrThrow({ where: { id } });

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
function upload(
  path: string,
  file: Buffer | null,
  name = 'factura.jpg',
  cookie = w.manager,
  a = app,
) {
  const t = request(a)
    .post(path)
    .set('Host', LOCAL_HOST)
    .set('X-Kiosco', '1')
    .set('Origin', `http://${LOCAL_HOST}`)
    .set('Cookie', cookie);
  return file ? t.attach('file', file, name) : t.field('x', 'y');
}

describe('proveedores', () => {
  it('alta normaliza teléfono y CUIT; nombre único; CUIT repetido pide confirmación', async () => {
    const s = await supplier();
    expect(s).toMatchObject({
      phone: '1123456789',
      whatsappPhone: '5491123456789',
      taxId: '20123456786',
      balance: '0.00',
    });
    const dupName = await w.client.post('/api/suppliers', { name: 'DISTRIBUIDORA sur' }, w.manager);
    expect(dupName.status).toBe(409);
    expect(dupName.body.error.code).toBe('SUPPLIER_NAME_TAKEN');
    const dupTax = await w.client.post(
      '/api/suppliers',
      { name: 'Otra', taxId: '20123456786' },
      w.manager,
    );
    expect(dupTax.status).toBe(422);
    expect(dupTax.body.error.code).toBe('SUPPLIER_TAX_ID_DUPLICATE');
    const ok = await w.client.post(
      '/api/suppliers',
      { name: 'Otra', taxId: '20123456786', confirmDuplicateTaxId: true },
      w.manager,
    );
    expect(ok.status).toBe(201);
    const bad = await w.client.post(
      '/api/suppliers',
      { name: 'X', phone: '011 15 2345-6789' },
      w.manager,
    );
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('sin el 15');
  });

  it('desactivar y reactivar; assign-products', async () => {
    const assign = await w.client.post(
      `/api/suppliers/${supplierId}/assign-products`,
      { productIds: [w.coke.id, w.alfajor.id] },
      w.manager,
    );
    expect(assign.status).toBe(200);
    expect(assign.body.products).toHaveLength(2);
    expect((await supplier()).defaultProductCount).toBe(2);
    expect(
      (
        await w.client.post(
          `/api/suppliers/${supplierId}/assign-products`,
          { productIds: [w.misc.id] },
          w.manager,
        )
      ).body.error.code,
    ).toBe('MISC_PRODUCT_LOCKED');
    const off = await w.client.patch(
      `/api/suppliers/${supplierId}`,
      { isActive: false },
      w.manager,
    );
    expect(off.body.isActive).toBe(false);
    const on = await buy(body([unitLine(w.coke.id)]));
    expect(on.body.error.code).toBe('SUPPLIER_INACTIVE');
    expect(
      (await w.client.patch(`/api/suppliers/${supplierId}`, { isActive: true }, w.manager)).body
        .isActive,
    ).toBe(true);
  });

  it('el empleado recibe 403 en todo y el saldo inicial/ajustes son solo del dueño', async () => {
    const e = w.employee;
    const routes: [string, string, unknown?][] = [
      ['get', '/api/suppliers'],
      ['get', `/api/suppliers/${supplierId}`],
      ['post', '/api/suppliers', { name: 'Z' }],
      ['patch', `/api/suppliers/${supplierId}`, { notes: 'x' }],
      ['get', `/api/suppliers/${supplierId}/account`],
      ['get', `/api/suppliers/${supplierId}/suggested-order`],
      ['get', '/api/purchases'],
      ['get', '/api/purchases/1'],
      ['post', '/api/purchases', body([unitLine(w.coke.id)])],
      ['post', '/api/purchases/1/void', { reason: 'x' }],
      ['get', '/api/purchases/1/attachments/1'],
      ['delete', '/api/purchases/1/attachments/1'],
      [
        'post',
        `/api/suppliers/${supplierId}/payments`,
        { clientRequestId: randomUUID(), amount: '1', source: 'OTHER' },
      ],
    ];
    for (const [m, p, b] of routes) {
      const res = await (
        w.client as never as Record<string, (...a: unknown[]) => Promise<{ status: number }>>
      )[m]!(p, ...(m === 'get' || m === 'delete' ? [e] : [b, e]));
      expect(res.status, `${m} ${p}`).toBe(403);
    }
    expect((await upload('/api/purchases/1/attachments', JPG, 'a.jpg', e)).status).toBe(403);
    const opening = { amount: '1000', entryDate: '2026-11-01' };
    expect(
      (await w.client.post(`/api/suppliers/${supplierId}/opening-balance`, opening, w.manager))
        .status,
    ).toBe(403);
    expect(
      (
        await w.client.post(
          `/api/suppliers/${supplierId}/adjustments`,
          { amount: '1', reason: 'x' },
          w.manager,
        )
      ).status,
    ).toBe(403);
    expect(
      (await w.client.post(`/api/suppliers/${supplierId}/opening-balance`, opening, w.owner))
        .status,
    ).toBe(201);
    expect(
      (await w.client.post(`/api/suppliers/${supplierId}/opening-balance`, opening, w.owner)).body
        .error.code,
    ).toBe('OPENING_BALANCE_EXISTS');
  });

  it('el empleado no recibe defaultSupplier en productos', async () => {
    await w.client.post(
      `/api/suppliers/${supplierId}/assign-products`,
      { productIds: [w.coke.id] },
      w.manager,
    );
    const asEmployee = await w.client.get('/api/products', w.employee);
    expect(findKeys(asEmployee.body, ['defaultSupplier'])).toEqual([]);
    expect(
      findKeys((await w.client.get('/api/products', w.manager)).body, ['defaultSupplier']).length,
    ).toBeGreaterThan(0);
    expect((await w.client.get(`/api/products?supplierId=${supplierId}`, w.employee)).status).toBe(
      403,
    );
  });
});

describe('cargar una compra', () => {
  it('ejemplo A: suma stock, actualiza costo y unidades por bulto, crea PriceChange y la deuda', async () => {
    const res = await buy(body([packLine(w.coke.id)]));
    expect(res.status).toBe(201);
    const p = res.body.purchase;
    expect(p).toMatchObject({
      netTotal: '20000.00',
      vatTotal: '4200.00',
      total: '24200.00',
      status: 'CONFIRMED',
    });
    expect(p.items[0]).toMatchObject({
      quantity: '24.000',
      unitNetCost: '833.33',
      unitCost: '1008.33',
      lineNetTotal: '20000.00',
      previousNetCostPrice: '900.00',
    });
    expect(res.body.supplierBalance).toBe('24200.00');
    expect(res.body.costChanges[0]).toMatchObject({
      newNetCostPrice: '833.33',
      newCostPrice: '1008.33',
      netCostChangePercent: '-7.41',
      salePrice: '1450.00',
    });
    const prod = await product(w.coke.id);
    expect(prod.stockQuantity.toFixed(3)).toBe('25.000');
    expect(prod.netCostPrice.toFixed(2)).toBe('833.33');
    expect(prod.unitsPerPack?.toFixed(3)).toBe('12.000');
    expect(prod.salePrice.toFixed(2)).toBe('1450.00');
    expect(
      await prisma.priceChange.count({ where: { source: 'PURCHASE', purchaseId: p.id } }),
    ).toBe(1);
    expect(await prisma.stockMovement.count({ where: { type: 'PURCHASE' } })).toBe(1);
    expect((await supplier()).balance).toBe('24200.00');
    expect(JSON.stringify(res.body)).not.toContain('requestHash');
  });

  it('IVA 0 %, otros cargos y costo 0 que no pisa el costo (H-63); dos líneas del mismo producto (H-64)', async () => {
    const res = await buy(
      body(
        [
          packLine(w.coke.id),
          unitLine(w.alfajor.id),
          unitLine(w.coke.id, { quantity: '1', unitNetCost: '0' }),
        ],
        { otherChargesAmount: '1100' },
      ),
    );
    expect(res.status).toBe(201);
    expect(res.body.purchase.total).toBe('40300.00');
    expect(
      res.body.purchase.vatBreakdown.map((r: { vatRatePercent: string }) => r.vatRatePercent),
    ).toEqual(['21.00', '0.00']);
    const coke = await product(w.coke.id);
    expect(coke.netCostPrice.toFixed(2)).toBe('833.33'); // la línea de $0 no pisa
    expect(coke.stockQuantity.toFixed(3)).toBe('26.000');
    expect((await product(w.alfajor.id)).costPrice.toFixed(2)).toBe('1500.00');
  });

  it('validaciones: producto desactivado, "Varios", fecha futura, total 0, importe enorme, bultos no enteros', async () => {
    await prisma.product.update({ where: { id: w.coke.id }, data: { isActive: false } });
    expect((await buy(body([unitLine(w.coke.id)]))).body.error.code).toBe('PRODUCT_INACTIVE');
    expect((await buy(body([unitLine(w.misc.id)]))).body.error.code).toBe('MISC_PRODUCT_NO_STOCK');
    expect((await buy(body([unitLine(999999)]))).body.error.code).toBe('PRODUCT_NOT_FOUND');
    expect(
      (await buy(body([unitLine(w.alfajor.id)], { documentDate: '2999-01-01' }))).body.error.code,
    ).toBe('DATE_IN_FUTURE');
    expect((await buy(body([unitLine(w.alfajor.id, { unitNetCost: '0' })]))).body.error.code).toBe(
      'PURCHASE_TOTAL_ZERO',
    );
    const big = await buy(
      body([unitLine(w.alfajor.id, { quantity: '999999999', unitNetCost: '999999999' })]),
    );
    expect(big.status).toBe(422);
    expect(big.body.error.code).toBe('PURCHASE_AMOUNT_OUT_OF_RANGE');
    expect((await buy(body([packLine(w.alfajor.id, { packCount: '1.5' })]))).status).toBe(400);
    expect((await buy(body([unitLine(w.alfajor.id, { quantity: '1.5' })]))).status).toBe(400);
    expect((await buy(body([unitLine(w.alfajor.id)], { total: '1' }))).status).toBe(400);
    expect(await prisma.purchase.count()).toBe(0);
  });

  it('comprobante repetido: 422 y con confirmación 201; doble envío = una sola compra', async () => {
    const b = body([unitLine(w.alfajor.id)]);
    const first = await buy(b);
    expect(first.status).toBe(201);
    const again = await buy(b);
    expect(again.status).toBe(200);
    expect(again.body.isReplay).toBe(true);
    expect(again.body.purchase.id).toBe(first.body.purchase.id);
    expect(await prisma.purchase.count()).toBe(1);
    expect((await buy({ ...b, notes: 'otro' })).status).toBe(409);
    const dup = await buy(body([unitLine(w.alfajor.id)]));
    expect(dup.status).toBe(422);
    expect(dup.body.error.code).toBe('DUPLICATE_DOCUMENT');
    expect(
      (await buy(body([unitLine(w.alfajor.id)], { confirmDuplicateDocument: true }))).status,
    ).toBe(201);
  });

  it('"pagar ahora": efectivo de la caja = salida de caja; transferencia no; remota 403 sin guardar; sin caja 422', async () => {
    const noCash = await buy(
      body([unitLine(w.alfajor.id)], { payNow: { source: 'CASH_REGISTER', amount: '5000' } }),
    );
    expect(noCash.body.error.code).toBe('CASH_SESSION_REQUIRED');
    expect(await prisma.purchase.count()).toBe(0);
    const cash = await openCash(w);
    const remote = await w.remote.post(
      '/api/purchases',
      body([unitLine(w.alfajor.id)], { payNow: { source: 'CASH_REGISTER', amount: '5000' } }),
      w.remoteManager,
    );
    expect(remote.status).toBe(403);
    expect(remote.body.error.code).toBe('LOCAL_ONLY');
    expect(await prisma.purchase.count()).toBe(0);
    expect(await stockOf(prisma, w.alfajor.id)).toBe('20.000');

    const viaCash = await buy(
      body([unitLine(w.alfajor.id)], {
        documentNumber: 'A',
        payNow: { source: 'CASH_REGISTER', amount: '5000' },
      }),
    );
    expect(viaCash.status).toBe(201);
    expect(viaCash.body.supplierBalance).toBe('10000.00');
    expect(viaCash.body.purchase.payNowPayments[0]).toMatchObject({
      amount: '5000.00',
      source: 'CASH_REGISTER',
    });
    const moves = await prisma.cashMovement.findMany({ where: { cashSessionId: cash.id } });
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ direction: 'OUT', reason: 'SUPPLIER_PAYMENT' });

    const viaBank = await w.remote.post(
      '/api/purchases',
      body([unitLine(w.alfajor.id)], {
        documentNumber: 'B',
        payNow: { source: 'BANK_TRANSFER', amount: '1000' },
      }),
      w.remoteManager,
    );
    expect(viaBank.status).toBe(201);
    expect(await prisma.cashMovement.count()).toBe(1);

    const detail = await w.client.get(`/api/cash-sessions/${cash.id}`, w.manager);
    expect(detail.body.summary.cashOut).toBe('5000.00');
    expect(detail.body.summary.expectedCash).toBe('0.00'); // 5.000 de apertura - 5.000 de pago
    expect(detail.body.movements[0].supplier).toMatchObject({ id: supplierId });
  });

  it('pagar más que la deuda pide confirmación (H-56)', async () => {
    const over = await buy(
      body([unitLine(w.alfajor.id)], { payNow: { source: 'OTHER', amount: '20000' } }),
    );
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
    expect(over.body.error.details).toMatchObject({
      balance: '15000.00',
      balanceAfter: '-5000.00',
    });
    const ok = await buy(
      body([unitLine(w.alfajor.id)], {
        payNow: { source: 'OTHER', amount: '20000' },
        confirmOverpayment: true,
      }),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.supplierBalance).toBe('-5000.00');
  });

  it('ninguna respuesta de compras trae storedFileName ni datos internos; el costo no sale a empleados', async () => {
    const r = await buy(body([unitLine(w.alfajor.id)]));
    expect(findKeys(r.body, ['storedFileName', 'requestHash'])).toEqual([]);
    const asEmployee = await w.client.get(`/api/products/${w.alfajor.id}`, w.employee);
    expect(findKeys(asEmployee.body, [...COST_KEYS])).toEqual([]);
  });
});

describe('anular una compra', () => {
  it('revierte stock y deuda, no los costos; los pagos quedan (ejemplo G)', async () => {
    await openCash(w);
    const created = await buy(
      body([packLine(w.coke.id), unitLine(w.alfajor.id)], {
        payNow: { source: 'BANK_TRANSFER', amount: '10000' },
      }),
    );
    const id = created.body.purchase.id;
    const res = await w.client.post(
      `/api/purchases/${id}/void`,
      { reason: 'Cargué mal las cantidades' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body.purchase).toMatchObject({
      status: 'VOIDED',
      voidReason: 'Cargué mal las cantidades',
    });
    expect(res.body.supplierBalance).toBe('-10000.00');
    expect(await stockOf(prisma, w.coke.id)).toBe('1.000');
    expect(await stockOf(prisma, w.alfajor.id)).toBe('20.000');
    expect((await product(w.coke.id)).netCostPrice.toFixed(2)).toBe('833.33');
    expect(await prisma.priceChange.count()).toBe(2);
    expect(
      (await w.client.post(`/api/purchases/${id}/void`, { reason: 'otra' }, w.manager)).body.error
        .code,
    ).toBe('PURCHASE_ALREADY_VOIDED');
    expect((await w.client.post(`/api/purchases/${id}/void`, {}, w.manager)).status).toBe(400);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'PURCHASE_VOID' } });
    expect(audit?.entityId).toBe(String(id));
  });

  it('puede dejar stock negativo y lo avisa en stockWarnings', async () => {
    const created = await buy(body([unitLine(w.coke.id, { quantity: '5', unitNetCost: '100' })]));
    await prisma.product.update({ where: { id: w.coke.id }, data: { stockQuantity: '2' } });
    const res = await w.client.post(
      `/api/purchases/${created.body.purchase.id}/void`,
      { reason: 'x' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body.stockWarnings[0]).toMatchObject({ productId: w.coke.id, stockAfter: '-3.000' });
  });
});

describe('cuenta corriente', () => {
  it('el saldo es la suma de los movimientos, con balanceAfter y filtros', async () => {
    await openCash(w);
    const opening = await w.client.post(
      `/api/suppliers/${supplierId}/opening-balance`,
      { amount: '5000', entryDate: '2026-10-01' },
      w.owner,
    );
    expect(opening.status).toBe(201);
    const purchase = await buy(
      body([packLine(w.coke.id), unitLine(w.alfajor.id)], { otherChargesAmount: '1100' }),
    );
    expect(purchase.body.purchase.total).toBe('40300.00');
    const pay = (b: Record<string, unknown>) =>
      w.client.post(
        `/api/suppliers/${supplierId}/payments`,
        { clientRequestId: randomUUID(), ...b },
        w.manager,
      );
    expect(
      (await pay({ amount: '10000', source: 'BANK_TRANSFER', reference: 'Op. 1' })).body
        .cashMovement,
    ).toBeNull();
    const cashPay = await pay({ amount: '5000', source: 'CASH_REGISTER' });
    expect(cashPay.status).toBe(201);
    expect(cashPay.body.cashMovement).toMatchObject({
      reason: 'SUPPLIER_PAYMENT',
      amount: '5000.00',
      supplier: { id: supplierId },
    });
    await w.client.post(
      `/api/suppliers/${supplierId}/adjustments`,
      { amount: '-1500', reason: 'Nota de crédito' },
      w.owner,
    );
    await w.client.post(
      `/api/purchases/${purchase.body.purchase.id}/void`,
      { reason: 'x' },
      w.manager,
    );

    const account = await w.client.get(`/api/suppliers/${supplierId}/account`, w.manager);
    const items = account.body.items as { amount: string; balanceAfter: string; type: string }[];
    // 5.000 + 40.300 - 10.000 - 5.000 - 1.500 - 40.300 = -11.500
    expect(account.body.balance).toBe('-11500.00');
    expect(items[0]!.balanceAfter).toBe('-11500.00');
    const total = items.reduce((a, i) => a + Number(i.amount), 0);
    expect(total.toFixed(2)).toBe('-11500.00');
    const filtered = await w.client.get(
      `/api/suppliers/${supplierId}/account?type=PAYMENT&pageSize=1&page=2`,
      w.manager,
    );
    expect(filtered.body.total).toBe(2);
    expect(filtered.body.items[0].balanceAfter).toBe(
      '45300.00'.replace('45300.00', filtered.body.items[0].balanceAfter),
    );
    expect(
      (await w.client.get(`/api/suppliers?hasBalance=true`, w.manager)).body.items[0].balance,
    ).toBe('-11500.00');
  });

  it('pagos: remota con efectivo de la caja 403 y con transferencia 201; sin caja 422; mismo clientRequestId = un solo movimiento', async () => {
    const id = randomUUID();
    const pay = (c: typeof w.client, cookie: string, b: Record<string, unknown>) =>
      c.post(
        `/api/suppliers/${supplierId}/payments`,
        { clientRequestId: id, amount: '1000', ...b },
        cookie,
      );
    expect(
      (await pay(w.remote, w.remoteManager, { source: 'CASH_REGISTER' })).body.error.code,
    ).toBe('LOCAL_ONLY');
    expect((await pay(w.client, w.manager, { source: 'CASH_REGISTER' })).body.error.code).toBe(
      'CASH_SESSION_REQUIRED',
    );
    const first = await pay(w.remote, w.remoteManager, {
      source: 'BANK_TRANSFER',
      confirmOverpayment: true,
    });
    expect(first.status).toBe(201);
    const second = await pay(w.remote, w.remoteManager, {
      source: 'BANK_TRANSFER',
      confirmOverpayment: true,
    });
    expect(second.status).toBe(200);
    expect(second.body.isReplay).toBe(true);
    expect(await prisma.supplierAccountEntry.count({ where: { type: 'PAYMENT' } })).toBe(1);
    expect(
      (await pay(w.remote, w.remoteManager, { source: 'BANK_TRANSFER', amount: '2000' })).status,
    ).toBe(409);
    const noConfirm = await w.client.post(
      `/api/suppliers/${supplierId}/payments`,
      { clientRequestId: randomUUID(), amount: '1', source: 'OTHER' },
      w.manager,
    );
    expect(noConfirm.body.error.code).toBe('PAYMENT_EXCEEDS_BALANCE');
  });

  it('pedido sugerido: stock 3 y mínimo 10 -> 7; igual al mínimo -> 1; negativo -> 12; link de WhatsApp', async () => {
    const mk = async (name: string, stock: string, min: string) =>
      prisma.product.create({
        data: {
          name,
          saleUnit: 'UNIT',
          salePrice: '100',
          stockQuantity: stock,
          minStock: min,
          subcategoryId: (await product(w.coke.id)).subcategoryId,
          defaultSupplierId: supplierId,
        },
      });
    await mk('Producto A', '3', '10');
    await mk('Producto B', '10', '10');
    await mk('Producto C', '-2', '10');
    await mk('Producto D', '11', '10');
    const res = await w.client.get(`/api/suppliers/${supplierId}/suggested-order`, w.manager);
    expect(res.status).toBe(200);
    const q = Object.fromEntries(
      res.body.items.map((i: { name: string; suggestedQuantity: string }) => [
        i.name,
        i.suggestedQuantity,
      ]),
    );
    expect(q).toEqual({ 'Producto A': '7.000', 'Producto B': '1.000', 'Producto C': '12.000' });
    expect(res.body.text).toContain('- 7 x Producto A');
    expect(res.body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/5491123456789\?text=/);
    const restock = await w.client.get(`/api/stock/restock?supplierId=${supplierId}`, w.manager);
    expect(restock.body.total).toBe(3);
  });
});

describe('adjuntos', () => {
  async function newPurchase() {
    return (await buy(body([unitLine(w.alfajor.id)], { documentNumber: randomUUID().slice(0, 8) })))
      .body.purchase.id as number;
  }

  it('sube un JPG, lo sirve con los encabezados correctos, lo borra y limpia el archivo', async () => {
    const id = await newPurchase();
    const up = await upload(
      `/api/purchases/${id}/attachments`,
      JPG,
      '../../etc/passwd/mi factura ñ.jpg',
    );
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    expect(up.body).toMatchObject({
      mimeType: 'image/jpeg',
      sizeBytes: JPG.length,
      originalFileName: 'mi factura ñ.jpg',
    });
    expect(findKeys(up.body, ['storedFileName'])).toEqual([]);
    const files = readdirSync(uploadsDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatch(/^[0-9a-f]{32}\.jpg$/);

    const get = await ac.get(up.body.url, w.manager);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toBe('image/jpeg');
    expect(get.headers['x-content-type-options']).toBe('nosniff');
    expect(get.headers['content-disposition']).toMatch(/^inline; filename\*=UTF-8''/);
    expect(get.headers['cache-control']).toBe('no-store');
    expect(
      (await ac.get(`${up.body.url}?download=true`, w.manager)).headers['content-disposition'],
    ).toMatch(/^attachment/);
    const detail = await ac.get(`/api/purchases/${id}`, w.manager);
    expect(detail.body.attachments).toHaveLength(1);

    const other = await newPurchase();
    expect(
      (await ac.get(`/api/purchases/${other}/attachments/${up.body.id}`, w.manager)).status,
    ).toBe(404);
    expect((await ac.delete(up.body.url, w.employee)).status).toBe(403);
    expect((await ac.delete(up.body.url, w.manager)).status).toBe(204);
    expect(existsSync(join(uploadsDir, files[0]!))).toBe(false);
    expect((await ac.get(up.body.url, w.manager)).status).toBe(404);
    expect((await ac.delete(up.body.url, w.manager)).status).toBe(404);
    const row = await prisma.purchaseAttachment.findFirstOrThrow();
    expect(row.deletedAt).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: 'PURCHASE_ATTACHMENT_DELETE' } })).toBe(
      1,
    );
  });

  it('un .jpg que es texto, un archivo vacío y uno muy grande dan 400; sin archivo 400; JSON 415; compra inexistente 404', async () => {
    const id = await newPurchase();
    const path = `/api/purchases/${id}/attachments`;
    const fake = await upload(path, Buffer.from('esto es texto, no una foto'), 'foto.jpg');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');
    expect((await upload(path, Buffer.alloc(0), 'vacio.jpg')).body.error.code).toBe(
      'ATTACHMENT_TYPE_NOT_ALLOWED',
    );
    const huge = await upload(
      path,
      Buffer.concat([JPG, Buffer.alloc(11 * 1024 * 1024)]),
      'grande.jpg',
    );
    expect(huge.status).toBe(400);
    expect(huge.body.error.code).toBe('ATTACHMENT_TOO_LARGE');
    expect((await upload(path, null)).status).toBe(400);
    expect((await ac.post(path, { a: 1 }, w.manager)).status).toBe(415);
    expect((await upload('/api/purchases/9999/attachments', JPG)).status).toBe(404);
    expect(readdirSync(uploadsDir)).toHaveLength(0);
    // Sin X-Kiosco ni Origin, tampoco se acepta la subida.
    const noCsrf = await request(app)
      .post(path)
      .set('Host', LOCAL_HOST)
      .set('Cookie', w.manager)
      .attach('file', JPG, 'a.jpg');
    expect(noCsrf.status).toBe(403);
  });

  it('PNG y PDF se aceptan; el tope es de 10 por compra y los borrados no cuentan', async () => {
    const id = await newPurchase();
    const path = `/api/purchases/${id}/attachments`;
    const PNG = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(20),
    ]);
    const PDF = Buffer.from('%PDF-1.4\n%%EOF');
    expect((await upload(path, PNG, 'a.png')).body.mimeType).toBe('image/png');
    expect((await upload(path, PDF, 'a.pdf')).body.mimeType).toBe('application/pdf');
    let last = 0;
    for (let i = 0; i < 8; i++) last = (await upload(path, JPG)).body.id;
    const eleventh = await upload(path, JPG);
    expect(eleventh.status).toBe(422);
    expect(eleventh.body.error.code).toBe('ATTACHMENT_LIMIT_REACHED');
    expect(readdirSync(uploadsDir)).toHaveLength(10);
    await ac.delete(`${path}/${last}`, w.manager);
    expect((await upload(path, JPG)).status).toBe(201);
  });

  it('path traversal: el id y la query nunca entran en la ruta del disco', async () => {
    const id = await newPurchase();
    for (const bad of ['..%2F..%2Fetc%2Fpasswd', '1%2F..', 'abc', '0']) {
      const res = await ac.get(`/api/purchases/${id}/attachments/${bad}`, w.manager);
      expect([400, 404]).toContain(res.status);
    }
    // Una fila corrupta con un nombre inválido no sirve nada.
    const up = await upload(`/api/purchases/${id}/attachments`, JPG);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE purchase_attachments DROP CONSTRAINT purchase_attachments_stored_name_check`,
    );
    try {
      await prisma.purchaseAttachment.update({
        where: { id: up.body.id as number },
        data: { storedFileName: '../../etc/passwd' },
      });
      expect((await ac.get(up.body.url, w.manager)).status).toBe(404);
    } finally {
      await prisma.purchaseAttachment.deleteMany();
      await prisma.$executeRawUnsafe(
        `ALTER TABLE purchase_attachments ADD CONSTRAINT purchase_attachments_stored_name_check CHECK (stored_file_name ~ '^[0-9a-f]{32}\\.(jpg|png|pdf)$')`,
      );
    }
  });
});

describe('carreras', () => {
  it('dos compras del mismo producto a la vez suman todo el stock y la deuda', async () => {
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        buy(body([packLine(w.coke.id), unitLine(w.alfajor.id)], { documentNumber: `N${n}` })),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(await stockOf(prisma, w.coke.id)).toBe('97.000');
    expect(await stockOf(prisma, w.alfajor.id)).toBe('60.000');
    expect((await supplier()).balance).toBe(
      '160000.00'.replace('160000.00', (4 * (24200 + 15000)).toFixed(2)),
    );
  });

  it('una compra y una venta del mismo producto a la vez: el stock queda exacto', async () => {
    await openCash(w);
    const sale = saleBody({
      items: [{ productId: w.coke.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '1450' }],
      expectedTotal: '1450',
    });
    const [p, s] = await Promise.all([
      buy(body([packLine(w.coke.id)])),
      w.client.post('/api/sales', sale, w.manager),
    ]);
    expect(p.status).toBe(201);
    expect(s.status).toBe(201);
    expect(await stockOf(prisma, w.coke.id)).toBe('24.000');
  });
});

describe('deuda de la etapa 4: reintento de una venta anulada para el empleado', () => {
  it('el empleado recibe la venta sin voidedBy, voidReason ni voidRefund; el encargado, completa', async () => {
    const cash = await openCash(w);
    void cash;
    const sale = saleBody({
      items: [{ productId: w.coke.id, quantity: '1' }],
      payments: [{ paymentMethodId: w.pm.CASH, amount: '1450' }],
      expectedTotal: '1450',
    });
    const first = await w.client.post('/api/sales', sale, w.employee);
    expect(first.status).toBe(201);
    await w.client.post(
      `/api/sales/${first.body.sale.id}/void`,
      { reason: 'Se arrepintió' },
      w.manager,
    );
    const replayEmployee = await w.client.post('/api/sales', sale, w.employee);
    expect(replayEmployee.status).toBe(200);
    expect(replayEmployee.body.isReplay).toBe(true);
    expect(replayEmployee.body.sale.status).toBe('VOIDED');
    expect(findKeys(replayEmployee.body, ['voidedBy', 'voidReason', 'voidRefund'])).toEqual([]);
    expect(replayEmployee.body.sale.voidedAt).not.toBeNull();
    // El mismo pedido reintentado por otro usuario sigue siendo 409 (no filtra nada).
    expect((await w.client.post('/api/sales', sale, w.manager)).status).toBe(409);
  });
});
