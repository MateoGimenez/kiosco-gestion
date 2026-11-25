// Etapa 2: los CHECK y los índices de la base atajan un dato inválido aunque el servicio fallara
// (se escribe directo con SQL, salteando la API). docs/modelo-datos.md, secciones 2.2 a 2.9.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { seedCatalog, seedProduct, seedUser } from './etapa2-helpers';

const prisma = createTestPrisma();
let subId: number;
let userId: number;
let productId: number;

beforeEach(async () => {
  await resetDatabase(prisma);
  userId = (await seedUser(prisma, 'dueno', 'OWNER')).id;
  const cat = await seedCatalog(prisma);
  subId = cat.subcategory.id;
  productId = (await seedProduct(prisma, subId, { barcode: '111' })).id;
});
afterAll(() => prisma.$disconnect());

/** Intenta un cambio directo y espera que la base lo rechace por la restricción indicada. */
async function rejects(promise: Promise<unknown>, constraint?: string) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e as Error,
  );
  expect(err, 'la base tendría que haber rechazado el dato').not.toBeNull();
  if (constraint) expect(`${err?.message} ${JSON.stringify(err)}`).toContain(constraint);
}

const movement = (over: {
  type?: string;
  reason?: string | null;
  quantity: string;
  after?: string;
  note?: string | null;
}) =>
  prisma.$executeRaw`
    INSERT INTO stock_movements (product_id, type, quantity, stock_after, adjustment_reason, note, user_id)
    VALUES (${productId}, ${over.type ?? 'ADJUSTMENT'}::stock_movement_type, ${over.quantity}::numeric,
            ${over.after ?? '10'}::numeric, ${over.reason === undefined ? 'BREAKAGE' : over.reason}::stock_adjustment_reason,
            ${over.note ?? null}, ${userId})`;

describe('stock_movements', () => {
  it('H-29: rotura, faltante y consumo propio con cantidad positiva', async () => {
    for (const reason of ['BREAKAGE', 'MISSING', 'OWN_CONSUMPTION']) {
      await rejects(movement({ reason, quantity: '2' }), 'stock_movements_reason_sign_check');
    }
  });

  it('H-29: carga inicial con cantidad negativa', async () => {
    await rejects(
      movement({ reason: 'INITIAL_LOAD', quantity: '-2' }),
      'stock_movements_reason_sign_check',
    );
  });

  it('H-29: conteo y "otro" aceptan los dos signos', async () => {
    await movement({ reason: 'COUNT_CORRECTION', quantity: '-2' });
    await movement({ reason: 'COUNT_CORRECTION', quantity: '2' });
    await movement({ reason: 'OTHER', quantity: '-2', note: 'a' });
    await movement({ reason: 'OTHER', quantity: '2', note: 'b' });
    await movement({ reason: 'INITIAL_LOAD', quantity: '2' });
    await movement({ reason: 'BREAKAGE', quantity: '-2' });
    expect(await prisma.stockMovement.count()).toBe(6);
  });

  it('H-28: un conteo no puede dejar el stock negativo (stock_after >= 0)', async () => {
    await rejects(
      movement({ reason: 'COUNT_CORRECTION', quantity: '-5', after: '-1' }),
      'stock_movements_count_nonnegative_check',
    );
  });

  it('un movimiento no puede ser 0', async () => {
    await rejects(
      movement({ reason: 'OTHER', quantity: '0', note: 'x' }),
      'stock_movements_quantity_nonzero_check',
    );
  });

  it('motivo "otro" sin nota', async () => {
    await rejects(
      movement({ reason: 'OTHER', quantity: '1' }),
      'stock_movements_other_requires_note_check',
    );
  });

  it('un ajuste sin motivo, o un motivo en un movimiento que no es ajuste', async () => {
    await rejects(
      movement({ reason: null, quantity: '1' }),
      'stock_movements_adjustment_reason_check',
    );
    await rejects(
      prisma.$executeRaw`
        INSERT INTO stock_movements (product_id, type, quantity, stock_after, adjustment_reason, sale_item_id, user_id)
        VALUES (${productId}, 'SALE', -1, 9, 'BREAKAGE', 1, ${userId})`,
      'stock_movements_adjustment_reason_check',
    );
  });

  it('una venta o una compra sin su línea de origen, o con el signo al revés', async () => {
    await rejects(
      prisma.$executeRaw`INSERT INTO stock_movements (product_id, type, quantity, stock_after, user_id) VALUES (${productId}, 'SALE', -1, 9, ${userId})`,
      'stock_movements_sale_item_check',
    );
    await rejects(
      prisma.$executeRaw`INSERT INTO stock_movements (product_id, type, quantity, stock_after, purchase_item_id, user_id) VALUES (${productId}, 'PURCHASE', -1, 9, 1, ${userId})`,
      'stock_movements_type_sign_check',
    );
  });
});

describe('products', () => {
  const update = (set: string) =>
    prisma.$executeRawUnsafe(`UPDATE products SET ${set} WHERE id = ${productId}`);

  it.each([
    ['net_cost_price = -1, cost_price = 0', 'products_net_cost_price_check'],
    ['cost_price = 10', 'products_cost_price_check'], // el costo final no puede ser menor que el neto (1000)
    ['sale_price = -1', 'products_sale_price_check'],
    ['vat_rate_percent = 101', 'products_vat_rate_percent_check'],
    ['margin_percent = -5', 'products_margin_percent_check'],
    ['min_stock = -1', 'products_min_stock_check'],
    ['units_per_pack = 0', 'products_units_per_pack_check'],
  ])('rechaza %s', async (set, constraint) => {
    await rejects(update(set), constraint);
  });

  it('"Varios": sin costo y sin stock, y uno solo en todo el sistema', async () => {
    await rejects(
      update('is_miscellaneous = true'),
      'products_miscellaneous_no_cost_no_stock_check',
    );
    await seedProduct(prisma, subId, {
      name: 'Varios',
      isMiscellaneous: true,
      netCostPrice: '0',
      costPrice: '0',
      salePrice: '0',
    });
    await rejects(
      seedProduct(prisma, subId, {
        name: 'Varios 2',
        isMiscellaneous: true,
        netCostPrice: '0',
        costPrice: '0',
        salePrice: '0',
      }),
      'products_single_miscellaneous',
    );
    await rejects(
      prisma.$executeRaw`UPDATE products SET stock_quantity = 3 WHERE is_miscellaneous`,
      'products_miscellaneous_no_cost_no_stock_check',
    );
  });

  it('código de barras único (también contra desactivados)', async () => {
    await rejects(seedProduct(prisma, subId, { name: 'Otro', barcode: '111' }));
    await prisma.product.update({ where: { id: productId }, data: { isActive: false } });
    await rejects(seedProduct(prisma, subId, { name: 'Otro', barcode: '111' }));
  });
});

describe('categorías y subcategorías', () => {
  it('nombres únicos sin distinguir mayúsculas', async () => {
    await rejects(
      prisma.$executeRaw`INSERT INTO categories (name, margin_percent, updated_at) VALUES ('GOLOSINAS', 10, now())`,
      'categories_name_ci',
    );
    const category = await prisma.category.findFirstOrThrow();
    await rejects(
      prisma.$executeRaw`INSERT INTO subcategories (category_id, name, updated_at) VALUES (${category.id}, 'chocolates', now())`,
      'subcategories_category_name_ci',
    );
    // En otra categoría el mismo nombre sí vale.
    const other = await prisma.category.create({ data: { name: 'Otra', marginPercent: '1' } });
    await prisma.$executeRaw`INSERT INTO subcategories (category_id, name, updated_at) VALUES (${other.id}, 'chocolates', now())`;
  });

  it('márgenes negativos', async () => {
    await rejects(
      prisma.$executeRaw`UPDATE categories SET margin_percent = -1`,
      'categories_margin_percent_check',
    );
    await rejects(
      prisma.$executeRaw`UPDATE subcategories SET margin_percent = -1`,
      'subcategories_margin_percent_check',
    );
  });
});

describe('settings y price_changes', () => {
  it('una sola fila, redondeo no negativo y hora de corte dentro del día', async () => {
    await rejects(
      prisma.$executeRaw`INSERT INTO settings (id, updated_at) VALUES (2, now())`,
      'settings_single_row_check',
    );
    await rejects(
      prisma.$executeRaw`UPDATE settings SET price_rounding_step = -1`,
      'settings_price_rounding_step_check',
    );
    await rejects(
      prisma.$executeRaw`UPDATE settings SET business_day_cutoff_minutes = 1440`,
      'settings_cutoff_minutes_check',
    );
    await rejects(
      prisma.$executeRaw`UPDATE settings SET business_day_cutoff_minutes = -1`,
      'settings_cutoff_minutes_check',
    );
  });

  it('un cambio de compra o de aumento masivo tiene que decir de cuál viene', async () => {
    await rejects(
      prisma.$executeRaw`
        INSERT INTO price_changes (product_id, source, old_net_cost_price, new_net_cost_price, old_cost_price, new_cost_price, old_sale_price, new_sale_price, user_id)
        VALUES (${productId}, 'PURCHASE', 1, 1, 1, 1, 1, 1, ${userId})`,
      'price_changes_purchase_source_check',
    );
    await rejects(
      prisma.$executeRaw`
        INSERT INTO price_changes (product_id, source, old_net_cost_price, new_net_cost_price, old_cost_price, new_cost_price, old_sale_price, new_sale_price, user_id)
        VALUES (${productId}, 'BULK_UPDATE', 1, 1, 1, 1, 1, 1, ${userId})`,
      'price_changes_bulk_source_check',
    );
  });
});
