// Etapa 2: productos, búsqueda del mostrador y precios (docs/api/productos-stock.md, secciones 6 y 7).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedCatalog, seedProduct, setupWorld, type World } from './catalog-helpers';

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

/** Alta por la API como dueño. */
async function createProduct(body: Record<string, unknown> = {}, cookie = w.owner) {
  return w.client.post(
    '/api/products',
    {
      name: 'Chocolate Águila 100 g',
      saleUnit: 'UNIT',
      subcategoryId: cat.subcategory.id,
      netCostPrice: '1000',
      salePrice: '1820',
      ...body,
    },
    cookie,
  );
}

describe('alta de producto (STK-01, H-24, H-25)', () => {
  it('ejemplo del contrato: sugerido $1.820 y margen real 50,41 %; el stock inicial es un movimiento', async () => {
    const res = await createProduct({
      barcode: '7790580123456',
      vatRatePercent: '21',
      minStock: '6',
      initialStock: '24',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Chocolate Águila 100 g',
      barcode: '7790580123456',
      saleUnit: 'UNIT',
      category: { name: 'Golosinas' },
      subcategory: { name: 'Chocolates' },
      salePrice: '1820.00',
      vatRatePercent: '21.00',
      stockQuantity: '24.000',
      minStock: '6.000',
      needsRestock: false,
      unitsPerPack: null,
      isMiscellaneous: false,
      isActive: true,
      netCostPrice: '1000.00',
      costPrice: '1210.00',
      marginPercent: null,
      effectiveMarginPercent: '50.00',
      marginSource: 'SUBCATEGORY',
      suggestedPrice: '1820.00',
      realMarginPercent: '50.41',
    });
    const movements = await prisma.stockMovement.findMany({ where: { productId: res.body.id } });
    expect(movements).toHaveLength(1);
    expect(movements[0]).toMatchObject({
      type: 'ADJUSTMENT',
      adjustmentReason: 'INITIAL_LOAD',
      userId: w.ownerId,
    });
    expect(movements[0]?.quantity.toFixed(3)).toBe('24.000');
    expect(movements[0]?.stockAfter.toFixed(3)).toBe('24.000');
    expect(movements[0]?.unitNetCost?.toFixed(2)).toBe('1000.00');
    // No crea PriceChange (no hay valor anterior); sí audita el alta y la carga inicial.
    expect(await prisma.priceChange.count()).toBe(0);
    expect((await audits('PRODUCT_CREATE'))[0]?.details).toMatchObject({
      after: {
        name: 'Chocolate Águila 100 g',
        salePrice: '1820.00',
        costPrice: '1210.00',
        marginPercent: null,
      },
    });
    expect(await audits('STOCK_ADJUST')).toHaveLength(1);
  });

  it('el encargado también da de alta, con costo (es pantalla de precios); con marginPercent recibe 403', async () => {
    const ok = await createProduct({}, w.manager);
    expect(ok.status).toBe(201);
    expect(ok.body.netCostPrice).toBe('1000.00');
    expect(ok.body.suggestedPrice).toBe('1820.00');
    const bad = await createProduct({ name: 'Otro', marginPercent: '10' }, w.manager);
    expect(bad.status).toBe(403);
    expect(bad.body.error.details).toEqual({ fields: ['marginPercent'] });
    expect(await prisma.product.count()).toBe(1);
  });

  it('el empleado no da de alta (403)', async () => {
    expect((await createProduct({}, w.employee)).status).toBe(403);
  });

  it('el salePrice se guarda tal cual lo mandó el usuario (no se pisa con el sugerido)', async () => {
    const res = await createProduct({ salePrice: '1999.50' });
    expect(res.body.salePrice).toBe('1999.50');
    expect(res.body.suggestedPrice).toBe('1820.00');
  });

  it('el costo final se calcula con el IVA del producto (H-25)', async () => {
    const res = await createProduct({ vatRatePercent: '10.5', netCostPrice: '1000' });
    expect(res.body.costPrice).toBe('1105.00');
    expect(res.body.vatRatePercent).toBe('10.50');
  });

  it('código de barras repetido: 409 con el producto que lo tiene; también contra uno desactivado', async () => {
    const first = await createProduct({ barcode: '123' });
    const dup = await createProduct({ name: 'Otro', barcode: '123' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: 'BARCODE_TAKEN',
      details: {
        field: 'barcode',
        productId: first.body.id,
        productName: 'Chocolate Águila 100 g',
      },
    });
    await prisma.product.update({ where: { id: first.body.id }, data: { isActive: false } });
    expect((await createProduct({ name: 'Otro', barcode: '123' })).status).toBe(409);
  });

  it('barcode "" o null = sin código (se puede repetir)', async () => {
    const a = await createProduct({ barcode: '' });
    const b = await createProduct({ name: 'B', barcode: null });
    const c = await createProduct({ name: 'C' });
    expect([a.status, b.status, c.status]).toEqual([201, 201, 201]);
    expect([a.body.barcode, b.body.barcode, c.body.barcode]).toEqual([null, null, null]);
  });

  it('dos altas simultáneas con el mismo código: una gana y las demás reciben 409', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) => createProduct({ name: `P${i}`, barcode: 'CARRERA' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('producto por unidad con cantidad decimal: 400 con el campo', async () => {
    for (const [field, value] of [
      ['minStock', '2.5'],
      ['unitsPerPack', '6.5'],
      ['initialStock', '1.250'],
    ] as const) {
      const res = await createProduct({ [field]: value });
      expect(res.status, field).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.fields[0].path).toBe(field);
    }
    // "3" y "3.000" valen; por peso, con decimales, también.
    expect((await createProduct({ minStock: '3.000' })).status).toBe(201);
    expect(
      (
        await createProduct({
          name: 'Fiambre',
          saleUnit: 'KG',
          minStock: '2.5',
          initialStock: '10.250',
        })
      ).status,
    ).toBe(201);
  });

  it('campos que no existen en el alta: 400 (stockQuantity, costPrice, isMiscellaneous, isActive, defaultSupplierId)', async () => {
    for (const extra of [
      { stockQuantity: '10' },
      { costPrice: '1210' },
      { isMiscellaneous: true },
      { isActive: false },
      { defaultSupplierId: 1 },
    ]) {
      expect((await createProduct(extra)).status).toBe(400);
    }
    expect(await prisma.product.count()).toBe(0);
  });

  it('dinero y cantidades como número de JSON: 400', async () => {
    for (const extra of [
      { salePrice: 1820 },
      { netCostPrice: 1000 },
      { minStock: 6 },
      { vatRatePercent: 21 },
    ]) {
      expect((await createProduct(extra)).status).toBe(400);
    }
  });

  it.each([
    [{ vatRatePercent: '20' }],
    [{ salePrice: '1.234' }],
    [{ salePrice: '-5' }],
    [{ name: '   ' }],
    [{ barcode: 'con espacio' }],
    [{ unitsPerPack: '0' }],
    [{ subcategoryId: '4' }],
    [{ saleUnit: 'LITRO' }],
  ])('formato inválido %j: 400', async (extra) => {
    expect((await createProduct(extra)).status).toBe(400);
  });

  it('texto basura en cualquier campo numérico da 400 (nunca 500)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    const garbage = [
      'abc',
      '',
      ' ',
      '1e5',
      'NaN',
      'Infinity',
      '0x10',
      '1,5',
      '٣',
      '--1',
      '1..2',
      '0.0.0',
    ];
    const fields = [
      'vatRatePercent',
      'netCostPrice',
      'salePrice',
      'minStock',
      'unitsPerPack',
      'initialStock',
      'marginPercent',
    ];
    for (const field of fields) {
      for (const value of garbage) {
        const res = await createProduct({ [field]: value });
        expect(res.status, `${field}=${JSON.stringify(value)}`).toBe(400);
      }
    }
    for (const value of garbage) {
      for (const body of [
        { salePrice: value },
        { netCostPrice: value },
        { marginPercent: value },
      ]) {
        expect(
          (await w.client.patch(`/api/products/${p.id}/pricing`, body, w.owner)).status,
          JSON.stringify(body),
        ).toBe(400);
      }
      expect(
        (await w.client.patch(`/api/products/${p.id}`, { vatRatePercent: value }, w.owner)).status,
      ).toBe(400);
      expect(
        (await w.client.patch(`/api/products/${p.id}`, { minStock: value }, w.owner)).status,
      ).toBe(400);
      expect(
        (
          await w.client.post(
            `/api/products/${p.id}/stock-adjustments`,
            { reason: 'BREAKAGE', quantity: value },
            w.owner,
          )
        ).status,
      ).toBe(400);
      expect(
        (
          await w.client.post(
            `/api/products/${p.id}/stock-adjustments`,
            { reason: 'COUNT_CORRECTION', countedQuantity: value },
            w.owner,
          )
        ).status,
      ).toBe(400);
      expect(
        (await w.client.patch('/api/settings', { priceRoundingStep: value }, w.owner)).status,
      ).toBe(400);
      expect(
        (await w.client.post('/api/categories', { name: 'X', marginPercent: value }, w.owner))
          .status,
      ).toBe(400);
    }
  });

  it('subcategoría inexistente o desactivada: 422', async () => {
    const none = await createProduct({ subcategoryId: 999 });
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe('SUBCATEGORY_NOT_FOUND');
    await prisma.subcategory.update({
      where: { id: cat.subcategory.id },
      data: { isActive: false },
    });
    const off = await createProduct();
    expect(off.status).toBe(422);
    expect(off.body.error.code).toBe('SUBCATEGORY_INACTIVE');
    // También si la desactivada es la categoría.
    await prisma.subcategory.update({
      where: { id: cat.subcategory.id },
      data: { isActive: true },
    });
    await prisma.category.update({ where: { id: cat.category.id }, data: { isActive: false } });
    expect((await createProduct()).body.error.code).toBe('SUBCATEGORY_INACTIVE');
  });

  it('un importe que no entra en la columna da 400, no 500', async () => {
    const res = await createProduct({ netCostPrice: '999999999999.99' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.fields[0].path).toBe('netCostPrice');
  });
});

describe('ficha y lista (aprobado 2026-11-25)', () => {
  it('el dueño ve el costo; el encargado y el empleado reciben ProductPublic', async () => {
    const p = await createProduct({ initialStock: '5' });
    const owner = await w.client.get(`/api/products/${p.body.id}`, w.owner);
    expect(owner.body).toHaveProperty('netCostPrice', '1000.00');
    for (const cookie of [w.manager, w.employee]) {
      const res = await w.client.get(`/api/products/${p.body.id}`, cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ salePrice: '1820.00', stockQuantity: '5.000' });
      for (const key of [
        'netCostPrice',
        'costPrice',
        'marginPercent',
        'suggestedPrice',
        'realMarginPercent',
      ]) {
        expect(res.body).not.toHaveProperty(key);
      }
    }
  });

  it('404 si no existe, 400 si el id no es válido; incluye desactivados', async () => {
    expect((await w.client.get('/api/products/999', w.owner)).status).toBe(404);
    expect((await w.client.get('/api/products/uno', w.owner)).status).toBe(400);
    const off = await seedProduct(prisma, cat.subcategory.id, { isActive: false });
    expect((await w.client.get(`/api/products/${off.id}`, w.employee)).body.isActive).toBe(false);
  });

  it('lista paginada con filtros y orden', async () => {
    await seedProduct(prisma, cat.subcategory.id, {
      name: 'Alfajor',
      barcode: '111',
      salePrice: '500',
      stockQuantity: '10',
      minStock: '5',
    });
    await seedProduct(prisma, cat.subcategory.id, {
      name: 'Bombón',
      barcode: '112',
      salePrice: '300',
      saleUnit: 'KG',
      stockQuantity: '10',
      minStock: '5',
    });
    await seedProduct(prisma, cat.plain.id, {
      name: 'Caramelo',
      salePrice: '100',
      isActive: false,
      stockQuantity: '1',
      minStock: '5',
    });

    const all = await w.client.get('/api/products', w.employee);
    expect(all.body).toMatchObject({ page: 1, pageSize: 50, total: 3 });
    expect(all.body.items.map((i: { name: string }) => i.name)).toEqual([
      'Alfajor',
      'Bombón',
      'Caramelo',
    ]);

    const q = async (qs: string) => (await w.client.get(`/api/products?${qs}`, w.owner)).body;
    expect((await q('isActive=true')).total).toBe(2);
    expect((await q('isActive=false')).items[0].name).toBe('Caramelo');
    expect((await q('saleUnit=KG')).items.map((i: { name: string }) => i.name)).toEqual(['Bombón']);
    expect((await q(`subcategoryId=${cat.plain.id}`)).total).toBe(1);
    expect((await q(`categoryId=${cat.category.id}`)).total).toBe(3);
    expect((await q('needsRestock=true')).items.map((i: { name: string }) => i.name)).toEqual([
      'Caramelo',
    ]);
    expect((await q('sortBy=salePrice&sortOrder=desc')).items[0].name).toBe('Alfajor');
    const paged = await q('pageSize=2&page=2');
    expect(paged).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(paged.items).toHaveLength(1);
    // Búsqueda por nombre (sin acentos) y por código que EMPIEZA con el texto.
    expect((await q('search=bombon')).total).toBe(1);
    expect((await q('search=11')).total).toBe(2);
    expect((await q('search=12')).total).toBe(0);
  });

  it.each([
    ['page=0'],
    ['pageSize=201'],
    ['sortBy=netCostPrice'],
    ['sortBy=name;DROP TABLE products'],
    ['isActive=si'],
    ['search='],
    ['otro=1'],
  ])('parámetros inválidos (%s): 400', async (qs) => {
    expect((await w.client.get(`/api/products?${qs}`, w.owner)).status).toBe(400);
  });
});

describe('búsqueda del mostrador (STK-02, VEN-01, VEN-02)', () => {
  it('por código exacto: matchedBy BARCODE, un solo producto, sin costo ni siquiera para el dueño', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, {
      barcode: '7790895000997',
      stockQuantity: '-2',
    });
    for (const cookie of [w.owner, w.manager, w.employee]) {
      const res = await w.client.get('/api/products/search?q=7790895000997', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        matchedBy: 'BARCODE',
        items: [
          {
            id: p.id,
            name: 'Chocolate Águila 100 g',
            barcode: '7790895000997',
            saleUnit: 'UNIT',
            salePrice: '1820.00',
            stockQuantity: '-2.000',
            isMiscellaneous: false,
          },
        ],
        isInactiveBarcode: false,
      });
    }
  });

  it('por nombre: sin mayúsculas ni acentos, cada palabra tiene que aparecer, primero los que empiezan con el texto', async () => {
    for (const name of ['Café molido', 'Cafetera', 'Mi café con leche', 'Leche', 'Té verde']) {
      await seedProduct(prisma, cat.subcategory.id, { name });
    }
    const names = async (q: string) =>
      (
        await w.client.get(`/api/products/search?q=${encodeURIComponent(q)}`, w.employee)
      ).body.items.map((i: { name: string }) => i.name);
    expect(await names('cafe')).toEqual(['Café molido', 'Cafetera', 'Mi café con leche']);
    expect(await names('CAFÉ')).toEqual(['Café molido', 'Cafetera', 'Mi café con leche']);
    expect(await names('leche cafe')).toEqual(['Mi café con leche']);
    expect(await names('te')).toContain('Té verde');
    expect(await names('inexistente')).toEqual([]);
    const res = await w.client.get('/api/products/search?q=cafe', w.employee);
    expect(res.body.matchedBy).toBe('NAME');
  });

  it('el producto desactivado no aparece (STK-02) y su código avisa con isInactiveBarcode', async () => {
    await seedProduct(prisma, cat.subcategory.id, {
      name: 'Viejo',
      barcode: '555',
      isActive: false,
    });
    await seedProduct(prisma, cat.subcategory.id, { name: 'Viejo 2', isActive: false });
    const byCode = await w.client.get('/api/products/search?q=555', w.employee);
    expect(byCode.body).toMatchObject({ matchedBy: 'NAME', items: [], isInactiveBarcode: true });
    const byName = await w.client.get('/api/products/search?q=viejo', w.employee);
    expect(byName.body.items).toEqual([]);
  });

  it('un código inexistente devuelve lista vacía', async () => {
    const res = await w.client.get('/api/products/search?q=999999', w.employee);
    expect(res.body).toEqual({ matchedBy: 'NAME', items: [], isInactiveBarcode: false });
  });

  it('el límite se respeta (default 20, máximo 50)', async () => {
    for (let i = 0; i < 25; i++)
      await seedProduct(prisma, cat.subcategory.id, { name: `Galletita ${i}` });
    expect(
      (await w.client.get('/api/products/search?q=galletita', w.employee)).body.items,
    ).toHaveLength(20);
    expect(
      (await w.client.get('/api/products/search?q=galletita&limit=5', w.employee)).body.items,
    ).toHaveLength(5);
    expect(
      (await w.client.get('/api/products/search?q=galletita&limit=50', w.employee)).body.items,
    ).toHaveLength(25);
    for (const limit of ['0', '51', 'x', '-1']) {
      expect(
        (await w.client.get(`/api/products/search?q=a&limit=${limit}`, w.employee)).status,
      ).toBe(400);
    }
  });

  it('% y _ se buscan como texto, no como comodines', async () => {
    await seedProduct(prisma, cat.subcategory.id, { name: 'Descuento 50% off' });
    await seedProduct(prisma, cat.subcategory.id, { name: 'Descuento 500 off' });
    await seedProduct(prisma, cat.subcategory.id, { name: 'Pack_x2' });
    await seedProduct(prisma, cat.subcategory.id, { name: 'PackAx2' });
    const names = async (q: string) =>
      (
        await w.client.get(`/api/products/search?q=${encodeURIComponent(q)}`, w.employee)
      ).body.items.map((i: { name: string }) => i.name);
    expect(await names('50%')).toEqual(['Descuento 50% off']);
    expect(await names('pack_x')).toEqual(['Pack_x2']);
    expect(await names('%')).toEqual(['Descuento 50% off']);
    expect(await names('_')).toEqual(['Pack_x2']);
    expect(await names('\\')).toEqual([]);
  });

  it('inyección SQL: el texto buscado es siempre un parámetro', async () => {
    await seedProduct(prisma, cat.subcategory.id, { name: 'Producto normal' });
    for (const q of [
      "'; DROP TABLE products; --",
      "' OR '1'='1",
      "%' OR TRUE --",
      'x") OR (1=1',
      "\\'; DELETE FROM products; --",
    ]) {
      const res = await w.client.get(`/api/products/search?q=${encodeURIComponent(q)}`, w.employee);
      expect(res.status, q).toBe(200);
      expect(res.body.items, q).toEqual([]);
      // La misma búsqueda en la lista del ABM.
      expect(
        (await w.client.get(`/api/products?search=${encodeURIComponent(q)}`, w.owner)).body.total,
        q,
      ).toBe(0);
    }
    expect(await prisma.product.count()).toBe(1);
  });

  it('q vacío, solo espacios o muy largo: 400; sin sesión: 401', async () => {
    for (const qs of ['q=', 'q=%20%20', `q=${'a'.repeat(101)}`, '', 'q=a&q=b']) {
      expect((await w.client.get(`/api/products/search?${qs}`, w.employee)).status, qs).toBe(400);
    }
    expect((await w.client.get('/api/products/search?q=a')).status).toBe(401);
  });

  it('"search" no se confunde con un id (se registra antes que /:id)', async () => {
    const res = await w.client.get('/api/products/search?q=x', w.employee);
    expect(res.status).toBe(200);
  });
});

describe('editar, desactivar y reactivar (STK-02, H-26, H-31)', () => {
  it('cambia datos generales y audita solo lo que cambió; sin cambios: 200 sin auditar', async () => {
    const p = await createProduct({ barcode: '1' });
    const res = await w.client.patch(
      `/api/products/${p.body.id}`,
      { name: 'Águila 100 g', minStock: '4', vatRatePercent: '10.5' },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Águila 100 g',
      minStock: '4.000',
      vatRatePercent: '10.50',
    });
    const [log] = await audits('PRODUCT_UPDATE');
    expect(log?.details).toEqual({
      before: { name: 'Chocolate Águila 100 g', minStock: '0.000', vatRatePercent: '21.00' },
      after: { name: 'Águila 100 g', minStock: '4.000', vatRatePercent: '10.50' },
    });
    const same = await w.client.patch(
      `/api/products/${p.body.id}`,
      { name: 'Águila 100 g' },
      w.owner,
    );
    expect(same.status).toBe(200);
    expect(await audits('PRODUCT_UPDATE')).toHaveLength(1);
  });

  it('el IVA no cambia el precio de venta ni el costo final guardado (STK-10), solo el sugerido', async () => {
    const p = await createProduct();
    const res = await w.client.patch(
      `/api/products/${p.body.id}`,
      { vatRatePercent: '10.5' },
      w.owner,
    );
    expect(res.body.salePrice).toBe('1820.00');
    expect(res.body.costPrice).toBe('1210.00');
    expect(res.body.suggestedPrice).toBe('1660.00'); // 1000 x 1,5 x 1,105 = 1657,5 -> 1660
  });

  it('el encargado edita y recibe ProductPublic (sin costo); el empleado, 403', async () => {
    const p = await createProduct();
    const res = await w.client.patch(
      `/api/products/${p.body.id}`,
      { name: 'Nuevo nombre' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('netCostPrice');
    expect(
      (await w.client.patch(`/api/products/${p.body.id}`, { name: 'X' }, w.employee)).status,
    ).toBe(403);
  });

  it('el stock no se edita por acá: stockQuantity y los campos de precio dan 400', async () => {
    const p = await createProduct({ initialStock: '5' });
    for (const body of [
      { stockQuantity: '100' },
      { netCostPrice: '5' },
      { costPrice: '5' },
      { salePrice: '5' },
      { marginPercent: '5' },
      { isMiscellaneous: true },
      { defaultSupplierId: 1 },
      {},
    ]) {
      expect(
        (await w.client.patch(`/api/products/${p.body.id}`, body, w.owner)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.body.id } });
    expect(row.stockQuantity.toFixed(3)).toBe('5.000');
  });

  it('el código de barras: cambiar a uno ocupado da 409; null lo quita y queda libre para otro', async () => {
    const a = await createProduct({ barcode: 'A' });
    const b = await createProduct({ name: 'B', barcode: 'B' });
    const clash = await w.client.patch(`/api/products/${b.body.id}`, { barcode: 'A' }, w.owner);
    expect(clash.status).toBe(409);
    expect(clash.body.error.details.productId).toBe(a.body.id);
    expect(
      (await w.client.patch(`/api/products/${a.body.id}`, { barcode: null }, w.owner)).body.barcode,
    ).toBeNull();
    expect(
      (await w.client.patch(`/api/products/${b.body.id}`, { barcode: 'A' }, w.owner)).status,
    ).toBe(200);
  });

  it('desactivar con stock distinto de 0 se puede (H-31) y desaparece de la búsqueda; reactivar lo devuelve (H-26)', async () => {
    const p = await createProduct({ barcode: '9', initialStock: '7' });
    const off = await w.client.patch(`/api/products/${p.body.id}`, { isActive: false }, w.manager);
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);
    expect(off.body.stockQuantity).toBe('7.000');
    expect((await w.client.get('/api/products/search?q=aguila', w.employee)).body.items).toEqual(
      [],
    );
    expect(
      (await w.client.get('/api/products/search?q=9', w.employee)).body.isInactiveBarcode,
    ).toBe(true);
    const on = await w.client.patch(`/api/products/${p.body.id}`, { isActive: true }, w.manager);
    expect(on.status).toBe(200);
    expect(
      (await w.client.get('/api/products/search?q=aguila', w.employee)).body.items,
    ).toHaveLength(1);
    expect((await audits('PRODUCT_UPDATE')).map((l) => l.details)).toEqual([
      { before: { isActive: true }, after: { isActive: false } },
      { before: { isActive: false }, after: { isActive: true } },
    ]);
  });

  it('H-26: reactivar con la subcategoría desactivada da 422; con otra subcategoría activa en el mismo pedido, se puede', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { isActive: false });
    await prisma.subcategory.update({
      where: { id: cat.subcategory.id },
      data: { isActive: false },
    });
    const res = await w.client.patch(`/api/products/${p.id}`, { isActive: true }, w.manager);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SUBCATEGORY_INACTIVE');
    const moved = await w.client.patch(
      `/api/products/${p.id}`,
      { isActive: true, subcategoryId: cat.plain.id },
      w.manager,
    );
    expect(moved.status).toBe(200);
    expect(moved.body.subcategory.name).toBe('Caramelos');
  });

  it('H-26: reactivar con la categoría desactivada también da 422', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { isActive: false });
    await prisma.category.update({ where: { id: cat.category.id }, data: { isActive: false } });
    const res = await w.client.patch(`/api/products/${p.id}`, { isActive: true }, w.owner);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SUBCATEGORY_INACTIVE');
  });

  it('cambiar de subcategoría cambia el margen que se usa, pero no el precio guardado (D7)', async () => {
    const p = await createProduct();
    const res = await w.client.patch(
      `/api/products/${p.body.id}`,
      { subcategoryId: cat.plain.id },
      w.owner,
    );
    expect(res.body).toMatchObject({
      effectiveMarginPercent: '40.00',
      marginSource: 'CATEGORY',
      salePrice: '1820.00',
      suggestedPrice: '1700.00',
    });
    expect(
      (await w.client.patch(`/api/products/${p.body.id}`, { subcategoryId: 999 }, w.owner)).body
        .error.code,
    ).toBe('SUBCATEGORY_NOT_FOUND');
  });

  it('pasar a "por unidad" con stock o mínimo decimal: 422 SALE_UNIT_NOT_WHOLE; con decimales en el pedido: 400', async () => {
    const p = await createProduct({ saleUnit: 'KG', initialStock: '2.5', minStock: '1' });
    const res = await w.client.patch(`/api/products/${p.body.id}`, { saleUnit: 'UNIT' }, w.owner);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('SALE_UNIT_NOT_WHOLE');
    expect(res.body.error.details.fields[0].path).toBe('stockQuantity');
    // Con un ajuste que lo deja entero, se puede.
    await w.client.post(
      `/api/products/${p.body.id}/stock-adjustments`,
      { reason: 'COUNT_CORRECTION', countedQuantity: '3' },
      w.owner,
    );
    expect(
      (await w.client.patch(`/api/products/${p.body.id}`, { saleUnit: 'UNIT' }, w.owner)).status,
    ).toBe(200);
    expect(
      (await w.client.patch(`/api/products/${p.body.id}`, { minStock: '1.5' }, w.owner)).status,
    ).toBe(400);
  });

  it('404 si no existe', async () => {
    expect((await w.client.patch('/api/products/999', { name: 'X' }, w.owner)).status).toBe(404);
  });
});

describe('"Varios" (H-09, H-32)', () => {
  async function seedMisc() {
    const category = await prisma.category.create({ data: { name: 'Varios', marginPercent: '0' } });
    const sub = await prisma.subcategory.create({
      data: { categoryId: category.id, name: 'Varios' },
    });
    return seedProduct(prisma, sub.id, {
      name: 'Varios',
      isMiscellaneous: true,
      netCostPrice: '0',
      costPrice: '0',
      salePrice: '0',
    });
  }

  it('se le cambian nombre e IVA (200); cualquier otro campo, incluso desactivarlo, da 422', async () => {
    const misc = await seedMisc();
    const ok = await w.client.patch(
      `/api/products/${misc.id}`,
      { name: 'Varios kiosco', vatRatePercent: '10.5' },
      w.owner,
    );
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      name: 'Varios kiosco',
      vatRatePercent: '10.50',
      isMiscellaneous: true,
    });
    for (const body of [
      { isActive: false },
      { minStock: '1' },
      { barcode: '77' },
      { subcategoryId: cat.subcategory.id },
      { name: 'X', isActive: true },
    ]) {
      const res = await w.client.patch(`/api/products/${misc.id}`, body, w.owner);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('MISC_PRODUCT_LOCKED');
    }
    const row = await prisma.product.findUniqueOrThrow({ where: { id: misc.id } });
    expect(row).toMatchObject({ isActive: true, name: 'Varios kiosco' });
  });

  it('sin costo, sin sugerido y sin precio guardado: /pricing responde y PATCH /pricing da 422', async () => {
    const misc = await seedMisc();
    const get = await w.client.get(`/api/products/${misc.id}/pricing`, w.owner);
    expect(get.body).toMatchObject({
      isMiscellaneous: true,
      netCostPrice: '0.00',
      suggestedPrice: null,
      realMarginPercent: null,
    });
    const res = await w.client.patch(
      `/api/products/${misc.id}/pricing`,
      { salePrice: '100' },
      w.owner,
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('MISC_PRODUCT_LOCKED');
  });

  it('aparece en la búsqueda por nombre con isMiscellaneous y no se puede ajustar su stock', async () => {
    const misc = await seedMisc();
    const res = await w.client.get('/api/products/search?q=varios', w.employee);
    expect(res.body.items[0]).toMatchObject({ id: misc.id, isMiscellaneous: true });
    const adj = await w.client.post(
      `/api/products/${misc.id}/stock-adjustments`,
      { reason: 'INITIAL_LOAD', quantity: '5' },
      w.owner,
    );
    expect(adj.status).toBe(422);
    expect(adj.body.error.code).toBe('MISC_PRODUCT_NO_STOCK');
    expect(await prisma.stockMovement.count()).toBe(0);
  });

  it('nunca figura en "Para reponer" ni en "stock negativo"', async () => {
    await seedMisc();
    expect((await w.client.get('/api/stock/restock', w.owner)).body.total).toBe(0);
    expect((await w.client.get('/api/stock/negative', w.owner)).body.total).toBe(0);
  });
});

describe('precio sugerido y margen real (PRE-01 a PRE-04, H-15, PA-19 a PA-22)', () => {
  const pricing = async (id: number, cookie = w.owner) =>
    (await w.client.get(`/api/products/${id}/pricing`, cookie)).body;

  it.each([
    [
      'IVA 21 % con margen de subcategoría (50 %)',
      { vatRatePercent: '21' },
      'subcategory',
      '1820.00',
      'SUBCATEGORY',
    ],
    [
      'IVA 21 % con margen de categoría (40 %): 1.694 sube a 1.700',
      { vatRatePercent: '21' },
      'plain',
      '1700.00',
      'CATEGORY',
    ],
    [
      'IVA 10,5 % con margen de categoría: 1.547 sube a 1.550',
      { vatRatePercent: '10.5' },
      'plain',
      '1550.00',
      'CATEGORY',
    ],
    [
      'IVA 0 % con margen de categoría: 1.400 queda igual',
      { vatRatePercent: '0' },
      'plain',
      '1400.00',
      'CATEGORY',
    ],
    [
      'margen propio 100 % (gana a la subcategoría): 2.420 queda igual',
      { marginPercent: '100' },
      'subcategory',
      '2420.00',
      'PRODUCT',
    ],
    ['margen propio 0 % (no hereda)', { marginPercent: '0' }, 'subcategory', '1210.00', 'PRODUCT'],
  ] as const)('%s', async (_name, data, where, suggested, source) => {
    const sub = where === 'plain' ? cat.plain : cat.subcategory;
    const p = await seedProduct(prisma, sub.id, { ...data });
    const res = await pricing(p.id);
    expect(res).toMatchObject({
      suggestedPrice: suggested,
      marginSource: source,
      priceRoundingStep: '10.00',
    });
  });

  it('el redondeo sale de la configuración', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    await w.client.patch('/api/settings', { priceRoundingStep: '100' }, w.owner);
    expect((await pricing(p.id)).suggestedPrice).toBe('1900.00');
    await w.client.patch('/api/settings', { priceRoundingStep: '0' }, w.owner);
    expect((await pricing(p.id)).suggestedPrice).toBe('1815.00');
  });

  it('costo 0: no hay sugerido ni margen real', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { netCostPrice: '0', costPrice: '0' });
    expect(await pricing(p.id)).toMatchObject({
      suggestedPrice: null,
      realMarginPercent: null,
      matchesSuggestedPrice: false,
    });
  });

  it('ProductPricing completo: márgenes de la cadena, margen real y matchesSuggestedPrice', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { salePrice: '1900' });
    expect(await pricing(p.id, w.manager)).toMatchObject({
      productId: p.id,
      vatRatePercent: '21.00',
      netCostPrice: '1000.00',
      costPrice: '1210.00',
      marginPercent: null,
      subcategoryMarginPercent: '50.00',
      categoryMarginPercent: '40.00',
      effectiveMarginPercent: '50.00',
      suggestedPrice: '1820.00',
      salePrice: '1900.00',
      realMarginPercent: '57.02',
      matchesSuggestedPrice: false,
    });
    await prisma.product.update({ where: { id: p.id }, data: { salePrice: '1820' } });
    expect((await pricing(p.id)).matchesSuggestedPrice).toBe(true);
  });

  it('empleado: 403 en /pricing (GET y PATCH)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    expect((await w.client.get(`/api/products/${p.id}/pricing`, w.employee)).status).toBe(403);
    expect(
      (await w.client.patch(`/api/products/${p.id}/pricing`, { salePrice: '1' }, w.employee))
        .status,
    ).toBe(403);
  });

  it('cambiar el precio a mano: PriceChange MANUAL, el margen guardado no cambia, el margen real se muestra (paso 4)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { marginPercent: '50' });
    const res = await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { salePrice: '1900' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      salePrice: '1900.00',
      marginPercent: '50.00',
      realMarginPercent: '57.02',
      matchesSuggestedPrice: false,
    });
    const changes = await prisma.priceChange.findMany();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      productId: p.id,
      source: 'MANUAL',
      userId: w.managerId,
      purchaseId: null,
    });
    expect(changes[0]?.oldSalePrice.toFixed(2)).toBe('1820.00');
    expect(changes[0]?.newSalePrice.toFixed(2)).toBe('1900.00');
    expect(changes[0]?.oldMarginPercent?.toFixed(2)).toBe('50.00');
    expect(changes[0]?.newMarginPercent?.toFixed(2)).toBe('50.00');
    expect(changes[0]?.newNetCostPrice.toFixed(2)).toBe('1000.00');
    const [log] = await audits('PRICE_CHANGE');
    expect(log?.details).toEqual({
      priceChangeId: changes[0]?.id,
      before: { salePrice: '1820.00' },
      after: { salePrice: '1900.00' },
    });
  });

  it('H-24/H-25: el encargado cambia el costo; costPrice con el IVA del producto, el precio no cambia, queda PriceChange', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { vatRatePercent: '10.5' });
    const res = await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { netCostPrice: '1500' },
      w.manager,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      netCostPrice: '1500.00',
      costPrice: '1657.50',
      salePrice: '1820.00',
      suggestedPrice: '2490.00',
    });
    const [change] = await prisma.priceChange.findMany();
    expect(change?.oldNetCostPrice.toFixed(2)).toBe('1000.00');
    expect(change?.newNetCostPrice.toFixed(2)).toBe('1500.00');
    expect(change?.oldCostPrice.toFixed(2)).toBe('1210.00');
    expect(change?.newCostPrice.toFixed(2)).toBe('1657.50');
    expect(change?.newSalePrice.toFixed(2)).toBe('1820.00');
    const [log] = await audits('PRICE_CHANGE');
    expect(log?.details).toMatchObject({
      before: { netCostPrice: '1000.00', costPrice: '1210.00' },
      after: { netCostPrice: '1500.00', costPrice: '1657.50' },
    });
  });

  it('costo y precio en el mismo pedido: un solo PriceChange', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { netCostPrice: '1100', salePrice: '2000' },
      w.owner,
    );
    const changes = await prisma.priceChange.findMany();
    expect(changes).toHaveLength(1);
    expect(changes[0]?.newSalePrice.toFixed(2)).toBe('2000.00');
    expect(changes[0]?.newNetCostPrice.toFixed(2)).toBe('1100.00');
  });

  it('H-05: el encargado no cambia márgenes (403, aunque el valor sea igual); el dueño sí, y null vuelve a heredar', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    for (const marginPercent of ['70', null]) {
      const res = await w.client.patch(
        `/api/products/${p.id}/pricing`,
        { marginPercent, salePrice: '1900' },
        w.manager,
      );
      expect(res.status).toBe(403);
      expect(res.body.error.details).toEqual({ fields: ['marginPercent'] });
    }
    // Nada se guardó (ni el salePrice que venía en el mismo pedido).
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice.toFixed(2),
    ).toBe('1820.00');
    expect(await prisma.priceChange.count()).toBe(0);

    const own = await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { marginPercent: '70' },
      w.owner,
    );
    expect(own.body).toMatchObject({
      marginPercent: '70.00',
      effectiveMarginPercent: '70.00',
      marginSource: 'PRODUCT',
      salePrice: '1820.00',
    });
    const back = await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { marginPercent: null },
      w.owner,
    );
    expect(back.body).toMatchObject({ marginPercent: null, marginSource: 'SUBCATEGORY' });
    const changes = await prisma.priceChange.findMany({ orderBy: { id: 'asc' } });
    expect(changes).toHaveLength(2);
    expect(changes[1]?.oldMarginPercent?.toFixed(2)).toBe('70.00');
    expect(changes[1]?.newMarginPercent).toBeNull();
  });

  it('sin cambios reales: 200 sin PriceChange ni auditoría', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    const res = await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { salePrice: '1820.00', netCostPrice: '1000', marginPercent: null },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(await prisma.priceChange.count()).toBe(0);
    expect(await audits('PRICE_CHANGE')).toHaveLength(0);
  });

  it('cambiar costo, margen de la categoría, IVA o redondeo no cambia el precio guardado (D7, R3)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    await w.client.patch(
      `/api/products/${p.id}/pricing`,
      { netCostPrice: '5000', confirmBelowCost: true },
      w.owner,
    );
    await w.client.patch(
      `/api/subcategories/${cat.subcategory.id}`,
      { marginPercent: '90' },
      w.owner,
    );
    await w.client.patch(`/api/products/${p.id}`, { vatRatePercent: '27' }, w.owner);
    await w.client.patch('/api/settings', { priceRoundingStep: '500' }, w.owner);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice.toFixed(2),
    ).toBe('1820.00');
  });

  it('validación: vacío, número de JSON, campos desconocidos y no existe', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    for (const body of [
      {},
      { salePrice: 1900 },
      { stockQuantity: '1' },
      { costPrice: '1' },
      { marginPercent: '-1' },
    ]) {
      expect(
        (await w.client.patch(`/api/products/${p.id}/pricing`, body, w.owner)).status,
        JSON.stringify(body),
      ).toBe(400);
    }
    expect(
      (await w.client.patch('/api/products/999/pricing', { salePrice: '1' }, w.owner)).status,
    ).toBe(404);
    expect((await w.client.get('/api/products/999/pricing', w.owner)).status).toBe(404);
  });

  it('dos cambios simultáneos de precio: el "antes" de cada PriceChange es exacto (la fila se bloquea)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    await Promise.all([
      w.client.patch(`/api/products/${p.id}/pricing`, { salePrice: '2000' }, w.owner),
      w.client.patch(`/api/products/${p.id}/pricing`, { salePrice: '2100' }, w.manager),
    ]);
    const changes = await prisma.priceChange.findMany({ orderBy: { id: 'asc' } });
    expect(changes).toHaveLength(2);
    // El segundo parte de donde terminó el primero.
    expect(changes[1]?.oldSalePrice.toFixed(2)).toBe(changes[0]?.newSalePrice.toFixed(2));
    expect(changes[0]?.oldSalePrice.toFixed(2)).toBe('1820.00');
  });
});

describe('venta a pérdida: precio por debajo del costo (confirmación explícita)', () => {
  const patchPricing = (id: number, body: unknown, cookie = w.manager) =>
    w.client.patch(`/api/products/${id}/pricing`, body, cookie);

  it('PATCH /pricing: precio bajo el costo final sin confirmar da 422 con datos para el aviso y no guarda nada', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id); // costo final 1210
    for (const cookie of [w.manager, w.owner]) {
      const res = await patchPricing(p.id, { salePrice: '1000' }, cookie);
      expect(res.status).toBe(422);
      expect(res.body.error).toMatchObject({
        code: 'PRICE_BELOW_COST',
        details: { salePrice: '1000.00', costPrice: '1210.00', realMarginPercent: '-17.36' },
      });
    }
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice.toFixed(2),
    ).toBe('1820.00');
    expect(await prisma.priceChange.count()).toBe(0);
  });

  it('con confirmBelowCost: true se guarda y la auditoría lo marca', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    const res = await patchPricing(p.id, { salePrice: '1000', confirmBelowCost: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ salePrice: '1000.00', realMarginPercent: '-17.36' });
    expect((await audits('PRICE_CHANGE'))[0]?.details).toMatchObject({ confirmedBelowCost: true });
  });

  it('el límite: igual al costo final no es pérdida de costo, pero margen real < 0 sí (el IVA se descuenta)', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    expect((await patchPricing(p.id, { salePrice: '1210' })).status).toBe(200); // margen real 0
    expect((await patchPricing(p.id, { salePrice: '1209.99' })).status).toBe(422);
  });

  it('subir el costo y dejar el precio actual por debajo también pide confirmación', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    const res = await patchPricing(p.id, { netCostPrice: '2000' });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ salePrice: '1820.00', costPrice: '2420.00' });
    expect((await patchPricing(p.id, { netCostPrice: '2000', salePrice: '3000' })).status).toBe(
      200,
    );
    expect(
      (await patchPricing(p.id, { netCostPrice: '2000', confirmBelowCost: true })).status,
    ).toBe(200);
  });

  it('cambiar solo el margen, o un cambio que no toca precio ni costo, no pide confirmación', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id, { salePrice: '1000' }); // ya está bajo el costo
    expect((await patchPricing(p.id, { marginPercent: '70' }, w.owner)).status).toBe(200);
  });

  it('confirmBelowCost solo no alcanza como cambio (400) y tiene que ser booleano', async () => {
    const p = await seedProduct(prisma, cat.subcategory.id);
    expect((await patchPricing(p.id, { confirmBelowCost: true })).status).toBe(400);
    expect((await patchPricing(p.id, { salePrice: '1', confirmBelowCost: 'true' })).status).toBe(
      400,
    );
  });

  it('alta: precio bajo el costo sin confirmar da 422 y no crea nada; confirmado, se crea y se audita', async () => {
    const res = await createProduct({ netCostPrice: '1000', salePrice: '1100' }, w.manager);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'PRICE_BELOW_COST',
      details: { costPrice: '1210.00', salePrice: '1100.00' },
    });
    expect(await prisma.product.count()).toBe(0);
    const ok = await createProduct(
      { netCostPrice: '1000', salePrice: '1100', confirmBelowCost: true },
      w.manager,
    );
    expect(ok.status).toBe(201);
    expect((await audits('PRODUCT_CREATE'))[0]?.details).toMatchObject({
      confirmedBelowCost: true,
    });
  });

  it('alta sin costo (0) no dispara el aviso; el empleado nunca llega (403)', async () => {
    expect((await createProduct({ netCostPrice: '0', salePrice: '10' })).status).toBe(201);
    expect((await createProduct({ salePrice: '1' }, w.employee)).status).toBe(403);
    expect((await patchPricing(1, { salePrice: '1' }, w.employee)).status).toBe(403);
  });
});

describe('nombres de producto repetidos', () => {
  it('dos productos pueden llamarse igual (solo el código de barras es único)', async () => {
    expect((await createProduct({ name: 'Alfajor', barcode: '1' })).status).toBe(201);
    expect((await createProduct({ name: 'Alfajor', barcode: '2' })).status).toBe(201);
    expect((await createProduct({ name: 'alfajor' })).status).toBe(201);
  });
});
