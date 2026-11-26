// Esquemas de cierre, movimientos y notas (docs/api/caja.md 10 y 11).
import { describe, expect, it } from 'vitest';
import {
  CloseCashSessionRequestSchema,
  CreateCashMovementRequestSchema,
  CreateCashSessionNoteRequestSchema,
} from './schemas';

const movement = { direction: 'OUT', reason: 'EXPENSE', description: ' Limpieza ', amount: '500' };

describe('CloseCashSessionRequestSchema', () => {
  it('acepta solo el contado (también $0) y una nota opcional', () => {
    expect(CloseCashSessionRequestSchema.parse({ countedCash: '0' })).toEqual({
      countedCash: '0',
      closingNote: null,
    });
    expect(
      CloseCashSessionRequestSchema.parse({ countedCash: '7400', closingNote: ' hola ' }),
    ).toMatchObject({ closingNote: 'hola' });
    expect(
      CloseCashSessionRequestSchema.parse({ countedCash: '1', closingNote: '  ' }).closingNote,
    ).toBeNull();
  });
  it('rechaza números de JSON, negativos, decimales de más y campos desconocidos', () => {
    for (const body of [
      { countedCash: 5 },
      { countedCash: '-1' },
      { countedCash: '1.234' },
      { countedCash: '1', expectedCash: '1' },
      {},
    ]) {
      expect(CloseCashSessionRequestSchema.safeParse(body).success).toBe(false);
    }
  });
});

describe('CreateCashMovementRequestSchema', () => {
  it('recorta la descripción y acepta cada motivo con su sentido', () => {
    expect(CreateCashMovementRequestSchema.parse(movement).description).toBe('Limpieza');
    for (const [direction, reason] of [
      ['OUT', 'OWNER_WITHDRAWAL'],
      ['IN', 'CASH_CONTRIBUTION'],
      ['IN', 'OTHER'],
      ['OUT', 'OTHER'],
    ]) {
      expect(
        CreateCashMovementRequestSchema.safeParse({ ...movement, direction, reason }).success,
      ).toBe(true);
    }
  });
  it('motivo y sentido que no coinciden: error en `direction`', () => {
    const r = CreateCashMovementRequestSchema.safeParse({
      ...movement,
      direction: 'IN',
      reason: 'OWNER_WITHDRAWAL',
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]).toMatchObject({
      path: ['direction'],
      message: 'Un retiro del dueño siempre es una salida.',
    });
  });
  it('SALE_VOID_REFUND y SUPPLIER_PAYMENT no se aceptan a mano', () => {
    for (const reason of ['SALE_VOID_REFUND', 'SUPPLIER_PAYMENT']) {
      expect(CreateCashMovementRequestSchema.safeParse({ ...movement, reason }).success).toBe(
        false,
      );
    }
  });
  it('monto mayor que 0 y descripción de 1 a 200', () => {
    for (const patch of [
      { amount: '0' },
      { amount: '0.00' },
      { description: ' ' },
      { description: 'x'.repeat(201) },
    ]) {
      expect(CreateCashMovementRequestSchema.safeParse({ ...movement, ...patch }).success).toBe(
        false,
      );
    }
  });
});

describe('CreateCashSessionNoteRequestSchema', () => {
  it('de 1 a 500 caracteres, recortada', () => {
    expect(CreateCashSessionNoteRequestSchema.parse({ note: ' ok ' }).note).toBe('ok');
    expect(CreateCashSessionNoteRequestSchema.safeParse({ note: ' ' }).success).toBe(false);
    expect(CreateCashSessionNoteRequestSchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(
      false,
    );
  });
});
