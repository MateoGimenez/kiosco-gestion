// Reglas de usuarios resueltas por el dueño (H-19 a H-22), contra PostgreSQL `kiosco_test`.
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import { hashPassword, verifyPassword } from '../src/modules/auth/password';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { buildTestApp, clientFor, sessionCookie, testConfig } from './helpers';

const prisma: PrismaClient = createTestPrisma();
const PASSWORD = 'clave-segura-1';
type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE';

async function seedUser(username: string, role: Role, extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: {
      username,
      fullName: `Usuario ${username}`,
      role,
      passwordHash: await hashPassword(PASSWORD, 4),
      ...extra,
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

async function login(door: typeof local, username: string, password = PASSWORD) {
  const res = await door.post('/api/auth/login', { username, password });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

describe('H-19: el último dueño activo', () => {
  it('no se puede desactivar ni bajar de rol al único dueño activo (422 LAST_ACTIVE_OWNER)', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const cookie = await login(local, 'dueno');
    for (const body of [{ isActive: false }, { role: 'MANAGER' }]) {
      const res = await local.patch(`/api/users/${owner.id}`, body, cookie);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('LAST_ACTIVE_OWNER');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).isActive).toBe(true);
    // Cambiar el nombre sí se puede.
    expect(
      (await local.patch(`/api/users/${owner.id}`, { fullName: 'Nuevo' }, cookie)).status,
    ).toBe(200);
  });

  it('un dueño desactivado no cuenta: con otro dueño inactivo sigue siendo el último', async () => {
    const a = await seedUser('dueno', 'OWNER');
    await seedUser('viejo', 'OWNER', { isActive: false });
    const cookie = await login(local, 'dueno');
    expect((await local.patch(`/api/users/${a.id}`, { role: 'MANAGER' }, cookie)).status).toBe(422);
  });

  it('con dos dueños activos se puede bajar a uno', async () => {
    await seedUser('dueno1', 'OWNER');
    const b = await seedUser('dueno2', 'OWNER');
    const cookie = await login(local, 'dueno1');
    expect((await local.patch(`/api/users/${b.id}`, { isActive: false }, cookie)).status).toBe(200);
  });

  it('carrera: dos dueños que se bajan entre sí al mismo tiempo nunca dejan cero dueños', async () => {
    for (let round = 0; round < 6; round++) {
      await resetDatabase(prisma);
      const a = await seedUser('dueno1', 'OWNER');
      const b = await seedUser('dueno2', 'OWNER');
      const ca = await login(local, 'dueno1');
      const cb = await login(local, 'dueno2');
      const body = round % 2 === 0 ? { isActive: false } : { role: 'MANAGER' };
      const [r1, r2] = await Promise.all([
        local.patch(`/api/users/${b.id}`, body, ca),
        local.patch(`/api/users/${a.id}`, body, cb),
      ]);
      // Uno gana (200). El otro recibe 422, o 401 si el ganador lo desactivó antes de que se autenticara.
      const statuses = [r1.status, r2.status].sort();
      expect(statuses[0], `ronda ${round}`).toBe(200);
      expect([401, 422], `ronda ${round}`).toContain(statuses[1]);
      const owners = await prisma.user.count({ where: { role: 'OWNER', isActive: true } });
      expect(owners, `ronda ${round}`).toBe(1);
    }
  });
});

describe('H-20: cambios desde la puerta remota', () => {
  it('no se puede subir de rol ni reactivar desde afuera (403 LOCAL_ONLY); desde el local sí', async () => {
    await seedUser('dueno', 'OWNER');
    const manager = await seedUser('maria', 'MANAGER');
    const employee = await seedUser('juan', 'EMPLOYEE');
    const off = await seedUser('baja', 'EMPLOYEE', { isActive: false });
    const cookie = await login(remote, 'dueno');

    for (const [id, body] of [
      [manager.id, { role: 'OWNER' }],
      [employee.id, { role: 'MANAGER' }],
      [employee.id, { role: 'OWNER' }],
      [off.id, { isActive: true }],
    ] as const) {
      const res = await remote.patch(`/api/users/${id}`, body, cookie);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe('LOCAL_ONLY');
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: employee.id } })).role).toBe(
      'EMPLOYEE',
    );
    expect((await prisma.user.findUniqueOrThrow({ where: { id: off.id } })).isActive).toBe(false);

    // Desde el local, el mismo cambio funciona.
    const localCookie = await login(local, 'dueno');
    expect(
      (await local.patch(`/api/users/${employee.id}`, { role: 'MANAGER' }, localCookie)).status,
    ).toBe(200);
    expect(
      (await local.patch(`/api/users/${off.id}`, { isActive: true }, localCookie)).status,
    ).toBe(200);
  });

  it('desde afuera sí se puede bajar de rol, desactivar y cambiar el nombre', async () => {
    await seedUser('dueno', 'OWNER');
    const manager = await seedUser('maria', 'MANAGER');
    const other = await seedUser('juan', 'MANAGER');
    const cookie = await login(remote, 'dueno');
    expect(
      (await remote.patch(`/api/users/${manager.id}`, { role: 'EMPLOYEE' }, cookie)).status,
    ).toBe(200);
    expect((await remote.patch(`/api/users/${other.id}`, { isActive: false }, cookie)).status).toBe(
      200,
    );
    expect(
      (await remote.patch(`/api/users/${other.id}`, { fullName: 'Otro nombre' }, cookie)).status,
    ).toBe(200);
    // "Subir" a su mismo rol no es subir.
    expect(
      (await remote.patch(`/api/users/${manager.id}`, { role: 'EMPLOYEE' }, cookie)).status,
    ).toBe(200);
  });
});

describe('H-21: contraseña propia y obligación de cambiarla', () => {
  async function createdByOwner() {
    await seedUser('dueno', 'OWNER');
    const ownerCookie = await login(local, 'dueno');
    const res = await local.post(
      '/api/users',
      { username: 'nuevo', fullName: 'Nuevo', role: 'MANAGER', password: 'clave-inicial-1' },
      ownerCookie,
    );
    expect(res.status).toBe(201);
    expect(res.body.mustChangePassword).toBe(true);
    return { ownerCookie, id: res.body.id as number };
  }

  it('con mustChangePassword solo andan me, change-password y logout; el resto da 403 PASSWORD_CHANGE_REQUIRED', async () => {
    await createdByOwner();
    const cookie = await login(local, 'nuevo', 'clave-inicial-1');
    const me = await local.get('/api/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
    const blocked = await local.get('/api/users', cookie);
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await local.get('/api/health', cookie)).status).toBe(200);
    expect((await local.post('/api/auth/logout', undefined, cookie)).status).toBe(204);
  });

  it('change-password: valida, cambia, renueva la cookie, corta las otras sesiones y audita', async () => {
    await createdByOwner();
    const cookie = await login(local, 'nuevo', 'clave-inicial-1');
    const otherDevice = await login(remote, 'nuevo', 'clave-inicial-1');
    const change = (body: unknown, c = cookie) => local.post('/api/auth/change-password', body, c);

    expect(
      (await change({ currentPassword: 'clave-inicial-1', newPassword: 'corta' })).status,
    ).toBe(400);
    expect(
      (await change({ currentPassword: 'clave-inicial-1', newPassword: 'clave-inicial-1' })).status,
    ).toBe(400);
    const wrong = await change({ currentPassword: 'no-es-esa-123', newPassword: 'clave-nueva-22' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { username: 'nuevo' } })).mustChangePassword,
    ).toBe(true);

    const ok = await change({ currentPassword: 'clave-inicial-1', newPassword: 'clave-nueva-22' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.mustChangePassword).toBe(false);
    const renewed = sessionCookie(ok);

    // La cookie renovada anda y ya no hay bloqueo; la anterior y la del otro dispositivo, no.
    expect((await local.get('/api/auth/me', renewed)).body.user.mustChangePassword).toBe(false);
    expect((await local.get('/api/auth/me', cookie)).status).toBe(401);
    expect((await remote.get('/api/auth/me', otherDevice)).status).toBe(401);
    expect(
      await prisma.session.count({ where: { revokedAt: null, user: { username: 'nuevo' } } }),
    ).toBe(1);
    expect((await local.post('/api/auth/logout', undefined, renewed)).status).toBe(204);

    // La clave vieja ya no entra; la nueva sí.
    expect(
      (await local.post('/api/auth/login', { username: 'nuevo', password: 'clave-inicial-1' }))
        .status,
    ).toBe(401);
    await login(local, 'nuevo', 'clave-nueva-22');

    const [audit] = await prisma.auditLog.findMany({ where: { action: 'PASSWORD_CHANGE' } });
    expect(audit).toMatchObject({ entityType: 'User', details: {} });
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain('clave-nueva-22');
  });

  it('change-password sin sesión da 401 y los intentos con la actual mala se cuentan (bloqueo)', async () => {
    await seedUser('maria', 'MANAGER');
    expect(
      (
        await local.post('/api/auth/change-password', {
          currentPassword: 'a',
          newPassword: 'clave-nueva-22',
        })
      ).status,
    ).toBe(401);
    const cookie = await login(local, 'maria');
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await local.post(
        '/api/auth/change-password',
        { currentPassword: 'mala-clave-xx', newPassword: 'clave-nueva-22' },
        cookie,
      );
      codes.push(res.status);
    }
    expect(codes).toEqual([422, 422, 422, 422, 429, 429]);
  });

  it('resetear la contraseña de otro pone mustChangePassword; la propia no se puede resetear por la API', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const cookie = await login(local, 'dueno');
    const reset = await local.post(
      `/api/users/${maria.id}/reset-password`,
      { newPassword: 'clave-reset-12' },
      cookie,
    );
    expect(reset.body.mustChangePassword).toBe(true);
    const self = await local.post(
      `/api/users/${owner.id}/reset-password`,
      { newPassword: 'clave-propia-12' },
      cookie,
    );
    expect(self.status).toBe(422);
    expect(self.body.error.code).toBe('CANNOT_RESET_OWN_PASSWORD');
    // El camino para la propia es change-password.
    const change = await local.post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'clave-propia-12' },
      cookie,
    );
    expect(change.status).toBe(200);
  });
});

describe('change-password: auditoría y carrera', () => {
  it('audita cada intento con la actual mala (PASSWORD_CHANGE_FAILED) y el bloqueo una sola vez', async () => {
    const maria = await seedUser('maria', 'MANAGER');
    const cookie = await login(local, 'maria');
    for (let i = 0; i < 7; i++) {
      await local.post(
        '/api/auth/change-password',
        { currentPassword: 'mala-clave-xx', newPassword: 'clave-nueva-22' },
        cookie,
      );
    }
    const failed = await prisma.auditLog.findMany({ where: { action: 'PASSWORD_CHANGE_FAILED' } });
    expect(failed).toHaveLength(5); // los 2 últimos ya estaban bloqueados (solo log)
    expect(failed[0]).toMatchObject({
      userId: maria.id,
      details: { reason: 'BAD_CURRENT_PASSWORD' },
    });
    expect(await prisma.auditLog.count({ where: { action: 'LOGIN_LOCKED' } })).toBe(1);
    expect(JSON.stringify(await prisma.auditLog.findMany())).not.toContain('mala-clave-xx');
  });

  it('si la cuenta se resetea justo entre verificar y escribir, no se pisa la clave del dueño (401)', async () => {
    const maria = await seedUser('maria', 'MANAGER');
    let armed = false;
    let fired = false;
    const hooked = new Proxy(prisma, {
      get(target, prop) {
        const value = Reflect.get(target, prop) as unknown;
        if (prop === 'user') {
          return new Proxy(target.user, {
            get(users, method) {
              const fn = Reflect.get(users, method) as (...a: unknown[]) => Promise<unknown>;
              if (method !== 'findUnique') return fn.bind(users);
              return async (...args: unknown[]) => {
                const found = await fn.apply(users, args);
                if (armed && !fired) {
                  fired = true;
                  // El dueño resetea la contraseña de maría justo ahora.
                  await target.user.update({
                    where: { id: maria.id },
                    data: {
                      passwordHash: await hashPassword('clave-del-dueno-1', 4),
                      tokenVersion: { increment: 1 },
                      mustChangePassword: true,
                    },
                  });
                }
                return found;
              };
            },
          });
        }
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    });
    const door = clientFor(
      buildTestApp('local', { prisma: hooked, loginLimiter: new LoginLimiter(testConfig().login) }),
      'local',
    );
    const cookie = await login(door, 'maria');
    armed = true;
    // `me` también lee al usuario por findUnique de sesión (no por user.findUnique): no dispara el hook.
    const res = await door.post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'clave-nueva-22' },
      cookie,
    );
    expect(fired).toBe(true);
    expect(res.status).toBe(401);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: maria.id } });
    expect(await verifyPassword('clave-del-dueno-1', after.passwordHash)).toBe(true);
    expect(after.mustChangePassword).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: 'PASSWORD_CHANGE' } })).toBe(0);
  });
});

describe('H-22: mínimo de 8 caracteres', () => {
  it('se exige al crear, resetear y cambiar la propia', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const cookie = await login(local, 'dueno');
    const create = await local.post(
      '/api/users',
      { username: 'x1', fullName: 'X', role: 'EMPLOYEE', password: '1234567' },
      cookie,
    );
    expect(create.status).toBe(400);
    const reset = await local.post(
      `/api/users/${owner.id}/reset-password`,
      { newPassword: '1234567' },
      cookie,
    );
    expect(reset.status).toBe(400);
    const change = await local.post(
      '/api/auth/change-password',
      { currentPassword: PASSWORD, newPassword: '1234567' },
      cookie,
    );
    expect(change.status).toBe(400);
  });
});
