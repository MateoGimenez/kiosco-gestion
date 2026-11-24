import { describe, expect, it } from 'vitest';
import {
  CreateUserRequestSchema,
  LoginRequestSchema,
  PasswordSchema,
  UpdateUserRequestSchema,
  UserIdParamSchema,
  UsernameSchema,
  utf8Bytes,
} from './schemas';

describe('esquemas de auth', () => {
  it('UsernameSchema recorta, pasa a minúsculas y valida el formato', () => {
    expect(UsernameSchema.parse('  Juan.P ')).toBe('juan.p');
    for (const bad of ['ab', 'con espacio', 'ñandú', 'a'.repeat(31)]) {
      expect(UsernameSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('PasswordSchema: mínimo 8, máximo 72 bytes, sin trim', () => {
    expect(PasswordSchema.safeParse('1234567').success).toBe(false);
    expect(PasswordSchema.safeParse('        ').success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(72)).success).toBe(true);
    expect(PasswordSchema.safeParse('a'.repeat(73)).success).toBe(false);
    expect(PasswordSchema.safeParse('ñ'.repeat(37)).success).toBe(false); // 74 bytes
  });

  it('utf8Bytes cuenta como UTF-8', () => {
    expect([utf8Bytes('a'), utf8Bytes('ñ'), utf8Bytes('€'), utf8Bytes('😀')]).toEqual([1, 2, 3, 4]);
  });

  it('LoginRequestSchema no valida el formato del usuario y es estricto', () => {
    expect(LoginRequestSchema.parse({ username: ' X Y ', password: 'a' }).username).toBe('x y');
    expect(LoginRequestSchema.safeParse({ username: 'x', password: 'a', extra: 1 }).success).toBe(
      false,
    );
    expect(LoginRequestSchema.safeParse({ username: 'x', password: '' }).success).toBe(false);
  });

  it('CreateUserRequestSchema rechaza campos desconocidos', () => {
    const base = { username: 'juan', fullName: 'Juan', role: 'EMPLOYEE', password: 'clave-12345' };
    expect(CreateUserRequestSchema.safeParse(base).success).toBe(true);
    expect(CreateUserRequestSchema.safeParse({ ...base, isActive: true }).success).toBe(false);
  });

  it('UpdateUserRequestSchema pide al menos un campo y no admite password', () => {
    expect(UpdateUserRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserRequestSchema.safeParse({ password: 'x' }).success).toBe(false);
    expect(UpdateUserRequestSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('UserIdParamSchema: entero positivo', () => {
    expect(UserIdParamSchema.parse({ id: '15' })).toEqual({ id: 15 });
    for (const bad of ['0', '-1', '1.5', 'abc', '99999999999']) {
      expect(UserIdParamSchema.safeParse({ id: bad }).success, bad).toBe(false);
    }
  });
});

describe('ChangePasswordRequestSchema (H-21 / H-22)', () => {
  it('pide la actual, una nueva de 8+ caracteres y distinta de la actual', async () => {
    const { ChangePasswordRequestSchema: S } = await import('./schemas');
    expect(
      S.safeParse({ currentPassword: 'vieja-clave-1', newPassword: 'nueva-clave-2' }).success,
    ).toBe(true);
    expect(S.safeParse({ currentPassword: 'vieja-clave-1', newPassword: '1234567' }).success).toBe(
      false,
    );
    expect(
      S.safeParse({ currentPassword: 'misma-clave-1', newPassword: 'misma-clave-1' }).success,
    ).toBe(false);
    expect(S.safeParse({ currentPassword: '', newPassword: 'nueva-clave-2' }).success).toBe(false);
    expect(S.safeParse({ currentPassword: 'a', newPassword: 'nueva-clave-2', x: 1 }).success).toBe(
      false,
    );
  });
});
