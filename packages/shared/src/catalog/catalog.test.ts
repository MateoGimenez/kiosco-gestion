// Esquemas de la etapa 2 (productos, stock, configuración) y cadena de margen.
import { describe, expect, it } from 'vitest';
import {
  CreateCategoryRequestSchema,
  CreateProductRequestSchema,
  CreateStockAdjustmentRequestSchema,
  IdParamSchema,
  MoneyInputSchema,
  PercentInputSchema,
  ProductListQuerySchema,
  ProductPublicSchema,
  ProductSearchQuerySchema,
  QuantityInputSchema,
  SettingsSchema,
  SignedQuantityInputSchema,
  StockMovementListQuerySchema,
  UpdateProductRequestSchema,
  UpdateSettingsRequestSchema,
  VatRateInputSchema,
  effectiveMargin,
  suggestedPrice,
} from '..';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) =>
  schema.safeParse(v).success;

describe('effectiveMargin (PA-22)', () => {
  it('producto, si no subcategoría, si no categoría', () => {
    expect(effectiveMargin('100', '50', '40')).toMatchObject({ source: 'PRODUCT' });
    expect(effectiveMargin(null, '50', '40')).toMatchObject({ source: 'SUBCATEGORY' });
    expect(effectiveMargin(null, null, '40')).toMatchObject({ source: 'CATEGORY' });
    expect(effectiveMargin(undefined, undefined, '40').percent.toFixed(2)).toBe('40.00');
  });

  it('un margen de 0 es un valor (no hereda)', () => {
    expect(effectiveMargin('0', '50', '40')).toMatchObject({ source: 'PRODUCT' });
    expect(effectiveMargin(null, '0.00', '40')).toMatchObject({ source: 'SUBCATEGORY' });
  });

  it('se usa con suggestedPrice: $1.000 con 50 % e IVA 21 % -> $1.820', () => {
    const m = effectiveMargin(null, '50', '40');
    expect(suggestedPrice('1000', m.percent, '21', '10').toFixed(2)).toBe('1820.00');
  });
});

describe('entradas numéricas: siempre string', () => {
  it('dinero', () => {
    for (const v of ['0', '1440', '1440.5', '1440.50', '999999999999.99'])
      expect(ok(MoneyInputSchema, v), v).toBe(true);
    for (const v of [1440, '1.234', '-1', '', '1,5', ' 1', '1e3', '9999999999999', null])
      expect(ok(MoneyInputSchema, v), String(v)).toBe(false);
  });

  it('cantidades y cantidades con signo', () => {
    expect(ok(QuantityInputSchema, '0.350')).toBe(true);
    expect(ok(QuantityInputSchema, '0.3501')).toBe(false);
    expect(ok(QuantityInputSchema, '-1')).toBe(false);
    expect(ok(SignedQuantityInputSchema, '-2')).toBe(true);
    expect(ok(SignedQuantityInputSchema, '2.500')).toBe(true);
    for (const v of ['0', '-0', '0.000', '-0.000', 2, '--2'])
      expect(ok(SignedQuantityInputSchema, v), String(v)).toBe(false);
  });

  it('porcentajes y alícuotas de IVA', () => {
    expect(ok(PercentInputSchema, '9999.99')).toBe(true);
    expect(ok(PercentInputSchema, '10000')).toBe(false);
    expect(ok(PercentInputSchema, 40)).toBe(false);
    for (const v of ['0', '2.5', '2.50', '5', '10.5', '10.50', '21', '21.00', '27'])
      expect(ok(VatRateInputSchema, v), v).toBe(true);
    for (const v of ['20', '21.5', '100', '-21', 21, ''])
      expect(ok(VatRateInputSchema, v), String(v)).toBe(false);
  });

  it('ids de la ruta', () => {
    expect(IdParamSchema.parse({ id: '15' })).toEqual({ id: 15 });
    for (const id of ['0', '-1', '1.5', 'abc', '2147483648', ''])
      expect(ok(IdParamSchema, { id }), id).toBe(false);
  });
});

describe('ajuste de stock: unión por motivo (H-28, H-29)', () => {
  const parse = (v: unknown) => CreateStockAdjustmentRequestSchema.safeParse(v);

  it('acepta cada motivo con su forma', () => {
    expect(parse({ reason: 'BREAKAGE', quantity: '-2' }).success).toBe(true);
    expect(parse({ reason: 'MISSING', quantity: '-0.5', note: 'robo' }).success).toBe(true);
    expect(parse({ reason: 'OWN_CONSUMPTION', quantity: '-1', note: null }).success).toBe(true);
    expect(parse({ reason: 'INITIAL_LOAD', quantity: '10' }).success).toBe(true);
    expect(parse({ reason: 'OTHER', quantity: '3', note: 'Regalo' }).success).toBe(true);
    expect(parse({ reason: 'OTHER', quantity: '-3', note: 'Muestra' }).success).toBe(true);
    expect(parse({ reason: 'COUNT_CORRECTION', countedQuantity: '19' }).success).toBe(true);
    expect(parse({ reason: 'COUNT_CORRECTION', countedQuantity: '0' }).success).toBe(true);
  });

  it('signo equivocado: error en `quantity`', () => {
    for (const reason of ['BREAKAGE', 'MISSING', 'OWN_CONSUMPTION']) {
      const r = parse({ reason, quantity: '2' });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.path).toEqual(['quantity']);
    }
    const initial = parse({ reason: 'INITIAL_LOAD', quantity: '-2' });
    expect(initial.success).toBe(false);
    if (!initial.success) expect(initial.error.issues[0]?.path).toEqual(['quantity']);
  });

  it('el mensaje de la rotura es el del contrato', () => {
    const r = parse({ reason: 'BREAKAGE', quantity: '2' });
    if (!r.success)
      expect(r.error.issues[0]?.message).toBe('La rotura resta stock: usá un número negativo.');
  });

  it('"otro" sin nota: error en `note`', () => {
    for (const note of [undefined, '', '   ', null]) {
      const r = parse({ reason: 'OTHER', quantity: '1', note });
      expect(r.success, String(note)).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.path).toEqual(['note']);
    }
  });

  it('campos que no corresponden al motivo, y otros inválidos', () => {
    for (const v of [
      { reason: 'COUNT_CORRECTION', quantity: '-1' },
      { reason: 'COUNT_CORRECTION', countedQuantity: '1', quantity: '1' },
      { reason: 'COUNT_CORRECTION', countedQuantity: '-1' },
      { reason: 'BREAKAGE', countedQuantity: '1' },
      { reason: 'BREAKAGE', quantity: '-1', extra: 1 },
      { reason: 'BREAKAGE', quantity: '0' },
      { reason: 'BREAKAGE', quantity: '-1', note: 'x'.repeat(501) },
      { reason: 'NOPE', quantity: '-1' },
      { quantity: '-1' },
      {},
    ]) {
      expect(parse(v).success, JSON.stringify(v)).toBe(false);
    }
  });

  it('la nota se recorta y una nota vacía opcional queda en null', () => {
    const r = parse({ reason: 'BREAKAGE', quantity: '-1', note: '  se cayó  ' });
    expect(r.success && r.data.note).toBe('se cayó');
    const empty = parse({ reason: 'BREAKAGE', quantity: '-1', note: '   ' });
    expect(empty.success && empty.data.note).toBeNull();
  });
});

describe('requests de productos (estrictos)', () => {
  const base = { name: 'Chocolate', saleUnit: 'UNIT', subcategoryId: 4, salePrice: '1820' };

  it('alta mínima y completa', () => {
    expect(ok(CreateProductRequestSchema, base)).toBe(true);
    expect(
      ok(CreateProductRequestSchema, {
        ...base,
        barcode: '7790580123456',
        vatRatePercent: '21',
        netCostPrice: '1000',
        marginPercent: null,
        minStock: '6',
        unitsPerPack: '12',
        initialStock: '24',
      }),
    ).toBe(true);
  });

  it('campos que no existen en el alta -> inválido', () => {
    for (const extra of [
      { stockQuantity: '1' },
      { costPrice: '1' },
      { isMiscellaneous: true },
      { isActive: true },
      { defaultSupplierId: 1 },
    ]) {
      expect(ok(CreateProductRequestSchema, { ...base, ...extra }), JSON.stringify(extra)).toBe(
        false,
      );
    }
    expect(ok(CreateProductRequestSchema, { ...base, salePrice: undefined })).toBe(false);
  });

  it('el código de barras: "" y null son "sin código"; con espacios es inválido', () => {
    const parse = (barcode: unknown) => CreateProductRequestSchema.safeParse({ ...base, barcode });
    const empty = parse('');
    expect(empty.success && empty.data.barcode).toBeNull();
    const padded = parse('  779  ');
    expect(padded.success && padded.data.barcode).toBe('779');
    expect(parse(null).success).toBe(true);
    for (const v of ['a b', 'x'.repeat(51), 'ñ', 5])
      expect(parse(v).success, String(v)).toBe(false);
  });

  it('unitsPerPack tiene que ser mayor que 0', () => {
    expect(ok(CreateProductRequestSchema, { ...base, unitsPerPack: '0' })).toBe(false);
    expect(ok(CreateProductRequestSchema, { ...base, unitsPerPack: '0.500' })).toBe(true);
  });

  it('edición: al menos un campo y nunca stock, costo, precio ni margen', () => {
    expect(ok(UpdateProductRequestSchema, {})).toBe(false);
    expect(ok(UpdateProductRequestSchema, { isActive: false })).toBe(true);
    for (const extra of [
      { stockQuantity: '1' },
      { netCostPrice: '1' },
      { salePrice: '1' },
      { marginPercent: '1' },
      { isMiscellaneous: false },
    ]) {
      expect(ok(UpdateProductRequestSchema, { name: 'x', ...extra }), JSON.stringify(extra)).toBe(
        false,
      );
    }
  });

  it('categoría: margen obligatorio', () => {
    expect(ok(CreateCategoryRequestSchema, { name: 'Bebidas' })).toBe(false);
    expect(ok(CreateCategoryRequestSchema, { name: 'Bebidas', marginPercent: '35' })).toBe(true);
  });
});

describe('queries', () => {
  it('búsqueda: q de 1 a 100 y límite de 1 a 50 (por defecto 20)', () => {
    expect(ProductSearchQuerySchema.parse({ q: ' coca ' })).toEqual({ q: 'coca', limit: 20 });
    expect(ProductSearchQuerySchema.parse({ q: 'a', limit: '50' }).limit).toBe(50);
    for (const v of [
      { q: '' },
      { q: '   ' },
      { q: 'a'.repeat(101) },
      { q: 'a', limit: '0' },
      { q: 'a', limit: '51' },
      { q: 'a', limit: 'x' },
      { q: ['a', 'b'] },
      {},
    ]) {
      expect(ok(ProductSearchQuerySchema, v), JSON.stringify(v)).toBe(false);
    }
  });

  it('lista: valores por defecto, conversión y rechazos', () => {
    expect(ProductListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 50,
      sortBy: 'name',
      sortOrder: 'asc',
    });
    expect(
      ProductListQuerySchema.parse({
        isActive: 'false',
        needsRestock: 'true',
        categoryId: '3',
        page: '2',
        pageSize: '200',
      }),
    ).toMatchObject({
      isActive: false,
      needsRestock: true,
      categoryId: 3,
      page: 2,
      pageSize: 200,
    });
    for (const v of [
      { page: '0' },
      { pageSize: '0' },
      { pageSize: '201' },
      { sortBy: 'netCostPrice' },
      { isActive: 'si' },
      { categoryId: '0' },
      { x: '1' },
    ]) {
      expect(ok(ProductListQuerySchema, v), JSON.stringify(v)).toBe(false);
    }
  });

  it('historial: fechas reales y desde <= hasta', () => {
    expect(ok(StockMovementListQuerySchema, { from: '2026-11-01', to: '2026-11-30' })).toBe(true);
    for (const v of [
      { from: '2026-02-30' },
      { from: '2026-11-1' },
      { from: '2026-11-30', to: '2026-11-01' },
      { type: 'X' },
    ]) {
      expect(ok(StockMovementListQuerySchema, v), JSON.stringify(v)).toBe(false);
    }
  });
});

describe('configuración', () => {
  it('requests', () => {
    expect(ok(UpdateSettingsRequestSchema, { businessDayCutoff: '05:30' })).toBe(true);
    expect(ok(UpdateSettingsRequestSchema, { priceRoundingStep: '10000' })).toBe(true);
    for (const v of [
      {},
      { priceRoundingStep: '10000.01' },
      { businessDayCutoff: '5:30' },
      { businessDayCutoff: '24:00' },
      { storeName: ' ' },
      { x: 1 },
    ]) {
      expect(ok(UpdateSettingsRequestSchema, v), JSON.stringify(v)).toBe(false);
    }
  });

  it('las respuestas descartan claves de más (red de seguridad)', () => {
    const out = SettingsSchema.parse({
      storeName: 'K',
      priceRoundingStep: '10.00',
      businessDayCutoff: '06:00',
      updatedAt: 'x',
      updatedBy: null,
      secreto: 1,
    });
    expect(out).not.toHaveProperty('secreto');
    const product = ProductPublicSchema.parse({
      id: 1,
      name: 'x',
      barcode: null,
      saleUnit: 'UNIT',
      category: { id: 1, name: 'c', marginPercent: '1' },
      subcategory: { id: 1, name: 's' },
      salePrice: '1.00',
      vatRatePercent: '21.00',
      stockQuantity: '1.000',
      minStock: '0.000',
      needsRestock: false,
      unitsPerPack: null,
      isMiscellaneous: false,
      isActive: true,
      createdAt: 'x',
      updatedAt: 'x',
      netCostPrice: '5.00',
      costPrice: '6.00',
      marginPercent: '1.00',
      suggestedPrice: '9.00',
    });
    expect(Object.keys(product)).not.toContain('netCostPrice');
    expect(Object.keys(product)).not.toContain('marginPercent');
    expect(product.category).toEqual({ id: 1, name: 'c' });
  });
});
