import { describe, expect, it } from 'vitest';
import { Decimal } from '@kiosco/shared';
import { normalizeDecimalInput } from './decimalInput';
import { chooseMargin, liveRealMargin, liveSuggestedPrice } from './pricing';
import { evaluateAdjustment } from './stockAdjustment';
import { checkMoney, checkPercent, checkQuantity } from './validation';

describe('precio sugerido en vivo', () => {
  it('costo $1.000, margen 50 %, IVA 21 % da $1.820', () => {
    expect(liveSuggestedPrice(new Decimal(1000), '50', '21', '10')?.toFixed()).toBe('1820');
  });
  it('sin costo no hay sugerido', () => {
    expect(liveSuggestedPrice(new Decimal(0), '50', '21', '10')).toBeNull();
  });
  it('con el paso en 0 no se redondea', () => {
    expect(liveSuggestedPrice(new Decimal(1000), '50', '21', '0')?.toFixed()).toBe('1815');
  });
  it('margen real de $1.900 sobre costo $1.000 con IVA 21 % es 57,02 %', () => {
    expect(liveRealMargin(new Decimal(1900), new Decimal(1000), '21')?.toFixed(2)).toBe('57.02');
  });
  it('la cadena de margen es producto, subcategoría, categoría', () => {
    expect(chooseMargin('60', '50', '40').source).toBe('PRODUCT');
    expect(chooseMargin(null, '50', '40').source).toBe('SUBCATEGORY');
    expect(chooseMargin(null, null, '40')).toEqual({ percent: '40', source: 'CATEGORY' });
  });
});

describe('lectura de números escritos a mano', () => {
  it('acepta coma decimal y punto de miles con coma', () => {
    expect(normalizeDecimalInput('12,5')).toBe('12.5');
    expect(normalizeDecimalInput('1.234,50')).toBe('1234.50');
    expect(normalizeDecimalInput('abc')).toBeNull();
    expect(normalizeDecimalInput('0,350')).toBe('0.350');
    expect(normalizeDecimalInput('-2')).toBe('-2');
    expect(normalizeDecimalInput('')).toBeNull();
  });
});

describe('punto y coma en es-AR', () => {
  it('"1.500" es mil quinientos, no 1,5', () => {
    expect(normalizeDecimalInput('1.500')).toBe('1500');
    expect(normalizeDecimalInput('12.345,67')).toBe('12345.67');
    expect(normalizeDecimalInput('1.234.567')).toBe('1234567');
  });
  it('un punto que no es de miles es inválido', () => {
    for (const bad of ['1.5', '1.50', '1.5000', '12.34', '.5', '1.500.5', '0.350', '1,5,5', '1.5,5']) {
      expect(normalizeDecimalInput(bad)).toBeNull();
    }
  });
  it('avisa que se usa la coma', () => {
    expect(checkMoney('1.5', 'El precio').error).toBe(
      'Usá coma para los decimales (ej.: 1.500,50)',
    );
    expect(checkPercent('12.5', 'El margen').error).toBe(
      'Usá coma para los decimales (ej.: 1.500,50)',
    );
    expect(checkQuantity('0.350', 'KG', 'La cantidad').error).toBe(
      'Usá coma para los decimales (ej.: 1.500,50)',
    );
    expect(checkMoney('1.500', 'El precio').value?.toFixed()).toBe('1500');
    expect(checkQuantity('0,350', 'KG', 'La cantidad').value?.toFixed()).toBe('0.35');
    const r = evaluateAdjustment({
      reason: 'BREAKAGE',
      amount: '0.350',
      direction: 'SUBTRACT',
      note: '',
      saleUnit: 'KG',
      currentStock: '3.5',
    });
    expect(r.errors.amount).toBe('Usá coma para los decimales (ej.: 1.500,50)');
  });
});

describe('ajuste de stock: signos según el motivo (H-29)', () => {
  const base = {
    amount: '2',
    direction: 'SUBTRACT' as const,
    note: '',
    saleUnit: 'UNIT' as const,
    currentStock: '24.000',
  };
  it('rotura, faltante y consumo propio restan', () => {
    for (const reason of ['BREAKAGE', 'MISSING', 'OWN_CONSUMPTION'] as const) {
      expect(evaluateAdjustment({ ...base, reason }).request).toEqual({ reason, quantity: '-2' });
    }
  });
  it('la carga inicial suma', () => {
    expect(evaluateAdjustment({ ...base, reason: 'INITIAL_LOAD' }).request).toEqual({
      reason: 'INITIAL_LOAD',
      quantity: '2',
    });
  });
  it('"otro" respeta la dirección elegida y pide nota', () => {
    expect(evaluateAdjustment({ ...base, reason: 'OTHER' }).errors.note).toBeDefined();
    const ok = evaluateAdjustment({ ...base, reason: 'OTHER', direction: 'ADD', note: 'Regalo' });
    expect(ok.request).toEqual({ reason: 'OTHER', quantity: '2', note: 'Regalo' });
  });
  it('el conteo manda lo contado y calcula la diferencia', () => {
    const r = evaluateAdjustment({ ...base, reason: 'COUNT_CORRECTION', amount: '19' });
    expect(r.request).toEqual({ reason: 'COUNT_CORRECTION', countedQuantity: '19' });
    expect(r.delta?.toFixed()).toBe('-5');
    expect(r.after?.toFixed()).toBe('19');
  });
  it('rechaza signo escrito, cero y decimales en productos por unidad', () => {
    expect(
      evaluateAdjustment({ ...base, reason: 'BREAKAGE', amount: '-2' }).errors.amount,
    ).toBeDefined();
    expect(
      evaluateAdjustment({ ...base, reason: 'BREAKAGE', amount: '0' }).errors.amount,
    ).toBeDefined();
    expect(
      evaluateAdjustment({ ...base, reason: 'BREAKAGE', amount: '1,5' }).errors.amount,
    ).toMatch(/enteros/);
    expect(
      evaluateAdjustment({ ...base, reason: 'BREAKAGE', amount: '1,5', saleUnit: 'KG' }).errors
        .amount,
    ).toBeUndefined();
  });
});
