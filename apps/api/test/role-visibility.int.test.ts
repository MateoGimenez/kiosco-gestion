// Etapa 2: el costo nunca viaja a quien no debe verlo (PA-03, docs/api/productos-stock.md, sección 2).
// Se recorren TODAS las rutas de la etapa con sesión de empleado y de encargado.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import {
  COST_KEYS,
  findKeys,
  seedCatalog,
  seedProduct,
  setupWorld,
  type World,
} from './catalog-helpers';

const prisma = createTestPrisma();
let w: World;
let productId: number;
let categoryId: number;
let subcategoryId: number;

beforeEach(async () => {
  await resetDatabase(prisma);
  w = await setupWorld(prisma);
  const cat = await seedCatalog(prisma);
  categoryId = cat.category.id;
  subcategoryId = cat.subcategory.id;
  const p = await seedProduct(prisma, cat.subcategory.id, {
    barcode: '7790001',
    marginPercent: '60',
    stockQuantity: '3',
    minStock: '10',
  });
  productId = p.id;
  await prisma.stockMovement.create({
    data: {
      productId,
      type: 'ADJUSTMENT',
      adjustmentReason: 'BREAKAGE',
      quantity: '-1',
      stockAfter: '3',
      unitNetCost: '1000',
      userId: w.ownerId,
    },
  });
  await seedProduct(prisma, cat.plain.id, { name: 'Negativo', stockQuantity: '-4' });
});
afterAll(() => prisma.$disconnect());

type Method = 'get' | 'post' | 'patch';
interface Case {
  name: string;
  method: Method;
  path: () => string;
  body?: () => unknown;
}

// Todas las rutas del contrato (sección 1). El orden de `path` es una función porque los ids se crean en cada test.
const ROUTES: Case[] = [
  { name: 'GET /api/settings', method: 'get', path: () => '/api/settings' },
  {
    name: 'PATCH /api/settings',
    method: 'patch',
    path: () => '/api/settings',
    body: () => ({ storeName: 'X' }),
  },
  { name: 'GET /api/categories', method: 'get', path: () => '/api/categories' },
  {
    name: 'POST /api/categories',
    method: 'post',
    path: () => '/api/categories',
    body: () => ({ name: 'Nueva', marginPercent: '20' }),
  },
  {
    name: 'PATCH /api/categories/:id',
    method: 'patch',
    path: () => `/api/categories/${categoryId}`,
    body: () => ({ name: 'Golosinas 2' }),
  },
  {
    name: 'POST /api/categories/:id/subcategories',
    method: 'post',
    path: () => `/api/categories/${categoryId}/subcategories`,
    body: () => ({ name: 'Nueva sub' }),
  },
  {
    name: 'PATCH /api/subcategories/:id',
    method: 'patch',
    path: () => `/api/subcategories/${subcategoryId}`,
    body: () => ({ name: 'Bombones' }),
  },
  {
    name: 'GET /api/products/search (código)',
    method: 'get',
    path: () => '/api/products/search?q=7790001',
  },
  {
    name: 'GET /api/products/search (nombre)',
    method: 'get',
    path: () => '/api/products/search?q=choco',
  },
  { name: 'GET /api/products', method: 'get', path: () => '/api/products' },
  { name: 'GET /api/products/:id', method: 'get', path: () => `/api/products/${productId}` },
  {
    name: 'POST /api/products',
    method: 'post',
    path: () => '/api/products',
    body: () => ({
      name: 'Nuevo',
      saleUnit: 'UNIT',
      subcategoryId,
      netCostPrice: '10',
      salePrice: '20',
      initialStock: '2',
    }),
  },
  {
    name: 'PATCH /api/products/:id',
    method: 'patch',
    path: () => `/api/products/${productId}`,
    body: () => ({ name: 'Editado' }),
  },
  {
    name: 'GET /api/products/:id/pricing',
    method: 'get',
    path: () => `/api/products/${productId}/pricing`,
  },
  {
    name: 'PATCH /api/products/:id/pricing',
    method: 'patch',
    path: () => `/api/products/${productId}/pricing`,
    body: () => ({ salePrice: '1900' }),
  },
  {
    name: 'GET /api/products/:id/stock-movements',
    method: 'get',
    path: () => `/api/products/${productId}/stock-movements`,
  },
  {
    name: 'POST /api/products/:id/stock-adjustments',
    method: 'post',
    path: () => `/api/products/${productId}/stock-adjustments`,
    body: () => ({ reason: 'BREAKAGE', quantity: '-1' }),
  },
  { name: 'GET /api/stock/restock', method: 'get', path: () => '/api/stock/restock' },
  { name: 'GET /api/stock/negative', method: 'get', path: () => '/api/stock/negative' },
];

/** Rutas que el empleado puede usar (todas las demás: 403). */
const EMPLOYEE_ALLOWED = new Set([
  'GET /api/settings',
  'GET /api/categories',
  'GET /api/products/search (código)',
  'GET /api/products/search (nombre)',
  'GET /api/products',
  'GET /api/products/:id',
]);

/** Rutas solo del dueño. */
const OWNER_ONLY = new Set(['PATCH /api/settings']);

/** Rutas de precios: ahí el encargado SÍ ve costos (PA-03, PRE-08). */
const MANAGER_PRICING = new Set([
  'POST /api/products',
  'GET /api/products/:id/pricing',
  'PATCH /api/products/:id/pricing',
]);

const call = (c: Case, cookie: string) => {
  const url = c.path();
  return c.method === 'get'
    ? w.client.get(url, cookie)
    : w.client[c.method](url, c.body?.(), cookie);
};

describe('el empleado no recibe costos en NINGUNA ruta', () => {
  it.each(ROUTES.map((r) => [r.name, r] as const))('%s', async (_name, route) => {
    const res = await call(route, w.employee);
    if (EMPLOYEE_ALLOWED.has(route.name)) {
      expect(res.status).toBe(200);
      // Búsqueda recursiva de cualquier clave de costo o de margen.
      const leaked = findKeys(res.body, COST_KEYS);
      expect(leaked, `${route.name} filtra ${leaked.join(', ')}`).toEqual([]);
      expect(JSON.stringify(res.body)).not.toMatch(/1000\.00|1210\.00/); // el costo ni como valor
    } else {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(findKeys(res.body, COST_KEYS)).toEqual([]);
    }
  });

  it('el listado de categorías del empleado tampoco trae conteos', async () => {
    const res = await w.client.get('/api/categories', w.employee);
    expect(findKeys(res.body, ['activeProductCount', 'hasMiscellaneousProduct'])).toEqual([]);
  });
});

describe('el encargado solo ve costos en las rutas de precios', () => {
  it.each(ROUTES.map((r) => [r.name, r] as const))('%s', async (_name, route) => {
    const res = await call(route, w.manager);
    if (OWNER_ONLY.has(route.name)) {
      expect(res.status).toBe(403);
      return;
    }
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    // Márgenes de categoría y subcategoría sí los ve el encargado (aprobado 2026-11-25).
    const isCategoryRoute =
      route.name.includes('categories') || route.name.includes('subcategories');
    const forbidden = COST_KEYS.filter((k) => !(isCategoryRoute && k === 'marginPercent'));
    const leaked = findKeys(res.body, forbidden);
    if (MANAGER_PRICING.has(route.name)) {
      expect(leaked.length, `${route.name} debería traer el costo`).toBeGreaterThan(0);
    } else {
      expect(leaked, `${route.name} filtra ${leaked.join(', ')}`).toEqual([]);
    }
  });

  it('el costo de un movimiento (unitNetCost) y el costo del producto solo salen para el dueño', async () => {
    const own = await w.client.get(`/api/products/${productId}/stock-movements`, w.owner);
    expect(own.body.items[0].unitNetCost).toBe('1000.00');
    const ownProduct = await w.client.get(`/api/products/${productId}`, w.owner);
    expect(ownProduct.body).toMatchObject({
      netCostPrice: '1000.00',
      marginPercent: '60.00',
      marginSource: 'PRODUCT',
    });
  });
});

describe('la búsqueda del mostrador nunca trae costo, ni para el dueño', () => {
  it.each([['q=7790001'], ['q=choco']])('%s', async (qs) => {
    const res = await w.client.get(`/api/products/search?${qs}`, w.owner);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(findKeys(res.body, COST_KEYS)).toEqual([]);
  });
});

describe('errores: tampoco filtran datos internos', () => {
  it('un 422 o 409 no trae costos ni SQL', async () => {
    const res = await w.client.post(
      '/api/products',
      { name: 'Dup', saleUnit: 'UNIT', subcategoryId, salePrice: '1', barcode: '7790001' },
      w.manager,
    );
    expect(res.status).toBe(409);
    expect(findKeys(res.body, COST_KEYS)).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/select |insert |prisma|stack/i);
  });
});

describe('sesión y puertas', () => {
  it('sin sesión, todas las rutas dan 401', async () => {
    for (const route of ROUTES) {
      const res = await (route.method === 'get'
        ? w.client.get(route.path())
        : w.client[route.method](route.path(), route.body?.()));
      expect(res.status, route.name).toBe(401);
    }
  });

  it('H-21: con la contraseña por cambiar, las rutas responden 403 PASSWORD_CHANGE_REQUIRED', async () => {
    await prisma.user.update({ where: { id: w.managerId }, data: { mustChangePassword: true } });
    for (const route of ROUTES.slice(0, 4)) {
      const res = await call(route, w.manager);
      expect(res.status, route.name).toBe(403);
      expect(res.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    }
  });

  it('por la puerta remota: el encargado usa productos y precios; el ajuste de stock es solo local', async () => {
    const { buildTestApp, clientFor, sessionCookie, testConfig } = await import('./helpers');
    const { LoginLimiter } = await import('../src/modules/auth/login-limiter');
    const { PASSWORD } = await import('./catalog-helpers');
    const remote = clientFor(
      buildTestApp('remote', { prisma, loginLimiter: new LoginLimiter(testConfig().login) }),
      'remote',
    );
    const login = await remote.post('/api/auth/login', {
      username: 'encargado',
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    const cookie = sessionCookie(login);
    expect((await remote.get('/api/products', cookie)).status).toBe(200);
    expect(
      (await remote.patch(`/api/products/${productId}/pricing`, { salePrice: '1999' }, cookie))
        .status,
    ).toBe(200);
    expect((await remote.get(`/api/products/${productId}/stock-movements`, cookie)).status).toBe(
      200,
    );
    // Ajustar stock: solo desde el local (ADR 003).
    const adj = await remote.post(
      `/api/products/${productId}/stock-adjustments`,
      { reason: 'BREAKAGE', quantity: '-1' },
      cookie,
    );
    expect(adj.status).toBe(403);
    expect(adj.body.error.code).toBe('LOCAL_ONLY');
    expect(
      await prisma.stockMovement.count({
        where: { adjustmentReason: 'BREAKAGE', productId, quantity: '-1' },
      }),
    ).toBe(1); // solo el movimiento sembrado
    expect(
      (await prisma.auditLog.findMany({ where: { action: 'ACCESS_DENIED' } })).length,
    ).toBeGreaterThan(0);
    // El rol se mira antes que la puerta: el empleado ni entra por la remota.
    const emp = await remote.post('/api/auth/login', { username: 'empleado', password: PASSWORD });
    expect(emp.status).not.toBe(200);
  });

  it('por la puerta local el ajuste de stock sigue funcionando', async () => {
    expect(
      (
        await w.client.post(
          `/api/products/${productId}/stock-adjustments`,
          { reason: 'BREAKAGE', quantity: '-1' },
          w.manager,
        )
      ).status,
    ).toBe(201);
  });

  it('configuración desde afuera: la hora de corte es solo local; el resto se puede cambiar', async () => {
    const { buildTestApp, clientFor, sessionCookie, testConfig } = await import('./helpers');
    const { LoginLimiter } = await import('../src/modules/auth/login-limiter');
    const { PASSWORD, seedUser } = await import('./catalog-helpers');
    const owner = await seedUser(prisma, 'dueno2', 'OWNER');
    const remote = clientFor(
      buildTestApp('remote', { prisma, loginLimiter: new LoginLimiter(testConfig().login) }),
      'remote',
    );
    const cookie = sessionCookie(
      await remote.post('/api/auth/login', { username: 'dueno2', password: PASSWORD }),
    );
    const blocked = await remote.patch(
      '/api/settings',
      { businessDayCutoff: '05:00', storeName: 'Nuevo' },
      cookie,
    );
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatchObject({
      code: 'LOCAL_ONLY',
      details: { fields: ['businessDayCutoff'] },
    });
    // No se guardó nada (ni el nombre que venía en el mismo pedido).
    expect((await prisma.setting.findUniqueOrThrow({ where: { id: 1 } })).storeName).toBe('Kiosco');
    const ok = await remote.patch(
      '/api/settings',
      { storeName: 'Nuevo', priceRoundingStep: '50' },
      cookie,
    );
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      storeName: 'Nuevo',
      priceRoundingStep: '50.00',
      businessDayCutoff: '06:00',
      updatedBy: { id: owner.id },
    });
    // Por la puerta local, el dueño sí cambia la hora de corte.
    const local = await w.client.patch('/api/settings', { businessDayCutoff: '05:00' }, w.owner);
    expect(local.status).toBe(200);
    expect(local.body.businessDayCutoff).toBe('05:00');
  });
});
