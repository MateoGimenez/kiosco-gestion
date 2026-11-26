// Etapa 5, huecos de QA: lo que purchases.int.test.ts no cubría (sin repetirlo).
// Listado y filtros de compras, anulación en paralelo, productos por kilo, pedido sugerido con casos
// borde, pagos en paralelo desde la caja, adjuntos en compras anuladas y lectura de adjuntos por rol.
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildTestApp, clientFor, LOCAL_HOST, testConfig } from './helpers';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { openCash, setupSalesWorld, stockOf, type SalesWorld } from './sales-helpers';

const prisma = createTestPrisma();
const uploadsDir = mkdtempSync(join(tmpdir(), 'kiosco-uploads-gaps-'));
let w: SalesWorld;
let app: ReturnType<typeof buildTestApp>;
let ac: ReturnType<typeof clientFor>;
let supplierId: number;

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
  const res = await w.client.post('/api/suppliers', { name: 'Distribuidora Sur' }, w.manager);
  expect(res.status).toBe(201);
  supplierId = res.body.id;
});
afterAll(async () => {
  rmSync(uploadsDir, { recursive: true, force: true });
  await prisma.$disconnect();
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
  documentNumber: randomUUID().slice(0, 12),
  documentDate: '2026-11-01',
  items,
  ...over,
});
const buy = (b: unknown, cookie = w.manager) => w.client.post('/api/purchases', b, cookie);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const upload = (path: string, cookie = w.manager) =>
  request(app)
    .post(path)
    .set('Host', LOCAL_HOST)
    .set('X-Kiosco', '1')
    .set('Origin', `http://${LOCAL_HOST}`)
    .set('Cookie', cookie)
    .attach('file', JPG, 'factura.jpg');

describe('listado de compras', () => {
  it('filtra por proveedor, fechas, número y estado; pagina; rechaza un rango al revés', async () => {
    const other = (await w.client.post('/api/suppliers', { name: 'Otro Proveedor' }, w.manager))
      .body.id as number;
    const a = await buy(
      body([unitLine(w.coke.id)], { documentNumber: 'A-001', documentDate: '2026-10-01' }),
    );
    const b = await buy(
      body([unitLine(w.coke.id)], { documentNumber: 'B-002', documentDate: '2026-11-01' }),
    );
    const c = await buy(
      body([unitLine(w.coke.id)], {
        supplierId: other,
        documentNumber: 'C-003',
        documentDate: '2026-11-15',
      }),
    );
    for (const r of [a, b, c]) expect(r.status).toBe(201);
    await w.client.post(`/api/purchases/${a.body.purchase.id}/void`, { reason: 'x' }, w.manager);

    const list = (qs: string) => w.client.get(`/api/purchases?${qs}`, w.manager);
    const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((i) => i.id);

    expect(ids(await list(''))).toEqual([
      c.body.purchase.id,
      b.body.purchase.id,
      a.body.purchase.id,
    ]);
    expect(ids(await list(`supplierId=${other}`))).toEqual([c.body.purchase.id]);
    expect(ids(await list('from=2026-11-01&to=2026-11-30')).sort()).toEqual(
      [b.body.purchase.id, c.body.purchase.id].sort(),
    );
    expect(ids(await list('documentNumber=A-001'))).toEqual([a.body.purchase.id]);
    expect(ids(await list('status=VOIDED'))).toEqual([a.body.purchase.id]);
    expect(ids(await list('status=CONFIRMED&sortOrder=asc'))).toEqual([
      b.body.purchase.id,
      c.body.purchase.id,
    ]);
    const page2 = await list('pageSize=2&page=2');
    expect(page2.body.total).toBe(3);
    expect(ids(page2)).toEqual([a.body.purchase.id]);

    const reversed = await list('from=2026-11-30&to=2026-11-01');
    expect(reversed.status).toBe(400);
    expect((await list('status=BORRADA')).status).toBe(400);
    expect((await list('pageSize=0')).status).toBe(400);
  });

  it('un empleado no puede listar ni ver una compra, y un id inexistente es 404', async () => {
    const created = await buy(body([unitLine(w.coke.id)]));
    expect((await w.client.get('/api/purchases', w.employee)).status).toBe(403);
    expect(
      (await w.client.get(`/api/purchases/${created.body.purchase.id}`, w.employee)).status,
    ).toBe(403);
    expect((await w.client.get('/api/purchases/99999', w.manager)).status).toBe(404);
    expect((await w.client.get('/api/purchases/abc', w.manager)).status).toBe(400);
  });
});

describe('anulación: casos borde', () => {
  it('un motivo vacío o solo con espacios es 400 y una compra inexistente es 404; no cambia nada', async () => {
    const created = await buy(body([unitLine(w.coke.id)]));
    const id = created.body.purchase.id;
    expect(
      (await w.client.post(`/api/purchases/${id}/void`, { reason: '   ' }, w.manager)).status,
    ).toBe(400);
    expect(
      (await w.client.post(`/api/purchases/${id}/void`, { reason: 'x'.repeat(201) }, w.manager))
        .status,
    ).toBe(400);
    expect(
      (await w.client.post('/api/purchases/99999/void', { reason: 'x' }, w.manager)).status,
    ).toBe(404);
    expect(await stockOf(prisma, w.coke.id)).toBe('11.000');
  });

  it('dos anulaciones a la vez: una gana y la otra recibe 409; el stock y la deuda vuelven una sola vez', async () => {
    const created = await buy(body([unitLine(w.coke.id, { quantity: '4', unitNetCost: '100' })]));
    const id = created.body.purchase.id;
    const results = await Promise.all(
      [1, 2].map((n) =>
        w.client.post(`/api/purchases/${id}/void`, { reason: `intento ${n}` }, w.manager),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body.error.code).toBe('PURCHASE_ALREADY_VOIDED');
    expect(await stockOf(prisma, w.coke.id)).toBe('1.000');
    const entries = await prisma.supplierAccountEntry.findMany({ where: { supplierId } });
    expect(entries.reduce((s, e) => s + Number(e.amount), 0)).toBe(0);
    expect(await prisma.stockMovement.count({ where: { type: 'PURCHASE_VOID' } })).toBe(1);
  });
});

describe('productos por kilo', () => {
  it('compra por bulto en kg con decimales: suma el stock exacto y la anulación lo devuelve', async () => {
    // 3 bultos de 2,5 kg a $ 4.000 el bulto: 7,5 kg a $ 1.600 el kilo.
    const res = await buy(
      body([
        {
          productId: w.cheese.id,
          quantityMode: 'PACK',
          packCount: '3',
          unitsPerPack: '2.5',
          packNetCost: '4000',
          vatRatePercent: '21',
        },
      ]),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.purchase.items[0]).toMatchObject({
      quantity: '7.500',
      unitNetCost: '1600.00',
      lineNetTotal: '12000.00',
    });
    expect(res.body.purchase.total).toBe('14520.00');
    expect(await stockOf(prisma, w.cheese.id)).toBe('12.500');
    const voided = await w.client.post(
      `/api/purchases/${res.body.purchase.id}/void`,
      { reason: 'x' },
      w.manager,
    );
    expect(voided.status).toBe(200);
    expect(await stockOf(prisma, w.cheese.id)).toBe('5.000');
  });

  it('un producto por unidad no acepta cantidades con decimales', async () => {
    const res = await buy(body([unitLine(w.coke.id, { quantity: '2.5' })]));
    expect(res.status).toBe(400);
    expect(await stockOf(prisma, w.coke.id)).toBe('1.000');
  });
});

describe('pedido sugerido: casos borde', () => {
  const sub = async () =>
    (await prisma.product.findUniqueOrThrow({ where: { id: w.coke.id } })).subcategoryId;
  const mk = async (name: string, data: Record<string, unknown>) =>
    prisma.product.create({
      data: {
        name,
        saleUnit: 'UNIT',
        salePrice: '100',
        subcategoryId: await sub(),
        defaultSupplierId: supplierId,
        ...data,
      },
    });

  it('deja afuera los productos inactivos y los de otro proveedor, incluye mínimo 0 con stock 0 (H-30); sin teléfono no hay link', async () => {
    const other = (await w.client.post('/api/suppliers', { name: 'Otro' }, w.manager)).body
      .id as number;
    await mk('Con mínimo', { stockQuantity: '1', minStock: '5' });
    await mk('Mínimo cero', { stockQuantity: '0', minStock: '0' });
    await mk('Inactivo', { stockQuantity: '0', minStock: '5', isActive: false });
    await mk('De otro', { stockQuantity: '0', minStock: '5', defaultSupplierId: other });
    const res = await w.client.get(`/api/suppliers/${supplierId}/suggested-order`, w.manager);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
      'Con mínimo',
      'Mínimo cero',
    ]);
    expect(res.body.items[0].suggestedQuantity).toBe('4.000');
    expect(res.body.items[1].suggestedQuantity).toBe('1.000'); // H-30 + H-08: mínimo 0 y stock 0 -> 1
    expect(res.body.whatsappUrl).toBeNull();
    expect(res.body.text).toContain('Con mínimo');
  });

  it('productos por kilo sugieren la diferencia con decimales; proveedor sin faltantes devuelve lista vacía', async () => {
    await mk('Jamón por kg', { saleUnit: 'KG', stockQuantity: '1.250', minStock: '4' });
    const res = await w.client.get(`/api/suppliers/${supplierId}/suggested-order`, w.manager);
    expect(res.body.items[0].suggestedQuantity).toBe('2.750');
    const empty = (await w.client.post('/api/suppliers', { name: 'Vacío' }, w.manager)).body.id;
    const none = await w.client.get(`/api/suppliers/${empty}/suggested-order`, w.manager);
    expect(none.status).toBe(200);
    expect(none.body.items).toEqual([]);
    expect((await w.client.get('/api/suppliers/99999/suggested-order', w.manager)).status).toBe(
      404,
    );
  });
});

describe('pagos en paralelo desde la caja', () => {
  it('dos pagos distintos con efectivo de la caja a la vez quedan los dos, con su salida y el saldo exacto', async () => {
    await openCash(w);
    await buy(body([unitLine(w.coke.id, { quantity: '10', unitNetCost: '1000' })])); // deuda $ 10.000
    const pay = (amount: string) =>
      w.client.post(
        `/api/suppliers/${supplierId}/payments`,
        { clientRequestId: randomUUID(), amount, source: 'CASH_REGISTER' },
        w.manager,
      );
    const [r1, r2] = await Promise.all([pay('1500'), pay('2500')]);
    expect([r1.status, r2.status]).toEqual([201, 201]);
    expect(await prisma.cashMovement.count({ where: { reason: 'SUPPLIER_PAYMENT' } })).toBe(2);
    const sup = await w.client.get(`/api/suppliers/${supplierId}`, w.manager);
    expect(sup.body.balance).toBe('6000.00');
  });
});

describe('adjuntos: casos borde', () => {
  it('a una compra anulada se le puede seguir subiendo un archivo (respaldo) y se ve en el detalle', async () => {
    const created = await buy(body([unitLine(w.coke.id)]));
    const id = created.body.purchase.id;
    await w.client.post(`/api/purchases/${id}/void`, { reason: 'x' }, w.manager);
    const up = await upload(`/api/purchases/${id}/attachments`);
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const detail = await ac.get(`/api/purchases/${id}`, w.manager);
    expect(detail.body.status).toBe('VOIDED');
    expect(detail.body.attachments).toHaveLength(1);
  });

  it('el empleado no puede leer un archivo adjunto (403) y sin sesión es 401', async () => {
    const created = await buy(body([unitLine(w.coke.id)]));
    const id = created.body.purchase.id;
    const up = await upload(`/api/purchases/${id}/attachments`);
    expect((await ac.get(up.body.url, w.employee)).status).toBe(403);
    expect((await ac.get(`${up.body.url}?download=true`, w.employee)).status).toBe(403);
    expect((await ac.get(up.body.url, '')).status).toBe(401);
  });
});
