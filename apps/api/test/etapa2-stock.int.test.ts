// Etapa 2: stock (docs/api/productos-stock.md, sección 8): ajustes, historial, "Para reponer" y negativos.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedCatalog, seedProduct, setupWorld, type World } from './etapa2-helpers';

const prisma = createTestPrisma();
let w: World;
let cat: Awaited<ReturnType<typeof seedCatalog>>;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupWorld(prisma);
  cat = await seedCatalog(prisma);
});
afterAll(() => prisma.$disconnect());

const audits = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });
const adjust = (id: number, body: unknown, cookie = w.manager) =>
  w.client.post(`/api/products/${id}/stock-adjustments`, body, cookie);
const stockOf = async (id: number) =>
  (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity.toFixed(3);

describe('ajustes de stock (STK-04, STK-05, H-28, H-29)', () => {
  it('rotura: resta, deja stockAfter correcto, movimiento + auditoría (ejemplo del contrato)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '24', minStock: '6' });
    const res = await adjust(p.id, {
      reason: 'BREAKAGE',
      quantity: '-2',
      note: 'Se cayeron del exhibidor',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      movement: {
        productId: p.id,
        type: 'ADJUSTMENT',
        quantity: '-2.000',
        stockAfter: '22.000',
        adjustmentReason: 'BREAKAGE',
        note: 'Se cayeron del exhibidor',
        user: { id: w.managerId, fullName: 'Usuario encargado' },
        saleId: null,
        purchaseId: null,
      },
      product: { id: p.id, stockQuantity: '22.000', minStock: '6.000', needsRestock: false },
    });
    expect(await stockOf(p.id)).toBe('22.000');
    const [log] = await audits('STOCK_ADJUST');
    expect(log).toMatchObject({
      userId: w.managerId,
      entityType: 'Product',
      entityId: String(p.id),
    });
    expect(log?.details).toEqual({
      movementId: res.body.movement.id,
      reason: 'BREAKAGE',
      quantity: '-2.000',
      stockBefore: '24.000',
      stockAfter: '22.000',
      note: 'Se cayeron del exhibidor',
    });
  });

  it('el costo del movimiento (unitNetCost) lo ve solo el dueño', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '10' });
    const mgr = await adjust(p.id, { reason: 'BREAKAGE', quantity: '-1' }, w.manager);
    expect(mgr.body.movement).not.toHaveProperty('unitNetCost');
    const own = await adjust(p.id, { reason: 'BREAKAGE', quantity: '-1' }, w.owner);
    expect(own.body.movement.unitNetCost).toBe('1000.00');
  });

  it('el stock puede quedar negativo (R2): no es un error', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '1' });
    const res = await adjust(p.id, { reason: 'MISSING', quantity: '-3' });
    expect(res.status).toBe(201);
    expect(res.body.movement.stockAfter).toBe('-2.000');
    expect(res.body.product).toMatchObject({ stockQuantity: '-2.000', needsRestock: true });
  });

  it('signos por motivo (H-29): rotura, faltante y consumo propio restan; carga inicial suma; otro, cualquiera', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '10' });
    for (const reason of ['BREAKAGE', 'MISSING', 'OWN_CONSUMPTION']) {
      const bad = await adjust(p.id, { reason, quantity: '2' });
      expect(bad.status, reason).toBe(400);
      expect(bad.body.error.details.fields[0].path).toBe('quantity');
      expect((await adjust(p.id, { reason, quantity: '-1' })).status, reason).toBe(201);
    }
    const initial = await adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '-5' });
    expect(initial.status).toBe(400);
    expect((await adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '5' })).status).toBe(201);
    expect(
      (await adjust(p.id, { reason: 'OTHER', quantity: '4', note: 'Regalo de proveedor' })).status,
    ).toBe(201);
    expect((await adjust(p.id, { reason: 'OTHER', quantity: '-4', note: 'Muestra' })).status).toBe(
      201,
    );
    expect(await stockOf(p.id)).toBe('12.000'); // 10 - 3 + 5 + 4 - 4
  });

  it('motivo "otro" sin nota: 400 con path note', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    for (const body of [
      { reason: 'OTHER', quantity: '1' },
      { reason: 'OTHER', quantity: '1', note: '   ' },
      { reason: 'OTHER', quantity: '1', note: null },
    ]) {
      const res = await adjust(p.id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error.details.fields.some((f: { path: string }) => f.path === 'note')).toBe(
        true,
      );
    }
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('conteo (H-28): stock 22 y contado 19 -> movimiento -3 y stockAfter 19', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '22' });
    const res = await adjust(p.id, { reason: 'COUNT_CORRECTION', countedQuantity: '19' });
    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({
      quantity: '-3.000',
      stockAfter: '19.000',
      adjustmentReason: 'COUNT_CORRECTION',
    });
    expect(await stockOf(p.id)).toBe('19.000');
    expect((await audits('STOCK_ADJUST'))[0]?.details).toMatchObject({
      countedQuantity: '19.000',
      stockBefore: '22.000',
    });
    // Contar de más suma.
    const up = await adjust(p.id, { reason: 'COUNT_CORRECTION', countedQuantity: '25.000' });
    expect(up.body.movement).toMatchObject({ quantity: '6.000', stockAfter: '25.000' });
  });

  it('conteo desde un stock negativo: el resultado es lo contado (nunca negativo)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '-4' });
    const res = await adjust(p.id, { reason: 'COUNT_CORRECTION', countedQuantity: '0' });
    expect(res.status).toBe(201);
    expect(res.body.movement).toMatchObject({ quantity: '4.000', stockAfter: '0.000' });
  });

  it('conteo igual al stock: 422 STOCK_COUNT_UNCHANGED y no se guarda nada', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '12' });
    const res = await adjust(p.id, { reason: 'COUNT_CORRECTION', countedQuantity: '12' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'STOCK_COUNT_UNCHANGED',
      details: { stockQuantity: '12.000' },
    });
    expect(await prisma.stockMovement.count()).toBe(0);
    expect(await audits('STOCK_ADJUST')).toHaveLength(0);
  });

  it('quantity en un conteo o countedQuantity en otro motivo: 400 (campo desconocido); conteo negativo: 400', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '12' });
    for (const body of [
      { reason: 'COUNT_CORRECTION', quantity: '-1' },
      { reason: 'COUNT_CORRECTION', countedQuantity: '1', quantity: '1' },
      { reason: 'COUNT_CORRECTION' },
      { reason: 'COUNT_CORRECTION', countedQuantity: '-1' },
      { reason: 'BREAKAGE', countedQuantity: '3' },
      { reason: 'BREAKAGE' },
      { quantity: '-1' },
      { reason: 'INVENTADO', quantity: '-1' },
      { reason: 'BREAKAGE', quantity: '0' },
      { reason: 'BREAKAGE', quantity: '-0.000' },
      { reason: 'BREAKAGE', quantity: -1 },
      { reason: 'BREAKAGE', quantity: '-1', note: 'x'.repeat(501) },
      { reason: 'BREAKAGE', quantity: '-1', userId: 1 },
    ]) {
      expect((await adjust(p.id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(await stockOf(p.id)).toBe('12.000');
  });

  it('producto por unidad: cantidades decimales dan 400; por peso se aceptan 3 decimales', async () => {
    const unit = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '10' });
    const bad = await adjust(unit.id, { reason: 'BREAKAGE', quantity: '-1.5' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details.fields[0]).toMatchObject({
      path: 'quantity',
      message: 'Este producto se vende por unidad: usá números enteros.',
    });
    expect(
      (await adjust(unit.id, { reason: 'COUNT_CORRECTION', countedQuantity: '3.5' })).body.error
        .details.fields[0].path,
    ).toBe('countedQuantity');
    expect((await adjust(unit.id, { reason: 'BREAKAGE', quantity: '-2.000' })).status).toBe(201);

    const kg = await seedProduct(prisma, cat.subcategory.id, {
      name: 'Queso',
      saleUnit: 'KG',
      stockQuantity: '5',
    });
    const ok = await adjust(kg.id, { reason: 'BREAKAGE', quantity: '-0.350' });
    expect(ok.status).toBe(201);
    expect(ok.body.movement.stockAfter).toBe('4.650');
    expect((await adjust(kg.id, { reason: 'BREAKAGE', quantity: '-0.3501' })).status).toBe(400);
  });

  it('H-31: se ajusta un producto desactivado y la auditoría lo anota; si queda negativo, aparece en "stock negativo"', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, {
      stockQuantity: '1',
      isActive: false,
    });
    const res = await adjust(p.id, { reason: 'MISSING', quantity: '-3' });
    expect(res.status).toBe(201);
    expect((await audits('STOCK_ADJUST'))[0]?.details).toMatchObject({ isActive: false });
    const neg = await w.client.get('/api/stock/negative', w.manager);
    expect(neg.body.items).toEqual([
      expect.objectContaining({ id: p.id, stockQuantity: '-2.000', isActive: false }),
    ]);
    // Y no está en "para reponer" (solo activos).
    expect((await w.client.get('/api/stock/restock', w.manager)).body.total).toBe(0);
  });

  it('empleado: 403; producto inexistente: 404; id inválido: 400; carga inicial sobre un producto', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    expect((await adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '1' }, w.employee)).status).toBe(
      403,
    );
    expect((await adjust(999, { reason: 'INITIAL_LOAD', quantity: '1' })).status).toBe(404);
    expect(
      (await adjust('x' as unknown as number, { reason: 'INITIAL_LOAD', quantity: '1' })).status,
    ).toBe(400);
    expect((await adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '12' }, w.owner)).status).toBe(
      201,
    );
  });

  it('un resultado que no entra en la columna da 422 y no deja nada a medias', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '999999999' });
    const res = await adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '999999999' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('STOCK_OUT_OF_RANGE');
    expect(await stockOf(p.id)).toBe('999999999.000');
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('CARRERA: 12 ajustes simultáneos de -1 sobre stock 20: ninguno pisa a otro y cada stockAfter es distinto', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '20' });
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        adjust(
          p.id,
          { reason: 'BREAKAGE', quantity: '-1', note: `n${i}` },
          i % 2 ? w.owner : w.manager,
        ),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(12).fill(201));
    expect(await stockOf(p.id)).toBe('8.000');
    const movements = await prisma.stockMovement.findMany({
      where: { productId: p.id },
      orderBy: { id: 'asc' },
    });
    expect(movements).toHaveLength(12);
    // Cada movimiento deja el stock un paso más abajo que el anterior (sin repetidos ni saltos).
    expect(movements.map((m) => m.stockAfter.toFixed(0))).toEqual([
      '19',
      '18',
      '17',
      '16',
      '15',
      '14',
      '13',
      '12',
      '11',
      '10',
      '9',
      '8',
    ]);
  });

  it('CARRERA: un conteo y ajustes al mismo tiempo dejan un historial coherente (stockAfter = stock anterior + quantity)', async () => {
    for (let round = 0; round < 4; round++) {
      await resetDatabase(prisma);
      w = await setupWorld(prisma);
      cat = await seedCatalog(prisma);
      const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '50' });
      await Promise.all([
        adjust(p.id, { reason: 'BREAKAGE', quantity: '-5' }),
        adjust(p.id, { reason: 'COUNT_CORRECTION', countedQuantity: '30' }),
        adjust(p.id, { reason: 'INITIAL_LOAD', quantity: '7' }, w.owner),
        adjust(p.id, { reason: 'MISSING', quantity: '-1' }, w.owner),
      ]);
      const movements = await prisma.stockMovement.findMany({
        where: { productId: p.id },
        orderBy: { id: 'asc' },
      });
      let stock = 50;
      for (const m of movements) {
        stock += Number(m.quantity);
        expect(Number(m.stockAfter), `ronda ${round}, movimiento ${m.id}`).toBe(stock);
      }
      expect(await stockOf(p.id)).toBe(stock.toFixed(3));
    }
  });

  it('el producto no se edita por otra vía: el stock solo cambia con movimientos (suma de movimientos = stock)', async () => {
    const p = await w.client.post(
      '/api/products',
      {
        name: 'Alfajor',
        saleUnit: 'UNIT',
        subcategoryId: cat.subcategory.id,
        salePrice: '500',
        initialStock: '10',
      },
      w.manager,
    );
    await adjust(p.body.id, { reason: 'BREAKAGE', quantity: '-3' });
    await adjust(p.body.id, { reason: 'COUNT_CORRECTION', countedQuantity: '4' });
    await w.client.patch(`/api/products/${p.body.id}`, { name: 'Alfajor triple' }, w.manager);
    const sum = await prisma.stockMovement.aggregate({
      where: { productId: p.body.id },
      _sum: { quantity: true },
    });
    expect(sum._sum.quantity?.toFixed(3)).toBe(await stockOf(p.body.id));
  });
});

describe('historial de stock (8.1)', () => {
  it('paginado, el más nuevo primero, con filtros por tipo y por día de Buenos Aires; solo encargado y dueño', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { stockQuantity: '10' });
    await adjust(p.id, { reason: 'BREAKAGE', quantity: '-1' });
    await adjust(p.id, { reason: 'BREAKAGE', quantity: '-2' });
    await adjust(p.id, { reason: 'BREAKAGE', quantity: '-3' });
    // Fechas conocidas: 24/11 a las 23:30 (Buenos Aires) y 25/11 a las 00:30.
    const rows = await prisma.stockMovement.findMany({ orderBy: { id: 'asc' } });
    await prisma.$executeRaw`UPDATE stock_movements SET created_at = '2026-11-25T02:30:00Z' WHERE id = ${rows[0]!.id}`; // 24/11 23:30 AR
    await prisma.$executeRaw`UPDATE stock_movements SET created_at = '2026-11-25T03:30:00Z' WHERE id = ${rows[1]!.id}`; // 25/11 00:30 AR
    await prisma.$executeRaw`UPDATE stock_movements SET created_at = '2026-11-26T01:00:00Z' WHERE id = ${rows[2]!.id}`; // 25/11 22:00 AR

    const get = (qs: string, cookie = w.manager) =>
      w.client.get(`/api/products/${p.id}/stock-movements${qs}`, cookie);
    const all = await get('');
    expect(all.body).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    expect(all.body.items.map((m: { quantity: string }) => m.quantity)).toEqual([
      '-3.000',
      '-2.000',
      '-1.000',
    ]);
    expect((await get('?pageSize=2&page=2')).body.items).toHaveLength(1);
    expect(
      (await get('?from=2026-11-24&to=2026-11-24')).body.items.map(
        (m: { quantity: string }) => m.quantity,
      ),
    ).toEqual(['-1.000']);
    expect((await get('?from=2026-11-25&to=2026-11-25')).body.total).toBe(2);
    expect((await get('?from=2026-11-25')).body.total).toBe(2);
    expect((await get('?to=2026-11-24')).body.total).toBe(1);
    expect((await get('?type=SALE')).body.total).toBe(0);
    expect((await get('?type=ADJUSTMENT')).body.total).toBe(3);
    for (const qs of [
      '?from=2026-13-01',
      '?from=ayer',
      '?type=OTRO',
      '?from=2026-11-25&to=2026-11-24',
      '?x=1',
    ]) {
      expect((await get(qs)).status, qs).toBe(400);
    }
    expect((await get('', w.employee)).status).toBe(403);
    expect((await w.client.get('/api/products/999/stock-movements', w.owner)).status).toBe(404);
    expect((await get('', w.owner)).body.items[0]).toHaveProperty('unitNetCost', '1000.00');
    expect(all.body.items[0]).not.toHaveProperty('unitNetCost');
  });
});

describe('"Para reponer" (STK-06, PA-26, H-30)', () => {
  it('stock <= mínimo, activos, ordenados por lo que falta; incluye los de mínimo 0 con stock 0 o negativo', async () => {
    const make = (name: string, stock: string, min: string, extra = {}) =>
      seedProduct(prisma, cat.subcategory.id, {
        name,
        stockQuantity: stock,
        minStock: min,
        ...extra,
      });
    await make('Justo', '5', '5');
    await make('Falta poco', '4', '5');
    await make('Falta mucho', '1', '10');
    await make('Sin mínimo y sin stock', '0', '0');
    await make('Sin mínimo y negativo', '-2', '0');
    await make('Sin mínimo con stock', '3', '0');
    await make('Sobra', '9', '5');
    await make('Desactivado', '0', '5', { isActive: false });

    const res = await w.client.get('/api/stock/restock', w.manager);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { name: string }) => i.name)).toEqual([
      'Falta mucho', // falta 9
      'Sin mínimo y negativo', // falta 2 (-2 -> 0)
      'Falta poco', // falta 1
      'Justo', // falta 0 (los de falta 0 van alfabéticos)
      'Sin mínimo y sin stock',
    ]);
    expect(res.body.items[0]).toMatchObject({
      name: 'Falta mucho',
      categoryName: 'Golosinas',
      subcategoryName: 'Chocolates',
      stockQuantity: '1.000',
      minStock: '10.000',
      shortfall: '9.000',
      isActive: true,
    });
    // Con mínimo 0 y stock 0 lo que falta es 0; con stock -2, 2.
    const shortfall = (name: string) =>
      res.body.items.find((i: { name: string }) => i.name === name).shortfall;
    expect(shortfall('Sin mínimo y sin stock')).toBe('0.000');
    expect(shortfall('Sin mínimo y negativo')).toBe('2.000');
    expect(res.body.total).toBe(5);
  });

  it('filtros por búsqueda, categoría y subcategoría; paginado', async () => {
    await seedProduct(prisma, cat.subcategory.id, {
      name: 'Bombón',
      stockQuantity: '0',
      minStock: '2',
    });
    await seedProduct(prisma, cat.plain.id, {
      name: 'Caramelo',
      stockQuantity: '0',
      minStock: '2',
    });
    const get = async (qs: string) =>
      (await w.client.get(`/api/stock/restock?${qs}`, w.owner)).body;
    expect((await get('search=bombon')).total).toBe(1);
    expect((await get(`subcategoryId=${cat.plain.id}`)).items[0].name).toBe('Caramelo');
    expect((await get(`categoryId=${cat.category.id}`)).total).toBe(2);
    expect((await get('pageSize=1&page=2')).items).toHaveLength(1);
  });

  it('"stock negativo": el más negativo primero, activos y desactivados; el 0 no cuenta', async () => {
    await seedProduct(prisma, cat.subcategory.id, { name: 'A', stockQuantity: '-1' });
    await seedProduct(prisma, cat.subcategory.id, {
      name: 'B',
      stockQuantity: '-7',
      isActive: false,
    });
    await seedProduct(prisma, cat.subcategory.id, { name: 'C', stockQuantity: '0' });
    const res = await w.client.get('/api/stock/negative', w.owner);
    expect(
      res.body.items.map((i: { name: string; isActive: boolean }) => [i.name, i.isActive]),
    ).toEqual([
      ['B', false],
      ['A', true],
    ]);
  });

  it('el empleado recibe 403 en las dos listas; sin sesión, 401', async () => {
    for (const path of ['/api/stock/restock', '/api/stock/negative']) {
      expect((await w.client.get(path, w.employee)).status).toBe(403);
      expect((await w.client.get(path)).status).toBe(401);
    }
  });
});
