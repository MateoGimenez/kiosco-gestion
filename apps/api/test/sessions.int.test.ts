// Sesiones en la base (tabla `sessions`): logout, reseteo, desactivación y validación del JWT.
import jwt from 'jsonwebtoken';
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

async function login(door: typeof local, username: string) {
  const res = await door.post('/api/auth/login', { username, password: PASSWORD });
  expect(res.status).toBe(200);
  return sessionCookie(res);
}

/** Firma un JWT con la clave de prueba, para armar tokens "raros". */
const sign = (payload: Record<string, unknown>, options: jwt.SignOptions = {}) =>
  jwt.sign(payload, 'a'.repeat(48), { algorithm: 'HS256', ...options });

describe('sesiones', () => {
  it('el login crea una fila de sesión (puerta, vencimiento, sin revocar)', async () => {
    const u = await seedUser('maria', 'MANAGER');
    await login(local, 'maria');
    const rows = await prisma.session.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: u.id, channel: 'LOCAL', revokedAt: null });
    expect(rows[0]!.id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 11 * 3600_000);
  });

  it('el logout invalida el token: copiarlo y reusarlo da 401', async () => {
    await seedUser('maria', 'MANAGER');
    const cookie = await login(local, 'maria');
    expect((await local.get('/api/auth/me', cookie)).status).toBe(200);
    expect((await local.post('/api/auth/logout', undefined, cookie)).status).toBe(204);
    expect((await local.get('/api/auth/me', cookie)).status).toBe(401);
    expect((await prisma.session.findFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it('el logout de un dispositivo no corta el otro', async () => {
    await seedUser('maria', 'MANAGER');
    const a = await login(local, 'maria');
    const b = await login(local, 'maria');
    await local.post('/api/auth/logout', undefined, a);
    expect((await local.get('/api/auth/me', a)).status).toBe(401);
    expect((await local.get('/api/auth/me', b)).status).toBe(200);
  });

  it('resetear la contraseña y desactivar revocan todas las sesiones', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const juan = await seedUser('juan', 'MANAGER');
    const ownerCookie = await login(local, 'dueno');
    const m1 = await login(local, 'maria');
    const m2 = await login(remote, 'maria');
    const j1 = await login(local, 'juan');

    const reset = await local.post(
      `/api/users/${maria.id}/reset-password`,
      { newPassword: 'otra-clave-123' },
      ownerCookie,
    );
    expect(reset.status).toBe(200);
    expect((await local.get('/api/auth/me', m1)).status).toBe(401);
    expect((await remote.get('/api/auth/me', m2)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: maria.id, revokedAt: null } })).toBe(0);

    const off = await local.patch(`/api/users/${juan.id}`, { isActive: false }, ownerCookie);
    expect(off.status).toBe(200);
    expect((await local.get('/api/auth/me', j1)).status).toBe(401);
    expect(await prisma.session.count({ where: { userId: juan.id, revokedAt: null } })).toBe(0);
    expect((await local.get('/api/auth/me', ownerCookie)).status).toBe(200);
    expect(owner.id).toBeGreaterThan(0);
  });

  it('una sesión vencida en la base no vale aunque el JWT siga vigente', async () => {
    await seedUser('maria', 'MANAGER');
    const cookie = await login(local, 'maria');
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await local.get('/api/auth/me', cookie)).status).toBe(401);
  });

  it('un token sin exp, sin sid o con un sid inexistente se rechaza', async () => {
    const u = await seedUser('maria', 'MANAGER');
    const base = { sub: String(u.id), tv: 0, ch: 'local' };
    const real = await login(local, 'maria');
    const sid = (jwt.decode(real.split('=')[1]!) as { sid: string }).sid;

    const sinExp = sign({ ...base, sid }); // firmado sin expiresIn
    const sinSid = sign(base, { expiresIn: 3600 });
    const sidFalso = sign({ ...base, sid: 'no-existe' }, { expiresIn: 3600 });
    const bueno = sign({ ...base, sid }, { expiresIn: 3600 });
    for (const t of [sinExp, sinSid, sidFalso]) {
      expect((await local.get('/api/auth/me', `kiosco_sid=${t}`)).status).toBe(401);
    }
    expect((await local.get('/api/auth/me', `kiosco_sid=${bueno}`)).status).toBe(200);
  });

  it('el token de una sesión local no sirve en la puerta remota', async () => {
    const u = await seedUser('maria', 'MANAGER');
    await login(local, 'maria');
    const sid = (await prisma.session.findFirstOrThrow()).id;
    const t = sign({ sub: String(u.id), tv: 0, ch: 'remote', sid }, { expiresIn: 3600 });
    expect((await remote.get('/api/auth/me', `__Host-kiosco_sid=${t}`)).status).toBe(401);
  });
});

describe('límites de login', () => {
  it('con UNKNOWN_USER no se guarda lo escrito en "usuario" (puede ser una contraseña)', async () => {
    await local.post('/api/auth/login', { username: 'MiClaveSecreta9', password: 'x1234567' });
    const rows = await prisma.auditLog.findMany({ where: { action: 'LOGIN_FAILED' } });
    expect(JSON.stringify(rows)).not.toMatch(/miclavesecreta9/i);
    expect(rows[0]!.details).toMatchObject({ reason: 'UNKNOWN_USER' });
  });

  it('tope por minuto por IP en la puerta local: 429 LOGIN_RATE_LIMITED con Retry-After', async () => {
    const loginLimiter = new LoginLimiter({ ...testConfig().login, maxPerMinuteIp: 5 });
    const door = clientFor(buildTestApp('local', { prisma, loginLimiter }), 'local');
    const out: number[] = [];
    let last;
    for (let i = 0; i < 7; i++) {
      last = await door.post('/api/auth/login', { username: `fantasma${i}`, password: 'x1234567' });
      out.push(last.status);
    }
    expect(out).toEqual([401, 401, 401, 401, 401, 429, 429]);
    expect(last!.body.error.code).toBe('LOGIN_RATE_LIMITED');
    expect(Number(last!.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('renombrar o cambiar el rol resetea el contador de intentos', async () => {
    const owner = await seedUser('dueno', 'OWNER');
    const maria = await seedUser('maria', 'MANAGER');
    const ownerCookie = await login(local, 'dueno');
    for (let i = 0; i < 2; i++) {
      await local.post('/api/auth/login', { username: 'maria', password: 'mala-clave-1' });
    }
    expect(
      (await local.post('/api/auth/login', { username: 'maria', password: 'mala-clave-1' })).body
        .error.details.remainingAttempts,
    ).toBe(2);
    await local.patch(`/api/users/${maria.id}`, { role: 'EMPLOYEE' }, ownerCookie);
    expect(
      (await local.post('/api/auth/login', { username: 'maria', password: 'mala-clave-1' })).body
        .error.details.remainingAttempts,
    ).toBe(4);
    expect(owner.id).toBeGreaterThan(0);
  });

  it('el hash de relleno y el rehash: un hash con otro costo se actualiza al entrar', async () => {
    const u = await seedUser('maria', 'MANAGER'); // guardado con costo 4
    // La config de test usa costo 4: se fuerza otro costo guardado para ver el rehash.
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await hashPassword(PASSWORD, 5) },
    });
    await login(local, 'maria');
    const { default: bcrypt } = await import('bcryptjs');
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(bcrypt.getRounds(after.passwordHash)).toBe(4);
  });
});
