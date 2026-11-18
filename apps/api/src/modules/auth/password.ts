// Contraseñas con bcryptjs (ADR 001 y 003, punto 7). El costo sale de BCRYPT_COST.
import bcrypt from 'bcryptjs';

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcrypt.hash(password, cost);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash de relleno para comparar cuando el usuario no existe, así el login tarda lo mismo
 * y no revela quién existe. Se calcula una vez con el costo configurado.
 */
export function getDummyHash(cost: number): Promise<string> {
  dummyHash ??= bcrypt.hash(`relleno-${Math.random()}-${Date.now()}`, cost);
  return dummyHash;
}
