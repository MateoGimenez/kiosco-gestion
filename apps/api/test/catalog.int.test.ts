// Etapa 2: configuración, categorías y subcategorías (docs/api/productos-stock.md, secciones 4 y 5).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedCatalog, seedProduct, setupWorld, type World } from './catalog-helpers';

const prisma = createTestPrisma();
let w: World;
beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupWorld(prisma);
});
afterAll(() => prisma.$disconnect());

const audits = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

describe('configuración (CFG-03, CFG-05, CFG-07)', () => {
  it('todos los roles la ven; viene la fila inicial', async () => {
    for (const cookie of [w.owner, w.manager, w.employee]) {
      const res = await w.client.get('/api/settings', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        storeName: 'Kiosco',
        priceRoundingStep: '10.00',
        uploadMaxMb: 10,
        businessDayCutoff: '06:00',
        updatedBy: null,
      });
    }
  });

  it('sin sesión: 401', async () => {
    expect((await w.client.get('/api/settings')).status).toBe(401);
  });

  it('solo el dueño la cambia; el encargado y el empleado reciben 403', async () => {
    for (const cookie of [w.manager, w.employee]) {
      const res = await w.client.patch('/api/settings', { storeName: 'Otro' }, cookie);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    }
  });

  it('el dueño cambia redondeo y hora de corte; queda en la auditoría con antes y después', async () => {
    const res = await w.client.patch(
      '/api/settings',
      { storeName: 'Kiosco Don Pepe', priceRoundingStep: '50', businessDayCutoff: '05:30' },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      storeName: 'Kiosco Don Pepe',
      priceRoundingStep: '50.00',
      businessDayCutoff: '05:30',
      updatedBy: { id: w.ownerId },
    });
    const row = await prisma.setting.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.businessDayCutoffMinutes).toBe(330);
    const [log] = await audits('SETTINGS_UPDATE');
    expect(log?.details).toEqual({
      before: { storeName: 'Kiosco', priceRoundingStep: '10.00', businessDayCutoff: '06:00' },
      after: {
        storeName: 'Kiosco Don Pepe',
        priceRoundingStep: '50.00',
        businessDayCutoff: '05:30',
      },
    });
  });

  it('si no cambia nada: 200 sin auditar', async () => {
    const res = await w.client.patch(
      '/api/settings',
      { priceRoundingStep: '10.00', businessDayCutoff: '06:00' },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(await audits('SETTINGS_UPDATE')).toHaveLength(0);
  });

  it('cambiar el redondeo no cambia ningún precio guardado', async () => {
    const { subcategory } = await seedCatalog(prisma);
    const p = await seedProduct(prisma, subcategory.id);
    await w.client.patch('/api/settings', { priceRoundingStep: '100' }, w.owner);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice.toFixed(2),
    ).toBe('1820.00');
  });

  it.each([
    [{}],
    [{ storeName: '   ' }],
    [{ storeName: 'x'.repeat(81) }],
    [{ priceRoundingStep: 50 }],
    [{ priceRoundingStep: '10001' }],
    [{ priceRoundingStep: '-5' }],
    [{ businessDayCutoff: '24:00' }],
    [{ businessDayCutoff: '6:00' }],
    [{ otroCampo: 'x' }],
  ])('validación: %j -> 400', async (body) => {
    const res = await w.client.patch('/api/settings', body, w.owner);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('categorías (H-23)', () => {
  it('el encargado crea una categoría con su margen inicial (201) y después no puede cambiarlo (403)', async () => {
    const created = await w.client.post(
      '/api/categories',
      { name: 'Bebidas', marginPercent: '35' },
      w.manager,
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      name: 'Bebidas',
      marginPercent: '35.00',
      isActive: true,
      activeProductCount: 0,
      hasMiscellaneousProduct: false,
      subcategories: [],
    });
    const patch = await w.client.patch(
      `/api/categories/${created.body.id}`,
      { marginPercent: '36' },
      w.manager,
    );
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe('FORBIDDEN');
    expect(patch.body.error.details).toEqual({ fields: ['marginPercent'] });
    // Aunque el valor sea igual al actual.
    const same = await w.client.patch(
      `/api/categories/${created.body.id}`,
      { marginPercent: '35' },
      w.manager,
    );
    expect(same.status).toBe(403);
    // Quedó registrado quién puso el margen inicial.
    const [log] = await audits('CATEGORY_CREATE');
    expect(log).toMatchObject({ userId: w.managerId, entityType: 'Category' });
    expect(log?.details).toEqual({ after: { name: 'Bebidas', marginPercent: '35.00' } });
  });

  it('el empleado no crea ni edita categorías (403)', async () => {
    expect(
      (await w.client.post('/api/categories', { name: 'X', marginPercent: '1' }, w.employee))
        .status,
    ).toBe(403);
    const { category } = await seedCatalog(prisma);
    expect(
      (await w.client.patch(`/api/categories/${category.id}`, { name: 'Y' }, w.employee)).status,
    ).toBe(403);
  });

  it('el margen es obligatorio, no puede ser negativo ni número de JSON', async () => {
    for (const body of [
      { name: 'X' },
      { name: 'X', marginPercent: '-1' },
      { name: 'X', marginPercent: 30 },
    ]) {
      expect((await w.client.post('/api/categories', body, w.owner)).status).toBe(400);
    }
  });

  it('el dueño cambia el margen y queda en la auditoría; el precio guardado no cambia', async () => {
    const { category, subcategory } = await seedCatalog(prisma);
    const p = await seedProduct(prisma, subcategory.id);
    const res = await w.client.patch(
      `/api/categories/${category.id}`,
      { marginPercent: '60' },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(res.body.marginPercent).toBe('60.00');
    const [log] = await audits('CATEGORY_UPDATE');
    expect(log?.details).toEqual({
      before: { marginPercent: '40.00' },
      after: { marginPercent: '60.00' },
    });
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).salePrice.toFixed(2),
    ).toBe('1820.00');
  });

  it('el nombre es único sin distinguir mayúsculas (409), al crear y al renombrar', async () => {
    await w.client.post('/api/categories', { name: 'Bebidas', marginPercent: '35' }, w.owner);
    const dup = await w.client.post(
      '/api/categories',
      { name: ' bebidas ', marginPercent: '10' },
      w.owner,
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: 'CATEGORY_NAME_TAKEN',
      details: { field: 'name' },
    });
    const other = await w.client.post(
      '/api/categories',
      { name: 'Kiosco', marginPercent: '10' },
      w.owner,
    );
    const rename = await w.client.patch(
      `/api/categories/${other.body.id}`,
      { name: 'BEBIDAS' },
      w.owner,
    );
    expect(rename.status).toBe(409);
    // Renombrarla con otra capitalización de su propio nombre sí se puede.
    expect(
      (await w.client.patch(`/api/categories/${other.body.id}`, { name: 'KIOSCO' }, w.owner))
        .status,
    ).toBe(200);
  });

  it('dos altas simultáneas con el mismo nombre: una gana y la otra recibe 409 (nunca 500)', async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        w.client.post('/api/categories', { name: 'Carrera', marginPercent: '10' }, w.owner),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
  });

  it('listado: el dueño y el encargado ven márgenes y conteos; el empleado, no', async () => {
    const { category, subcategory } = await seedCatalog(prisma);
    await seedProduct(prisma, subcategory.id);
    await seedProduct(prisma, subcategory.id, { name: 'Otro', isActive: false });

    for (const cookie of [w.owner, w.manager]) {
      const res = await w.client.get('/api/categories', cookie);
      expect(res.status).toBe(200);
      expect(res.body.items[0]).toMatchObject({
        id: category.id,
        marginPercent: '40.00',
        activeProductCount: 1,
        hasMiscellaneousProduct: false,
      });
      expect(res.body.items[0].subcategories.map((s: { name: string }) => s.name)).toEqual([
        'Caramelos',
        'Chocolates',
      ]);
      expect(res.body.items[0].subcategories[1]).toMatchObject({
        marginPercent: '50.00',
        activeProductCount: 1,
      });
    }
    const emp = await w.client.get('/api/categories', w.employee);
    expect(emp.status).toBe(200);
    expect(emp.body.items[0]).toEqual({
      id: category.id,
      name: 'Golosinas',
      isActive: true,
      subcategories: expect.any(Array),
    });
    expect(emp.body.items[0].subcategories[0]).not.toHaveProperty('marginPercent');
  });

  it('listado filtrado por isActive filtra categorías y subcategorías', async () => {
    const { category, plain } = await seedCatalog(prisma);
    await prisma.subcategory.update({ where: { id: plain.id }, data: { isActive: false } });
    const res = await w.client.get('/api/categories?isActive=true', w.owner);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].subcategories.map((s: { name: string }) => s.name)).toEqual([
      'Chocolates',
    ]);
    await prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
    expect((await w.client.get('/api/categories?isActive=true', w.owner)).body.items).toHaveLength(
      0,
    );
    expect((await w.client.get('/api/categories?isActive=quizas', w.owner)).status).toBe(400);
  });

  it('PATCH de una categoría que no existe: 404; id inválido: 400', async () => {
    expect((await w.client.patch('/api/categories/999', { name: 'X' }, w.owner)).status).toBe(404);
    expect((await w.client.patch('/api/categories/abc', { name: 'X' }, w.owner)).status).toBe(400);
  });
});

describe('desactivar y reactivar (H-26, H-27)', () => {
  it('H-27: una categoría con productos activos no se desactiva (422 con el conteo)', async () => {
    const { category, subcategory } = await seedCatalog(prisma);
    await seedProduct(prisma, subcategory.id);
    await seedProduct(prisma, subcategory.id, { name: 'Dos' });
    const res = await w.client.patch(
      `/api/categories/${category.id}`,
      { isActive: false },
      w.manager,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'CATEGORY_HAS_ACTIVE_PRODUCTS',
      details: { activeProductCount: 2 },
    });
  });

  it('H-27: una subcategoría con productos activos no se desactiva', async () => {
    const { subcategory } = await seedCatalog(prisma);
    await seedProduct(prisma, subcategory.id);
    const res = await w.client.patch(
      `/api/subcategories/${subcategory.id}`,
      { isActive: false },
      w.manager,
    );
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({
      code: 'SUBCATEGORY_HAS_ACTIVE_PRODUCTS',
      details: { activeProductCount: 1 },
    });
  });

  it('con los productos desactivados sí se desactiva; después se reactiva (H-26) y queda auditado', async () => {
    const { category, subcategory } = await seedCatalog(prisma);
    await seedProduct(prisma, subcategory.id, { isActive: false });
    expect(
      (await w.client.patch(`/api/subcategories/${subcategory.id}`, { isActive: false }, w.manager))
        .status,
    ).toBe(200);
    const off = await w.client.patch(
      `/api/categories/${category.id}`,
      { isActive: false },
      w.manager,
    );
    expect(off.status).toBe(200);
    expect(off.body.isActive).toBe(false);
    // La subcategoría de una categoría desactivada no se reactiva (422), primero la categoría.
    const subOn = await w.client.patch(
      `/api/subcategories/${subcategory.id}`,
      { isActive: true },
      w.manager,
    );
    expect(subOn.status).toBe(422);
    expect(subOn.body.error.code).toBe('CATEGORY_INACTIVE');
    expect(
      (await w.client.patch(`/api/categories/${category.id}`, { isActive: true }, w.manager))
        .status,
    ).toBe(200);
    expect(
      (await w.client.patch(`/api/subcategories/${subcategory.id}`, { isActive: true }, w.manager))
        .status,
    ).toBe(200);
    expect((await audits('CATEGORY_UPDATE')).map((l) => l.details)).toEqual([
      { before: { isActive: true }, after: { isActive: false } },
      { before: { isActive: false }, after: { isActive: true } },
    ]);
  });

  it('la categoría y la subcategoría de "Varios" no se desactivan (MISC_CATEGORY_LOCKED)', async () => {
    const category = await prisma.category.create({ data: { name: 'Varios', marginPercent: '0' } });
    const sub = await prisma.subcategory.create({
      data: { categoryId: category.id, name: 'Varios' },
    });
    await seedProduct(prisma, sub.id, {
      name: 'Varios',
      isMiscellaneous: true,
      netCostPrice: '0',
      costPrice: '0',
      salePrice: '0',
    });
    const c = await w.client.patch(`/api/categories/${category.id}`, { isActive: false }, w.owner);
    expect(c.status).toBe(422);
    expect(c.body.error.code).toBe('MISC_CATEGORY_LOCKED');
    const s = await w.client.patch(`/api/subcategories/${sub.id}`, { isActive: false }, w.owner);
    expect(s.status).toBe(422);
    expect(s.body.error.code).toBe('MISC_CATEGORY_LOCKED');
    const list = await w.client.get('/api/categories', w.owner);
    expect(list.body.items[0].hasMiscellaneousProduct).toBe(true);
    expect(list.body.items[0].subcategories[0].hasMiscellaneousProduct).toBe(true);
    // Las demás subcategorías no llevan la marca; el empleado no recibe el dato.
    const other = await w.client.post(
      `/api/categories/${category.id}/subcategories`,
      { name: 'Otra' },
      w.owner,
    );
    expect(other.body.hasMiscellaneousProduct).toBe(false);
    const emp = await w.client.get('/api/categories', w.employee);
    expect(emp.body.items[0].subcategories[0]).not.toHaveProperty('hasMiscellaneousProduct');
  });

  it('carrera: desactivar la categoría y dar de alta un producto al mismo tiempo no deja un producto activo en una categoría apagada', async () => {
    for (let round = 0; round < 5; round++) {
      await resetDatabase(prisma);
      w = await setupWorld(prisma);
      const { category, subcategory } = await seedCatalog(prisma);
      const [off, add] = await Promise.all([
        w.client.patch(`/api/categories/${category.id}`, { isActive: false }, w.owner),
        w.client.post(
          '/api/products',
          { name: 'Nuevo', saleUnit: 'UNIT', subcategoryId: subcategory.id, salePrice: '100' },
          w.owner,
        ),
      ]);
      const cat = await prisma.category.findUniqueOrThrow({ where: { id: category.id } });
      const active = await prisma.product.count({
        where: { isActive: true, subcategory: { categoryId: category.id } },
      });
      // O ganó la desactivación (y el alta dio 422) o ganó el alta (y la desactivación dio 422).
      expect(!cat.isActive && active > 0, `ronda ${round}`).toBe(false);
      expect([off.status, add.status].sort(), `ronda ${round}`).toEqual(
        cat.isActive ? [201, 422] : [200, 422],
      );
    }
  });
});

describe('subcategorías', () => {
  it('el encargado la crea sin margen (hereda); con marginPercent, 403 con details.fields', async () => {
    const { category } = await seedCatalog(prisma);
    const ok = await w.client.post(
      `/api/categories/${category.id}/subcategories`,
      { name: 'Alfajores' },
      w.manager,
    );
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({
      categoryId: category.id,
      name: 'Alfajores',
      marginPercent: null,
      activeProductCount: 0,
    });
    for (const marginPercent of ['50', null]) {
      const res = await w.client.post(
        `/api/categories/${category.id}/subcategories`,
        { name: 'Otra', marginPercent },
        w.manager,
      );
      expect(res.status).toBe(403);
      expect(res.body.error.details).toEqual({ fields: ['marginPercent'] });
    }
  });

  it('el dueño la crea con margen y después se lo saca con null (vuelve a heredar)', async () => {
    const { category } = await seedCatalog(prisma);
    const sub = await w.client.post(
      `/api/categories/${category.id}/subcategories`,
      { name: 'Alfajores', marginPercent: '55' },
      w.owner,
    );
    expect(sub.status).toBe(201);
    expect(sub.body.marginPercent).toBe('55.00');
    const res = await w.client.patch(
      `/api/subcategories/${sub.body.id}`,
      { marginPercent: null },
      w.owner,
    );
    expect(res.status).toBe(200);
    expect(res.body.marginPercent).toBeNull();
    const [, log] = await audits('SUBCATEGORY_UPDATE').then((l) => [null, ...l]);
    expect(log?.details).toEqual({
      before: { marginPercent: '55.00' },
      after: { marginPercent: null },
    });
  });

  it('el encargado no cambia el margen de una subcategoría (403), pero sí el nombre', async () => {
    const { subcategory } = await seedCatalog(prisma);
    expect(
      (
        await w.client.patch(
          `/api/subcategories/${subcategory.id}`,
          { marginPercent: '10' },
          w.manager,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await w.client.patch(
          `/api/subcategories/${subcategory.id}`,
          { name: 'Bombones' },
          w.manager,
        )
      ).status,
    ).toBe(200);
  });

  it('nombre único dentro de la categoría sin distinguir mayúsculas; en otra categoría se puede repetir', async () => {
    const { category } = await seedCatalog(prisma);
    const dup = await w.client.post(
      `/api/categories/${category.id}/subcategories`,
      { name: 'CHOCOLATES' },
      w.owner,
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('SUBCATEGORY_NAME_TAKEN');
    const other = await w.client.post(
      '/api/categories',
      { name: 'Otra', marginPercent: '10' },
      w.owner,
    );
    expect(
      (
        await w.client.post(
          `/api/categories/${other.body.id}/subcategories`,
          { name: 'Chocolates' },
          w.owner,
        )
      ).status,
    ).toBe(201);
  });

  it('no se crea en una categoría desactivada (422) ni en una que no existe (404)', async () => {
    const { category } = await seedCatalog(prisma);
    await prisma.category.update({ where: { id: category.id }, data: { isActive: false } });
    const res = await w.client.post(
      `/api/categories/${category.id}/subcategories`,
      { name: 'Nueva' },
      w.owner,
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CATEGORY_INACTIVE');
    expect(
      (await w.client.post('/api/categories/999/subcategories', { name: 'Nueva' }, w.owner)).status,
    ).toBe(404);
  });

  it('no se puede cambiar de categoría: categoryId es un campo desconocido (400)', async () => {
    const { subcategory } = await seedCatalog(prisma);
    const res = await w.client.patch(
      `/api/subcategories/${subcategory.id}`,
      { categoryId: 2 },
      w.owner,
    );
    expect(res.status).toBe(400);
  });
});
