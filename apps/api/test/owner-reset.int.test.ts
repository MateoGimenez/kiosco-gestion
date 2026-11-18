// `owner:reset` (USR-04): lógica con un guion de respuestas, contra `kiosco_test`.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';
import { runOwnerReset, type Prompter } from '../src/modules/users/owner-reset';
import { createTestPrisma, resetDatabase } from './db/test-db';

const prisma: PrismaClient = createTestPrisma();

/** Guion: responde en orden a las preguntas (visibles y ocultas). */
function scripted(answers: string[]) {
  const said: string[] = [];
  const queue = [...answers];
  const io: Prompter = {
    ask: () => Promise.resolve(queue.shift() ?? ''),
    askHidden: () => Promise.resolve(queue.shift() ?? ''),
    say: (m) => void said.push(m),
  };
  return { io, said };
}

const audit = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

beforeEach(() => resetDatabase(prisma));
afterAll(() => prisma.$disconnect());

describe('runOwnerReset', () => {
  it('crea un dueño nuevo y audita USER_CREATE con channel SCRIPT', async () => {
    const { io } = scripted(['  Dueno ', 'Ana Dueña', 'clave-larga-1', 'clave-larga-1']);
    expect(await runOwnerReset(prisma, io, 4)).toBe('CREATED');
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'dueno' } });
    expect(user).toMatchObject({ role: 'OWNER', isActive: true, fullName: 'Ana Dueña' });
    expect(await verifyPassword('clave-larga-1', user.passwordHash)).toBe(true);
    const [log] = await audit('USER_CREATE');
    expect(log).toMatchObject({
      channel: 'SCRIPT',
      userId: null,
      ipAddress: null,
      entityId: String(user.id),
    });
  });

  it('resetea a un dueño existente: sube tokenVersion, audita PASSWORD_RESET y no pide nombre', async () => {
    const owner = await prisma.user.create({
      data: {
        username: 'dueno',
        fullName: 'Ana',
        role: 'OWNER',
        passwordHash: await hashPassword('vieja-clave', 4),
      },
    });
    const { io } = scripted(['dueno', 'nueva-clave-1', 'nueva-clave-1']);
    expect(await runOwnerReset(prisma, io, 4)).toBe('RESET');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    expect(after.tokenVersion).toBe(1);
    expect(await verifyPassword('nueva-clave-1', after.passwordHash)).toBe(true);
    expect((await audit('PASSWORD_RESET'))[0]).toMatchObject({ channel: 'SCRIPT', userId: null });
    expect(await audit('USER_UPDATE')).toHaveLength(0);
  });

  it('reactiva a un dueño desactivado y audita USER_UPDATE', async () => {
    await prisma.user.create({
      data: {
        username: 'dueno',
        fullName: 'Ana',
        role: 'OWNER',
        isActive: false,
        passwordHash: 'x',
      },
    });
    const { io } = scripted(['dueno', 'nueva-clave-1', 'nueva-clave-1']);
    expect(await runOwnerReset(prisma, io, 4)).toBe('RESET');
    expect((await prisma.user.findUniqueOrThrow({ where: { username: 'dueno' } })).isActive).toBe(
      true,
    );
    const [log] = await audit('USER_UPDATE');
    expect(log!.details).toEqual({ before: { isActive: false }, after: { isActive: true } });
    expect(log!.channel).toBe('SCRIPT');
  });

  it('si el usuario existe y no es dueño, no cambia nada', async () => {
    await prisma.user.create({
      data: { username: 'maria', fullName: 'M', role: 'MANAGER', passwordHash: 'hash-original' },
    });
    const { io, said } = scripted(['maria', 'nueva-clave-1', 'nueva-clave-1']);
    expect(await runOwnerReset(prisma, io, 4)).toBe('NOT_OWNER');
    const user = await prisma.user.findUniqueOrThrow({ where: { username: 'maria' } });
    expect(user).toMatchObject({ role: 'MANAGER', passwordHash: 'hash-original', tokenVersion: 0 });
    expect(said.join(' ')).toMatch(/no es dueño/);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('se cancela si las contraseñas no coinciden o son cortas', async () => {
    const mismatch = scripted([
      'dueno',
      'Ana',
      'clave-larga-1',
      'otra',
      'clave-larga-1',
      'otra',
      'clave-larga-1',
      'otra',
    ]);
    expect(await runOwnerReset(prisma, mismatch.io, 4)).toBe('ABORTED');
    const short = scripted(['dueno', 'Ana', 'corta', 'corta', 'corta']);
    expect(await runOwnerReset(prisma, short.io, 4)).toBe('ABORTED');
    expect(await prisma.user.count()).toBe(0);
  });
});
