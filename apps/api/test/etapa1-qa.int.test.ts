// QA de la etapa 1 (integración contra `kiosco_test`): lo que el plan pide y no cubren los tests
// de backend: restricciones de la base, auditoría con `channel`, `passwordHash` en todas las
// respuestas, sesiones con el tiempo manipulado y dos dueños.
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../src/generated/client';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
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
}

function buildDoors(): Doors {
  const loginLimiter = new LoginLimiter(testConfig().login);
  const opts = { prisma, loginLimiter };
  return {
    local: clientFor(buildTestApp('local', opts), 'local'),
    remote: clientFor(buildTestApp('remote', opts), 'remote'),
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
  doors = buildDoors();
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(() => prisma.$disconnect());

describe('base de datos: restricciones a mano', () => {
  const insertUser = (username: string) =>
    prisma.$executeRaw`INSERT INTO users (username, full_name, password_hash, role, updated_at)
      VALUES (${username}, 'Nombre', 'hash', 'EMPLOYEE', now())`;

  it('CHECK de username: rechaza mayúsculas, espacios, acentos, muy corto y muy largo', async () => {
    for (const bad of ['Maria', 'MARIA', 'ma ria', 'mará', 'ab', 'a@b.com', '']) {
      await expect(insertUser(bad), `"${bad}" no debería entrar`).rejects.toThrow(
        /users_username_format_check/,
      );
    }
    // 31 caracteres: lo frena el tipo VARCHAR(30) antes que el CHECK.
    await expect(insertUser('a'.repeat(31))).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });

  it('CHECK de username: acepta el formato válido (límites 3 y 30, punto, guion y guion bajo)', async () => {
    for (const ok of ['abc', 'a'.repeat(30), 'juan.p', 'juan_p', 'juan-p', 'user123']) {
      await expect(insertUser(ok), ok).resolves.toBe(1);
    }
  });

  it('el username es único aunque cambie la capitalización (la base ya lo impide)', async () => {
    await insertUser('maria');
    await expect(insertUser('maria')).rejects.toThrow();
    await expect(insertUser('Maria')).rejects.toThrow(/users_username_format_check/);
  });

  it('CHECK de tokenVersion: nunca negativo', async () => {
    const user = await seedUser('maria', 'MANAGER');
    await expect(
      prisma.$executeRaw`UPDATE users SET token_version = -1 WHERE id = ${user.id}`,
    ).rejects.toThrow(/users_token_version_check/);
  });

  it('audit_logs es de solo agregar: INSERT sí, UPDATE y DELETE fallan', async () => {
    const user = await seedUser('maria', 'MANAGER');
    const log = await prisma.auditLog.create({
      data: { userId: user.id, action: 'PRUEBA', entityType: 'User', channel: 'LOCAL' },
    });

    await expect(
      prisma.$executeRaw`UPDATE audit_logs SET action = 'ADULTERADO' WHERE id = ${log.id}`,
    ).rejects.toThrow(/solo agregar/);
    await expect(
      prisma.auditLog.update({ where: { id: log.id }, data: { action: 'ADULTERADO' } }),
    ).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM audit_logs WHERE id = ${log.id}`).rejects.toThrow(
      /solo agregar/,
    );
    await expect(prisma.auditLog.deleteMany()).rejects.toThrow();
    await expect(prisma.auditLog.updateMany({ data: { ipAddress: '1.1.1.1' } })).rejects.toThrow();

    const after = await prisma.auditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.action).toBe('PRUEBA');
    expect(after.ipAddress).toBeNull();
  });

  it('no se puede borrar un usuario que tiene auditoría (ON DELETE RESTRICT)', async () => {
    const user = await seedUser('maria', 'MANAGER');
    await prisma.auditLog.create({
      data: { userId: user.id, action: 'PRUEBA', entityType: 'User', channel: 'LOCAL' },
    });
    await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
  });
});

describe('dos dueños (PA-37)', () => {
  it('pueden convivir, entrar a la vez y gestionarse entre sí', async () => {
    await seedUser('dueno1', 'OWNER');
    const owner = await loginAs(doors.local, 'dueno1');
    const created = await doors.local.post(
      '/api/users',
      { username: 'dueno2', fullName: 'Segundo Dueño', role: 'OWNER', password: PASSWORD },
      owner.cookie,
    );
    expect(created.status).toBe(201);
    expect(created.body.role).toBe('OWNER');

    const second = await loginAs(doors.remote, 'dueno2');
    expect(second.res.status).toBe(200);
    const list = await doors.remote.get('/api/users?role=OWNER', second.cookie);
    expect(list.body.items.map((u: { username: string }) => u.username).sort()).toEqual([
      'dueno1',
      'dueno2',
    ]);

    // El segundo dueño resetea al primero: se corta la sesión del primero y no la del segundo.
    const reset = await doors.local.post(
      `/api/users/${created.body.id - 1}/reset-password`,
      { newPassword: 'otra-clave-123' },
      (await loginAs(doors.local, 'dueno2')).cookie,
    );
    expect(reset.status).toBe(200);
    expect((await doors.local.get('/api/auth/me', owner.cookie)).status).toBe(401);
    expect((await doors.remote.get('/api/auth/me', second.cookie)).status).toBe(200);
  });
});

describe('sesión vencida con el tiempo manipulado', () => {
  const HOUR = 3_600_000;

  it('la local dura 12 h y la remota 4 h, contadas desde el login (no se estiran con el uso)', async () => {
    await seedUser('dueno', 'OWNER');
    const start = Date.now();
    const local = await loginAs(doors.local, 'dueno');
    const remote = await loginAs(doors.remote, 'dueno');

    vi.useFakeTimers({ toFake: ['Date'], now: start + 3.9 * HOUR });
    expect((await doors.local.get('/api/auth/me', local.cookie)).status).toBe(200);
    expect((await doors.remote.get('/api/auth/me', remote.cookie)).status).toBe(200);

    vi.setSystemTime(start + 4.1 * HOUR);
    const remoteExpired = await doors.remote.get('/api/auth/me', remote.cookie);
    expect(remoteExpired.status).toBe(401);
    expect(remoteExpired.body.error.code).toBe('UNAUTHENTICATED');
    expect((remoteExpired.headers['set-cookie'] as unknown as string[])[0]).toMatch(
      /^__Host-kiosco_sid=;/,
    );
    expect((await doors.local.get('/api/auth/me', local.cookie)).status).toBe(200);

    vi.setSystemTime(start + 11.9 * HOUR);
    expect((await doors.local.get('/api/auth/me', local.cookie)).status).toBe(200);

    vi.setSystemTime(start + 12.1 * HOUR);
    const localExpired = await doors.local.get('/api/auth/me', local.cookie);
    expect(localExpired.status).toBe(401);
    expect((await doors.local.get('/api/users', local.cookie)).status).toBe(401);
  });

  it('con la sesión vencida no se puede usar ninguna ruta protegida, y se puede volver a entrar', async () => {
    await seedUser('dueno', 'OWNER');
    const start = Date.now();
    const old = await loginAs(doors.local, 'dueno');
    vi.useFakeTimers({ toFake: ['Date'], now: start + 13 * HOUR });
    expect((await doors.local.get('/api/users', old.cookie)).status).toBe(401);
    expect((await doors.local.post('/api/users', { username: 'x1234' }, old.cookie)).status).toBe(
      401,
    );
    const again = await loginAs(doors.local, 'dueno');
    expect(again.res.status).toBe(200);
    expect((await doors.local.get('/api/auth/me', again.cookie)).status).toBe(200);
  });
});

describe('auditoría con `channel`', () => {
  it('login correcto y fallido: usuario, puerta, IP y detalles; nunca la contraseña', async () => {
    const maria = await seedUser('maria', 'MANAGER');
    await doors.local.post('/api/auth/login', { username: 'maria', password: 'mala-clave-xyz' });
    await doors.remote.post('/api/auth/login', {
      username: 'fantasma',
      password: 'mala-clave-xyz',
    });
    await loginAs(doors.local, 'maria');
    await loginAs(doors.remote, 'maria');

    const failed = await auditRows('LOGIN_FAILED');
    expect(failed).toHaveLength(2);
    expect(failed[0]).toMatchObject({
      userId: maria.id,
      channel: 'LOCAL',
      entityType: 'User',
      entityId: String(maria.id),
      details: { username: 'maria', reason: 'BAD_PASSWORD' },
    });
    expect(failed[1]).toMatchObject({
      userId: null,
      channel: 'REMOTE',
      entityId: null,
      details: { username: 'fantasma', reason: 'UNKNOWN_USER' },
    });

    const ok = await auditRows('LOGIN');
    expect(ok.map((r) => [r.channel, r.userId])).toEqual([
      ['LOCAL', maria.id],
      ['REMOTE', maria.id],
    ]);
    for (const row of [...failed, ...ok]) expect(row.createdAt).toBeInstanceOf(Date);

    // Ninguna fila de toda la tabla contiene las contraseñas escritas ni el hash.
    const everything = JSON.stringify(await prisma.auditLog.findMany());
    expect(everything).not.toContain('mala-clave-xyz');
    expect(everything).not.toContain(PASSWORD);
    expect(everything).not.toMatch(/\$2[aby]\$/);
  });

  it('crear, editar y resetear un usuario: quién, por qué puerta y qué cambió', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const { cookie } = await loginAs(doors.local, 'dueno');
    const created = await doors.local.post(
      '/api/users',
      { username: 'juan', fullName: 'Juan', role: 'EMPLOYEE', password: 'clave-secreta-77' },
      cookie,
    );
    const id = created.body.id as number;
    await doors.local.patch(`/api/users/${id}`, { role: 'MANAGER', isActive: false }, cookie);
    await doors.local.post(
      `/api/users/${id}/reset-password`,
      { newPassword: 'otra-secreta-88' },
      cookie,
    );

    const [create] = await auditRows('USER_CREATE');
    expect(create).toMatchObject({
      userId: owner.id,
      channel: 'LOCAL',
      entityType: 'User',
      entityId: String(id),
      details: { after: { username: 'juan', fullName: 'Juan', role: 'EMPLOYEE', isActive: true } },
    });
    const [update] = await auditRows('USER_UPDATE');
    expect(update).toMatchObject({
      userId: owner.id,
      channel: 'LOCAL',
      entityId: String(id),
      details: {
        before: { role: 'EMPLOYEE', isActive: true },
        after: { role: 'MANAGER', isActive: false },
      },
    });
    const [reset] = await auditRows('PASSWORD_RESET');
    expect(reset).toMatchObject({ userId: owner.id, channel: 'LOCAL', entityId: String(id) });
    expect(reset!.details).toEqual({});

    const everything = JSON.stringify(await prisma.auditLog.findMany());
    for (const secret of ['clave-secreta-77', 'otra-secreta-88', PASSWORD]) {
      expect(everything).not.toContain(secret);
    }
  });

  it('logout se audita con la puerta; el bloqueo audita LOGIN_LOCKED con la puerta', async () => {
    await seedUser('maria', 'MANAGER');
    const { cookie } = await loginAs(doors.remote, 'maria');
    await doors.remote.post('/api/auth/logout', undefined, cookie);
    expect((await auditRows('LOGOUT'))[0]).toMatchObject({ channel: 'REMOTE', entityType: 'User' });

    for (let i = 0; i < 5; i++) {
      await doors.remote.post('/api/auth/login', { username: 'maria', password: 'incorrecta1' });
    }
    expect((await auditRows('LOGIN_LOCKED'))[0]).toMatchObject({
      channel: 'REMOTE',
      details: { username: 'maria', lockMinutes: 15 },
    });
  });
});

describe('passwordHash y tokenVersion nunca salen en una respuesta', () => {
  it('se revisan los cuerpos y los encabezados de todas las rutas de auth y de users, con éxito y con error', async () => {
    await seedUser('dueno', 'OWNER');
    const target = await seedUser('juan', 'EMPLOYEE');
    const bodies: { label: string; res: { text: string; headers: Record<string, unknown> } }[] = [];
    const keep = <T extends { text: string; headers: Record<string, unknown> }>(
      label: string,
      res: T,
    ) => {
      bodies.push({ label, res });
      return res;
    };

    keep(
      'login mala clave',
      await loginAs(doors.local, 'dueno', 'mala-clave-1').then((r) => r.res),
    );
    const login = await loginAs(doors.local, 'dueno');
    keep('login', login.res);
    const c = login.cookie;
    keep('me', await doors.local.get('/api/auth/me', c));
    keep('me sin sesión', await doors.local.get('/api/auth/me'));
    keep('list', await doors.local.get('/api/users', c));
    keep('list filtrada', await doors.local.get('/api/users?isActive=true&role=EMPLOYEE', c));
    keep('list filtro inválido', await doors.local.get('/api/users?role=ROOT', c));
    keep('get', await doors.local.get(`/api/users/${target.id}`, c));
    keep('get 404', await doors.local.get('/api/users/9999', c));
    keep('get id inválido', await doors.local.get('/api/users/abc', c));
    keep(
      'create',
      await doors.local.post(
        '/api/users',
        { username: 'nuevo1', fullName: 'Nuevo', role: 'MANAGER', password: PASSWORD },
        c,
      ),
    );
    keep(
      'create duplicado',
      await doors.local.post(
        '/api/users',
        { username: 'nuevo1', fullName: 'Nuevo', role: 'MANAGER', password: PASSWORD },
        c,
      ),
    );
    keep(
      'probe create con passwordHash',
      await doors.local.post(
        '/api/users',
        {
          username: 'nuevo2',
          fullName: 'N',
          role: 'MANAGER',
          password: PASSWORD,
          passwordHash: 'x',
        },
        c,
      ),
    );
    const afterProbes = await prisma.user.findUniqueOrThrow({ where: { id: target.id } });
    expect(afterProbes.tokenVersion).toBe(0); // el campo prohibido no se aplicó
    keep('patch', await doors.local.patch(`/api/users/${target.id}`, { fullName: 'Juan P.' }, c));
    keep(
      'patch desactivar',
      await doors.local.patch(`/api/users/${target.id}`, { isActive: false }, c),
    );
    keep(
      'probe patch tokenVersion',
      await doors.local.patch(`/api/users/${target.id}`, { tokenVersion: 99 }, c),
    );
    keep(
      'reset',
      await doors.local.post(
        `/api/users/${target.id}/reset-password`,
        { newPassword: 'nueva-clave-55' },
        c,
      ),
    );
    keep(
      'remoto crear',
      await doors.remote.post('/api/users', {}, (await loginAs(doors.remote, 'dueno')).cookie),
    );
    keep('logout', await doors.local.post('/api/auth/logout', undefined, c));

    expect(bodies.length).toBeGreaterThan(15);
    for (const { label, res } of bodies) {
      const everything = res.text + JSON.stringify(res.headers);
      // En los pedidos con un campo prohibido, el 400 repite el nombre que mandó el cliente: no es una fuga.
      if (!label.startsWith('probe')) {
        expect(everything, label).not.toMatch(
          /passwordHash|password_hash|tokenVersion|token_version/,
        );
      }
      expect(everything, label).not.toMatch(/\$2[aby]\$\d\d\$/); // forma de un hash de bcrypt
      expect(everything, label).not.toContain('nueva-clave-55');
    }
  });
});

describe('límite de intentos con pedidos en paralelo', () => {
  it('ráfaga de 20 intentos simultáneos con mala clave: no pasan más de LOGIN_MAX_ATTEMPTS sin bloqueo', async () => {
    await seedUser('maria', 'MANAGER');
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        doors.local.post('/api/auth/login', { username: 'maria', password: 'incorrecta1' }),
      ),
    );
    const unlocked = results.filter((r) => r.status === 401).length;
    const locked = results.filter((r) => r.status === 429).length;
    // Con LOGIN_MAX_ATTEMPTS=5, el 5.º fallo bloquea: como mucho 4 respuestas 401 y el resto 429.
    expect(unlocked, `401: ${unlocked}, 429: ${locked}`).toBeLessThanOrEqual(5);
    // Y una vez bloqueado, ni la clave correcta entra.
    expect((await loginAs(doors.local, 'maria')).res.status).toBe(429);
  });
});
