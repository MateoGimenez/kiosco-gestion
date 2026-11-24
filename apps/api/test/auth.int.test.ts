// Integración de login, sesión, usuarios y puertas contra PostgreSQL `kiosco_test`.
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { hashPassword } from '../src/modules/auth/password';
import { createTestPrisma, resetDatabase } from './db/test-db';
import { buildTestApp, clientFor, sessionCookie, testConfig } from './helpers';

const prisma: PrismaClient = createTestPrisma();
const PASSWORD = 'clave-segura-1';

type Role = 'OWNER' | 'MANAGER' | 'EMPLOYEE';

async function seedUser(username: string, role: Role, extra: { isActive?: boolean } = {}) {
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

interface Doors {
  local: ReturnType<typeof clientFor>;
  remote: ReturnType<typeof clientFor>;
  localApp: Express;
  remoteApp: Express;
}

/** Las dos puertas comparten el contador de intentos, como en server.ts. */
async function buildDoors(configOverrides: Record<string, string> = {}): Promise<Doors> {
  const { LoginLimiter } = await import('../src/modules/auth/login-limiter');
  const loginLimiter = new LoginLimiter(testConfig(configOverrides).login);
  const opts = { prisma, loginLimiter, configOverrides };
  const localApp = buildTestApp('local', opts);
  const remoteApp = buildTestApp('remote', opts);
  return {
    local: clientFor(localApp, 'local'),
    remote: clientFor(remoteApp, 'remote'),
    localApp,
    remoteApp,
  };
}

async function loginAs(door: Doors['local'], username: string, password = PASSWORD) {
  const res = await door.post('/api/auth/login', { username, password });
  return { res, cookie: res.status === 200 ? sessionCookie(res) : '' };
}

const auditRows = (action: string) =>
  prisma.auditLog.findMany({ where: { action }, orderBy: { id: 'asc' } });

let doors: Doors;
beforeEach(async () => {
  await resetDatabase(prisma);
  doors = await buildDoors();
});
afterAll(() => prisma.$disconnect());

describe('login', () => {
  it('login correcto por la puerta local: respuesta, cookie y auditoría', async () => {
    const user = await seedUser('maria', 'MANAGER');
    const res = await doors.local.post('/api/auth/login', {
      username: '  Maria ',
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: user.id,
      username: 'maria',
      fullName: 'Usuario maria',
      role: 'MANAGER',
      mustChangePassword: false,
    });
    expect(res.body.access).toBe('LOCAL');
    const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(11.9);
    expect(hours).toBeLessThanOrEqual(12);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);

    const cookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toMatch(/^kiosco_sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).not.toMatch(/Secure/i);
    expect(cookie).not.toMatch(/Domain/i);
    expect(cookie).toMatch(/Max-Age=43200(;|$)/); // exacto, aunque el servidor tarde

    const [log] = await auditRows('LOGIN');
    expect(log).toMatchObject({ userId: user.id, channel: 'LOCAL', entityType: 'User' });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt,
    ).not.toBeNull();
  });

  it('el JWT lleva solo sub, tv, ch, sid, iat y exp', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie } = await loginAs(doors.local, 'maria');
    const payload = jwt.decode(cookie.split('=')[1]!) as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['ch', 'exp', 'iat', 'sid', 'sub', 'tv']);
    expect(payload.ch).toBe('local');
  });

  it('401 INVALID_CREDENTIALS idéntico para usuario inexistente, mala clave y usuario desactivado', async () => {
    await seedUser('maria', 'MANAGER');
    await seedUser('baja', 'EMPLOYEE', { isActive: false });
    const bodies = [];
    for (const [username, password] of [
      ['nadie', PASSWORD],
      ['maria', 'incorrecta'],
      ['baja', PASSWORD],
    ] as const) {
      const res = await doors.local.post('/api/auth/login', { username, password });
      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
      bodies.push(res.body);
    }
    // Distintos usuarios, pero el mismo mensaje y código (el contador arranca de cero para cada uno).
    for (const b of bodies) {
      expect(b).toEqual({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Usuario o contraseña incorrectos.',
          details: { remainingAttempts: 4 },
        },
      });
    }
    const reasons = (await auditRows('LOGIN_FAILED')).map(
      (r) => (r.details as { reason: string }).reason,
    );
    expect(reasons).toEqual(['UNKNOWN_USER', 'BAD_PASSWORD', 'USER_INACTIVE']);
    const failed = await auditRows('LOGIN_FAILED');
    expect(JSON.stringify(failed)).not.toContain(PASSWORD);
    expect(failed[0]!.userId).toBeNull();
  });

  it('400 con campos desconocidos o faltantes', async () => {
    expect((await doors.local.post('/api/auth/login', { username: 'x' })).status).toBe(400);
    const extra = await doors.local.post('/api/auth/login', {
      username: 'x',
      password: 'y',
      role: 'OWNER',
    });
    expect(extra.status).toBe(400);
  });

  it('bloquea tras 5 fallos (429 LOGIN_LOCKED) y el bloqueo es por usuario y por puerta', async () => {
    await seedUser('maria', 'MANAGER');
    await seedUser('beto', 'MANAGER');
    for (let i = 1; i <= 4; i++) {
      const res = await doors.local.post('/api/auth/login', {
        username: 'maria',
        password: 'mala',
      });
      expect(res.status).toBe(401);
      expect(res.body.error.details.remainingAttempts).toBe(5 - i);
    }
    const fifth = await doors.local.post('/api/auth/login', {
      username: 'maria',
      password: 'mala',
    });
    expect(fifth.status).toBe(429);
    expect(fifth.body.error.code).toBe('LOGIN_LOCKED');
    expect(fifth.body.error.details.retryAfterSeconds).toBe(900);
    expect(fifth.headers['retry-after']).toBe('900');

    // Con la clave correcta también está bloqueada, sin mirar la contraseña.
    expect((await loginAs(doors.local, 'maria')).res.status).toBe(429);
    // Otro usuario en la misma puerta, y la misma persona en la otra puerta: entran.
    expect((await loginAs(doors.local, 'beto')).res.status).toBe(200);
    expect((await loginAs(doors.remote, 'maria')).res.status).toBe(200);

    expect(await auditRows('LOGIN_LOCKED')).toHaveLength(1); // una vez, al empezar
    expect(await auditRows('LOGIN_FAILED')).toHaveLength(5);
  });

  it('el bloqueo también corre con usuarios que no existen (no revela quién existe)', async () => {
    for (let i = 0; i < 4; i++)
      await doors.local.post('/api/auth/login', { username: 'fantasma', password: 'x' });
    const res = await doors.local.post('/api/auth/login', { username: 'fantasma', password: 'x' });
    expect(res.status).toBe(429);
  });

  it('un login correcto borra el contador de fallos', async () => {
    await seedUser('maria', 'MANAGER');
    for (let i = 0; i < 3; i++)
      await doors.local.post('/api/auth/login', { username: 'maria', password: 'mala' });
    await loginAs(doors.local, 'maria');
    const res = await doors.local.post('/api/auth/login', { username: 'maria', password: 'mala' });
    expect(res.body.error.details.remainingAttempts).toBe(4);
  });
});

describe('puerta remota y empleados', () => {
  it('login de encargado por la remota: cookie __Host- Secure de 4 h y access REMOTE', async () => {
    await seedUser('maria', 'MANAGER');
    const { res, cookie } = await loginAs(doors.remote, 'maria');
    expect(res.status).toBe(200);
    expect(res.body.access).toBe('REMOTE');
    const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(3.9);
    expect(hours).toBeLessThanOrEqual(4);
    const setCookie = (res.headers['set-cookie'] as unknown as string[])[0]!;
    expect(setCookie).toMatch(/^__Host-kiosco_sid=/);
    expect(setCookie).toMatch(/; Secure/i);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toMatch(/Max-Age=14400/);
    expect(setCookie).not.toMatch(/Domain/i);
    expect((await doors.remote.get('/api/auth/me', cookie)).status).toBe(200);
    expect((await auditRows('LOGIN'))[0]!.channel).toBe('REMOTE');
  });

  it('empleado por la remota: 403 LOCAL_ONLY solo con la clave correcta; con la mala, 401', async () => {
    await seedUser('juan', 'EMPLOYEE');
    const bad = await doors.remote.post('/api/auth/login', { username: 'juan', password: 'mala' });
    expect(bad.status).toBe(401);
    const good = await doors.remote.post('/api/auth/login', {
      username: 'juan',
      password: PASSWORD,
    });
    expect(good.status).toBe(403);
    expect(good.body.error.code).toBe('LOCAL_ONLY');
    expect(good.headers['set-cookie']).toBeUndefined();
    const failed = await auditRows('LOGIN_FAILED');
    expect((failed.at(-1)!.details as { reason: string }).reason).toBe('REMOTE_ROLE_NOT_ALLOWED');
    // Por la local sí entra.
    expect((await loginAs(doors.local, 'juan')).res.status).toBe(200);
  });

  it('no suma fallos el 403 del empleado remoto', async () => {
    await seedUser('juan', 'EMPLOYEE');
    for (let i = 0; i < 8; i++) {
      expect(
        (await doors.remote.post('/api/auth/login', { username: 'juan', password: PASSWORD }))
          .status,
      ).toBe(403);
    }
  });

  it('la cookie de una puerta no sirve en la otra', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie: localCookie } = await loginAs(doors.local, 'maria');
    const token = localCookie.split('=')[1]!;
    // El mismo JWT local presentado con el nombre de la cookie remota: ch no coincide.
    expect((await doors.remote.get('/api/auth/me', `__Host-kiosco_sid=${token}`)).status).toBe(401);
    // Y la cookie local no la lee la puerta remota.
    expect((await doors.remote.get('/api/auth/me', localCookie)).status).toBe(401);
  });

  it('si un encargado pasa a empleado, sus sesiones remotas se cortan y las locales siguen', async () => {
    const maria = await seedUser('maria', 'MANAGER');
    await seedUser('dueno', 'OWNER');
    const remote = await loginAs(doors.remote, 'maria');
    const local = await loginAs(doors.local, 'maria');
    const owner = await loginAs(doors.local, 'dueno');
    const patch = await doors.local.patch(
      `/api/users/${maria.id}`,
      { role: 'EMPLOYEE' },
      owner.cookie,
    );
    expect(patch.status).toBe(200);
    expect((await doors.remote.get('/api/auth/me', remote.cookie)).status).toBe(401);
    const me = await doors.local.get('/api/auth/me', local.cookie);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('EMPLOYEE'); // el rol sale de la base, no del login
  });

  it('crear usuarios y resetear contraseñas por la remota: 403 LOCAL_ONLY y ACCESS_DENIED auditado', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const target = await seedUser('juan', 'EMPLOYEE');
    const { cookie } = await loginAs(doors.remote, 'dueno');

    const create = await doors.remote.post(
      '/api/users',
      { username: 'nuevo', fullName: 'Nuevo', role: 'EMPLOYEE', password: PASSWORD },
      cookie,
    );
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('LOCAL_ONLY');
    const reset = await doors.remote.post(
      `/api/users/${target.id}/reset-password`,
      { newPassword: 'otra-clave-123' },
      cookie,
    );
    expect(reset.status).toBe(403);
    expect(reset.body.error.code).toBe('LOCAL_ONLY');

    expect(await prisma.user.count()).toBe(2); // no se creó nadie
    const denied = await auditRows('ACCESS_DENIED');
    // Como máximo 1 fila por minuto por usuario: el segundo rechazo va solo al log.
    expect(denied.map((d) => d.entityId)).toEqual(['POST /api/users']);
    expect(denied[0]).toMatchObject({ channel: 'REMOTE', userId: owner.id, entityType: 'Route' });
  });

  it('por la remota, el dueño sí lista y edita usuarios', async () => {
    await seedUser('dueno', 'OWNER');
    const target = await seedUser('juan', 'EMPLOYEE');
    const { cookie } = await loginAs(doors.remote, 'dueno');
    expect((await doors.remote.get('/api/users', cookie)).status).toBe(200);
    const patch = await doors.remote.patch(
      `/api/users/${target.id}`,
      { fullName: 'Juan P.' },
      cookie,
    );
    expect(patch.status).toBe(200);
    expect((await auditRows('USER_UPDATE'))[0]!.channel).toBe('REMOTE');
  });

  it('un encargado por la remota recibe FORBIDDEN (no LOCAL_ONLY) al crear usuarios', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie } = await loginAs(doors.remote, 'maria');
    const res = await doors.remote.post(
      '/api/users',
      { username: 'x1234', fullName: 'X', role: 'EMPLOYEE', password: PASSWORD },
      cookie,
    );
    expect(res.body.error.code).toBe('FORBIDDEN');
  });
});

describe('logout y sesión', () => {
  it('me sin sesión da 401 UNAUTHENTICATED', async () => {
    const res = await doors.local.get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('me devuelve el usuario y el rol actual', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie, res: loginRes } = await loginAs(doors.local, 'maria');
    const me = await doors.local.get('/api/auth/me', cookie);
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ ...loginRes.body, expiresAt: me.body.expiresAt });
    expect(me.headers['cache-control']).toBe('no-store');
  });

  it('logout: 204, borra la cookie y audita LOGOUT; sin sesión también da 204 y no audita', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie } = await loginAs(doors.local, 'maria');
    const res = await doors.local.post('/api/auth/logout', undefined, cookie);
    expect(res.status).toBe(204);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^kiosco_sid=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)/,
    );
    expect(await auditRows('LOGOUT')).toHaveLength(1);

    const again = await doors.local.post('/api/auth/logout');
    expect(again.status).toBe(204);
    expect(await auditRows('LOGOUT')).toHaveLength(1);
  });

  it('logout no corta las sesiones del mismo usuario en otros dispositivos', async () => {
    await seedUser('maria', 'MANAGER');
    const a = await loginAs(doors.local, 'maria');
    const b = await loginAs(doors.local, 'maria');
    await doors.local.post('/api/auth/logout', undefined, a.cookie);
    expect((await doors.local.get('/api/auth/me', b.cookie)).status).toBe(200);
  });

  it('una sesión vencida da 401 y borra la cookie', async () => {
    const user = await seedUser('maria', 'MANAGER');
    const expired = jwt.sign({ sub: String(user.id), tv: 0, ch: 'local' }, 'a'.repeat(48), {
      algorithm: 'HS256',
      expiresIn: -10,
    });
    const res = await doors.local.get('/api/auth/me', `kiosco_sid=${expired}`);
    expect(res.status).toBe(401);
    expect((res.headers['set-cookie'] as unknown as string[])[0]).toMatch(/^kiosco_sid=;/);
  });

  it('rechaza un JWT firmado con otra clave o con alg none', async () => {
    const user = await seedUser('maria', 'MANAGER');
    const forged = jwt.sign({ sub: String(user.id), tv: 0, ch: 'local' }, 'b'.repeat(48));
    expect((await doors.local.get('/api/auth/me', `kiosco_sid=${forged}`)).status).toBe(401);
    const none = jwt.sign({ sub: String(user.id), tv: 0, ch: 'local' }, '', { algorithm: 'none' });
    expect((await doors.local.get('/api/auth/me', `kiosco_sid=${none}`)).status).toBe(401);
  });

  it('resetear la contraseña corta todas las sesiones del usuario (tokenVersion)', async () => {
    await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const owner = await loginAs(doors.local, 'dueno');
    const m1 = await loginAs(doors.local, 'maria');
    const m2 = await loginAs(doors.remote, 'maria');

    const reset = await doors.local.post(
      `/api/users/${maria.id}/reset-password`,
      { newPassword: 'nueva-clave-99' },
      owner.cookie,
    );
    expect(reset.status).toBe(200);
    expect(JSON.stringify(reset.body)).not.toMatch(/passwordHash|tokenVersion|nueva-clave/);
    expect((await doors.local.get('/api/auth/me', m1.cookie)).status).toBe(401);
    expect((await doors.remote.get('/api/auth/me', m2.cookie)).status).toBe(401);

    expect((await loginAs(doors.local, 'maria')).res.status).toBe(401); // la vieja ya no sirve
    expect((await loginAs(doors.local, 'maria', 'nueva-clave-99')).res.status).toBe(200);
    const [audit] = await auditRows('PASSWORD_RESET');
    expect(audit).toMatchObject({
      userId: owner.res.body.user.id,
      entityId: String(maria.id),
      channel: 'LOCAL',
    });
    expect(JSON.stringify(audit)).not.toMatch(/nueva-clave/);
  });

  it('resetear borra el bloqueo de intentos de ese usuario', async () => {
    await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    for (let i = 0; i < 5; i++)
      await doors.local.post('/api/auth/login', { username: 'maria', password: 'x' });
    expect((await loginAs(doors.local, 'maria')).res.status).toBe(429);
    const owner = await loginAs(doors.local, 'dueno');
    await doors.local.post(
      `/api/users/${maria.id}/reset-password`,
      { newPassword: 'nueva-clave-99' },
      owner.cookie,
    );
    expect((await loginAs(doors.local, 'maria', 'nueva-clave-99')).res.status).toBe(200);
  });

  it('si el dueño se resetea a sí mismo, su sesión se corta', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const { cookie } = await loginAs(doors.local, 'dueno');
    const res = await doors.local.post(
      `/api/users/${owner.id}/reset-password`,
      { newPassword: 'nueva-clave-99' },
      cookie,
    );
    expect(res.status).toBe(200);
    expect((await doors.local.get('/api/auth/me', cookie)).status).toBe(401);
  });

  it('un usuario desactivado pierde la sesión al instante y no puede volver a entrar', async () => {
    await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const owner = await loginAs(doors.local, 'dueno');
    const m = await loginAs(doors.local, 'maria');
    const res = await doors.local.patch(
      `/api/users/${maria.id}`,
      { isActive: false },
      owner.cookie,
    );
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect((await doors.local.get('/api/auth/me', m.cookie)).status).toBe(401);
    expect((await loginAs(doors.local, 'maria')).res.status).toBe(401);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: maria.id } });
    expect(stored.tokenVersion).toBe(1);

    // Reactivar: vuelve a entrar con la contraseña que tenía.
    await doors.local.patch(`/api/users/${maria.id}`, { isActive: true }, owner.cookie);
    expect((await loginAs(doors.local, 'maria')).res.status).toBe(200);
  });
});

describe('usuarios (solo dueño)', () => {
  it.each(['MANAGER', 'EMPLOYEE'] as const)(
    '%s recibe 403 FORBIDDEN en todas las rutas de usuarios',
    async (role) => {
      await seedUser('x1234', role);
      const target = await seedUser('otro', 'EMPLOYEE');
      const { cookie } = await loginAs(doors.local, 'x1234');
      const calls = [
        doors.local.get('/api/users', cookie),
        doors.local.get(`/api/users/${target.id}`, cookie),
        doors.local.post(
          '/api/users',
          { username: 'nuevo', fullName: 'N', role: 'EMPLOYEE', password: PASSWORD },
          cookie,
        ),
        doors.local.patch(`/api/users/${target.id}`, { isActive: false }, cookie),
        doors.local.post(
          `/api/users/${target.id}/reset-password`,
          { newPassword: PASSWORD },
          cookie,
        ),
      ];
      for (const res of await Promise.all(calls)) {
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
      }
      expect(await prisma.user.count()).toBe(2);
    },
  );

  it('sin sesión: 401 en todas las rutas de usuarios', async () => {
    expect((await doors.local.get('/api/users')).status).toBe(401);
    expect((await doors.local.post('/api/users', {})).status).toBe(401);
  });

  it('crear: 201 sin passwordHash, usuario en minúsculas, auditoría sin contraseña; se puede crear otro dueño', async () => {
    await seedUser('dueno', 'OWNER');
    const { cookie } = await loginAs(doors.local, 'dueno');
    const res = await doors.local.post(
      '/api/users',
      { username: '  Juan.P ', fullName: ' Juan Pérez ', role: 'OWNER', password: PASSWORD },
      cookie,
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      username: 'juan.p',
      fullName: 'Juan Pérez',
      role: 'OWNER',
      isActive: true,
      mustChangePassword: true, // H-21
      lastLoginAt: null,
    });
    expect(Object.keys(res.body).sort()).toEqual([
      'createdAt',
      'fullName',
      'id',
      'isActive',
      'lastLoginAt',
      'mustChangePassword',
      'role',
      'updatedAt',
      'username',
    ]);
    const [audit] = await auditRows('USER_CREATE');
    expect(audit!.details).toEqual({
      after: { username: 'juan.p', fullName: 'Juan Pérez', role: 'OWNER', isActive: true },
    });
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    // El nuevo dueño puede entrar con su contraseña.
    expect((await loginAs(doors.local, 'juan.p')).res.status).toBe(200);
  });

  it('crear: 409 USERNAME_TAKEN (también con otra capitalización o desactivado)', async () => {
    await seedUser('dueno', 'OWNER');
    await seedUser('baja', 'EMPLOYEE', { isActive: false });
    const { cookie } = await loginAs(doors.local, 'dueno');
    for (const username of ['DUENO', 'baja']) {
      const res = await doors.local.post(
        '/api/users',
        { username, fullName: 'X', role: 'EMPLOYEE', password: PASSWORD },
        cookie,
      );
      expect(res.status).toBe(409);
      expect(res.body.error).toMatchObject({
        code: 'USERNAME_TAKEN',
        details: { field: 'username' },
      });
    }
  });

  it('crear: 400 por contraseña corta, usuario inválido, rol inválido o campo desconocido', async () => {
    await seedUser('dueno', 'OWNER');
    const { cookie } = await loginAs(doors.local, 'dueno');
    const valid = { username: 'nuevo', fullName: 'Nuevo', role: 'EMPLOYEE', password: PASSWORD };
    for (const bad of [
      { ...valid, password: '1234567' },
      { ...valid, password: 'ñ'.repeat(37) }, // 74 bytes
      { ...valid, username: 'a b' },
      { ...valid, username: 'ab' },
      { ...valid, role: 'ADMIN' },
      { ...valid, passwordHash: 'x' },
      { ...valid, isActive: false },
    ]) {
      const res = await doors.local.post('/api/users', bad, cookie);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    // 72 bytes justos y con espacios al final: se acepta (la contraseña no se recorta).
    const ok = await doors.local.post('/api/users', { ...valid, password: ' '.repeat(8) }, cookie);
    expect(ok.status).toBe(201);
    expect((await loginAs(doors.local, 'nuevo', ' '.repeat(8))).res.status).toBe(200);
  });

  it('listar con filtros, ordenado por nombre; ver uno; 404 y 400 de id', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    await seedUser('zeta', 'EMPLOYEE', { isActive: false });
    await seedUser('beta', 'MANAGER');
    const { cookie } = await loginAs(doors.local, 'dueno');

    const all = await doors.local.get('/api/users', cookie);
    expect(all.body.items.map((u: { username: string }) => u.username)).toEqual([
      'beta',
      'dueno',
      'zeta',
    ]);
    expect(JSON.stringify(all.body)).not.toMatch(/passwordHash|tokenVersion/);
    const active = await doors.local.get('/api/users?isActive=true&role=MANAGER', cookie);
    expect(active.body.items.map((u: { username: string }) => u.username)).toEqual(['beta']);
    expect((await doors.local.get('/api/users?isActive=quizas', cookie)).status).toBe(400);
    expect((await doors.local.get('/api/users?otro=1', cookie)).status).toBe(400);

    expect((await doors.local.get(`/api/users/${owner.id}`, cookie)).body.username).toBe('dueno');
    expect((await doors.local.get('/api/users/9999', cookie)).status).toBe(404);
    expect((await doors.local.get('/api/users/abc', cookie)).status).toBe(400);
    expect((await doors.local.get('/api/users/0', cookie)).status).toBe(400);
  });

  it('editar: audita solo los campos que cambian; sin cambios responde 200 sin auditar', async () => {
    await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'EMPLOYEE');
    const { cookie } = await loginAs(doors.local, 'dueno');

    const res = await doors.local.patch(
      `/api/users/${maria.id}`,
      { fullName: 'María Gómez', role: 'MANAGER', username: 'Maria' },
      cookie,
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ fullName: 'María Gómez', role: 'MANAGER', username: 'maria' });
    const [audit] = await auditRows('USER_UPDATE');
    expect(audit!.details).toEqual({
      before: { fullName: 'Usuario maria', role: 'EMPLOYEE' },
      after: { fullName: 'María Gómez', role: 'MANAGER' },
    });

    const same = await doors.local.patch(`/api/users/${maria.id}`, { role: 'MANAGER' }, cookie);
    expect(same.status).toBe(200);
    expect(await auditRows('USER_UPDATE')).toHaveLength(1);
  });

  it('editar: 400 con cuerpo vacío o con password; 404 si no existe; 409 si el usuario está tomado', async () => {
    await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'EMPLOYEE');
    const { cookie } = await loginAs(doors.local, 'dueno');
    expect((await doors.local.patch(`/api/users/${maria.id}`, {}, cookie)).status).toBe(400);
    expect(
      (await doors.local.patch(`/api/users/${maria.id}`, { password: 'x1234567' }, cookie)).status,
    ).toBe(400);
    expect((await doors.local.patch('/api/users/9999', { isActive: false }, cookie)).status).toBe(
      404,
    );
    const taken = await doors.local.patch(`/api/users/${maria.id}`, { username: 'dueno' }, cookie);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('USERNAME_TAKEN');
  });

  it('resetear: 404 si no existe, 400 si la clave es corta; sirve sobre un desactivado', async () => {
    await seedUser('dueno', 'OWNER');
    const baja = await seedUser('baja', 'EMPLOYEE', { isActive: false });
    const { cookie } = await loginAs(doors.local, 'dueno');
    expect(
      (await doors.local.post('/api/users/9999/reset-password', { newPassword: PASSWORD }, cookie))
        .status,
    ).toBe(404);
    expect(
      (
        await doors.local.post(
          `/api/users/${baja.id}/reset-password`,
          { newPassword: 'corta' },
          cookie,
        )
      ).status,
    ).toBe(400);
    const ok = await doors.local.post(
      `/api/users/${baja.id}/reset-password`,
      { newPassword: 'nueva-clave-99' },
      cookie,
    );
    expect(ok.status).toBe(200);
    expect(ok.body.isActive).toBe(false);
  });
});

describe('puertas y red con base de datos', () => {
  it('una IP fuera de LOCAL_CIDRS recibe 403 NETWORK_NOT_ALLOWED y queda ACCESS_DENIED auditado', async () => {
    const app = buildTestApp('local', { prisma, remoteAddressOverride: () => '8.8.8.8' });
    const res = await clientFor(app, 'local').get('/api/health');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NETWORK_NOT_ALLOWED');
    const [audit] = await auditRows('ACCESS_DENIED');
    expect(audit).toMatchObject({ channel: 'LOCAL', ipAddress: '8.8.8.8', userId: null });
    expect(audit!.details).toEqual({ reason: 'NETWORK_NOT_ALLOWED' });
  });

  it('la IP del WiFi del local entra y queda en la auditoría normalizada', async () => {
    await seedUser('maria', 'MANAGER');
    const app = buildTestApp('local', {
      prisma,
      remoteAddressOverride: () => '::ffff:192.168.1.50',
    });
    const res = await clientFor(app, 'local').post('/api/auth/login', {
      username: 'maria',
      password: PASSWORD,
    });
    expect(res.status).toBe(200);
    expect((await auditRows('LOGIN'))[0]!.ipAddress).toBe('192.168.1.50');
  });

  it('en la remota, la IP de auditoría sale del último X-Forwarded-For y no decide nada', async () => {
    await seedUser('maria', 'MANAGER');
    const res = await doors.remote
      .post('/api/auth/login', { username: 'maria', password: PASSWORD })
      .set('X-Forwarded-For', '6.6.6.6, 100.64.1.2')
      .set('Tailscale-User-Login', 'maria@example.com');
    expect(res.status).toBe(200);
    const [audit] = await auditRows('LOGIN');
    expect(audit!.ipAddress).toBe('100.64.1.2');
    expect(audit!.details).toEqual({ tailscaleUser: 'maria@example.com' });
  });
});

describe('salud', () => {
  it('GET /api/health con la base real responde 200', async () => {
    expect((await doors.local.get('/api/health')).body).toEqual({ status: 'ok' });
  });
});
