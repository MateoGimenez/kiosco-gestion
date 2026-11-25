// Tests extra de cierre de la etapa 1 (QA): sesiones y cambio de contraseña, contra `kiosco_test`.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import { hashPassword } from '../src/modules/auth/password';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { buildTestApp, clientFor, sessionCookie, testConfig } from './helpers';

const prisma: PrismaClient = createTestPrisma();
const PASSWORD = 'clave-segura-1';

async function seedUser(username: string, role: 'OWNER' | 'MANAGER' | 'EMPLOYEE') {
  return prisma.user.create({
    data: {
      username,
      fullName: `Usuario ${username}`,
      role,
      passwordHash: await hashPassword(PASSWORD, 4),
    },
  });
}

let local: ReturnType<typeof clientFor>;
let remote: ReturnType<typeof clientFor>;
beforeEach(async () => {
  await resetDatabase(prisma);
  const loginLimiter = new LoginLimiter(testConfig().login);
  local = clientFor(buildTestApp('local', { prisma, loginLimiter }), 'local');
  remote = clientFor(buildTestApp('remote', { prisma, loginLimiter }), 'remote');
});
afterAll(() => prisma.$disconnect());

async function loginRes(door: typeof local, username: string, password = PASSWORD) {
  const res = await door.post('/api/auth/login', { username, password });
  expect(res.status).toBe(200);
  return res;
}

describe('cierre etapa 1: sesiones y cambio de contraseña', () => {
  it('cambiar la contraseña no alarga la sesión: el vencimiento queda igual', async () => {
    await seedUser('maria', 'MANAGER');
    const first = await loginRes(local, 'maria');
    const cookie = sessionCookie(first);
    const res = await local.post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'clave-nueva-22' },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(res.body.expiresAt).toBe(first.body.expiresAt);
  });

  it('un usuario creado por el dueño entra con mustChangePassword=true en la respuesta del login', async () => {
    await seedUser('dueno', 'OWNER');
    const ownerCookie = sessionCookie(await loginRes(local, 'dueno'));
    await local.post(
      '/api/users',
      { username: 'nuevo', fullName: 'Nuevo', role: 'EMPLOYEE', password: 'clave-inicial-1' },
      ownerCookie,
    );
    const res = await loginRes(local, 'nuevo', 'clave-inicial-1');
    expect(res.body.user.mustChangePassword).toBe(true);
  });

  it('bajar de rol a alguien con sesión abierta le cambia los permisos en el próximo pedido', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const boss = await seedUser('jefa', 'OWNER');
    const ownerCookie = sessionCookie(await loginRes(local, 'dueno'));
    const bossCookie = sessionCookie(await loginRes(local, 'jefa'));
    expect((await local.get('/api/users', bossCookie)).status).toBe(200);
    const res = await local.patch(`/api/users/${boss.id}`, { role: 'EMPLOYEE' }, ownerCookie);
    expect(res.status).toBe(200);
    expect((await local.get('/api/users', bossCookie)).status).toBe(403);
    expect((await local.get('/api/auth/me', bossCookie)).body.user.role).toBe('EMPLOYEE');
    expect(owner.id).not.toBe(boss.id);
  });

  it('un empleado bajado de rol con sesión en la puerta remota deja de poder usarla', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const mariaRemote = sessionCookie(await loginRes(remote, 'maria'));
    const ownerCookie = sessionCookie(await loginRes(local, 'dueno'));
    expect((await remote.get('/api/auth/me', mariaRemote)).status).toBe(200);
    await local.patch(`/api/users/${maria.id}`, { role: 'EMPLOYEE' }, ownerCookie);
    expect((await remote.get('/api/auth/me', mariaRemote)).status).toBe(401);
    expect(owner.id).toBeGreaterThan(0);
  });

  it('cambiar la contraseña con la actual mal en la puerta remota también cuenta como intento', async () => {
    await seedUser('maria', 'MANAGER');
    const cookie = sessionCookie(await loginRes(remote, 'maria'));
    const res = await remote.post(
      '/api/auth/change-password',
      { currentPassword: 'no-es-esa-123', newPassword: 'clave-nueva-22' },
      cookie,
    );
    expect(res.status).toBe(422);
    expect(res.body.error.details.remainingAttempts).toBe(4);
  });
});
