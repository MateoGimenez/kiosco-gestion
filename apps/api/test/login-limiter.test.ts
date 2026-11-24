import { describe, expect, it } from 'vitest';
import { LoginLimiter, type LimiterOptions } from '../src/modules/auth/login-limiter';

function make(extra: Partial<LimiterOptions> = {}) {
  let now = 1_000_000;
  const limiter = new LoginLimiter({
    maxAttempts: 3,
    windowMinutes: 15,
    lockMinutes: 15,
    now: () => now,
    ...extra,
  });
  const advance = (minutes: number) => (now += minutes * 60_000);
  /** Reserva y falla un intento (como un login con mala clave). */
  const fail = (user: string, channel: 'local' | 'remote' = 'local', ip?: string) => {
    const b = limiter.begin(user, channel, ip);
    if (!b.ok) throw new Error(`rechazado: ${b.reason}`);
    return b.ticket.fail();
  };
  return { limiter, advance, fail };
}

describe('LoginLimiter', () => {
  it('bloquea al llegar al máximo de fallos y avisa solo una vez', () => {
    const { limiter, fail } = make();
    expect(fail('ana')).toMatchObject({ locked: false, remainingAttempts: 2 });
    expect(fail('ana')).toMatchObject({ locked: false, remainingAttempts: 1 });
    expect(fail('ana')).toMatchObject({ locked: true, retryAfterSeconds: 900 });
    expect(limiter.lockedSeconds('ana', 'local')).toBe(900);
    expect(limiter.begin('ana', 'local')).toMatchObject({ ok: false, reason: 'LOCKED' });
  });

  it('cuenta por puerta y por usuario', () => {
    const { limiter, fail } = make();
    for (let i = 0; i < 3; i++) fail('ana', 'remote');
    expect(limiter.lockedSeconds('ana', 'remote')).toBeGreaterThan(0);
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    expect(limiter.lockedSeconds('beto', 'remote')).toBe(0);
  });

  it('el bloqueo termina con el tiempo y los fallos viejos salen de la ventana', () => {
    const { limiter, advance, fail } = make();
    for (let i = 0; i < 3; i++) fail('ana');
    advance(16);
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    fail('beto');
    advance(16);
    expect(limiter.remainingAttempts('beto', 'local')).toBe(3);
  });

  it('los intentos en curso cuentan: en paralelo no se pasa del máximo', () => {
    const { limiter } = make();
    // 10 pedidos "simultáneos": todos reservan antes de que alguno termine.
    const results = Array.from({ length: 10 }, () => limiter.begin('ana', 'local'));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok)).toHaveLength(7);
  });

  it('cancelar libera el lugar sin sumar fallo; un login correcto borra el contador', () => {
    const { limiter, fail } = make();
    fail('ana');
    const b = limiter.begin('ana', 'local');
    if (!b.ok) throw new Error('debía poder empezar');
    b.ticket.cancel();
    b.ticket.cancel(); // repetir no descuenta de más
    expect(limiter.remainingAttempts('ana', 'local')).toBe(2);
    const c = limiter.begin('ana', 'local');
    if (!c.ok) throw new Error('debía poder empezar');
    c.ticket.succeed();
    expect(limiter.remainingAttempts('ana', 'local')).toBe(3);
    expect(limiter.size).toBe(0);
  });

  it('reset y resetUser borran el contador', () => {
    const { limiter, fail } = make();
    for (let i = 0; i < 3; i++) {
      fail('ana', 'local');
      fail('ana', 'remote');
    }
    limiter.reset('ana', 'local');
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    expect(limiter.lockedSeconds('ana', 'remote')).toBeGreaterThan(0);
    limiter.resetUser('ana');
    expect(limiter.lockedSeconds('ana', 'remote')).toBe(0);
  });

  it('tope por minuto por puerta y, en la local, por IP', () => {
    const { limiter, advance, fail } = make({
      maxAttempts: 10,
      maxPerMinuteDoor: 5,
      maxPerMinuteIp: 3,
    });
    for (let i = 0; i < 3; i++) fail(`u${i}`, 'local', '192.168.1.5');
    expect(limiter.begin('otro', 'local', '192.168.1.5')).toMatchObject({
      ok: false,
      reason: 'RATE',
    });
    // Otra IP sí puede, hasta el tope de la puerta (5).
    fail('x1', 'local', '192.168.1.6');
    fail('x2', 'local', '192.168.1.6');
    expect(limiter.begin('x3', 'local', '192.168.1.7')).toMatchObject({
      ok: false,
      reason: 'RATE',
    });
    // La puerta remota tiene su propio contador y no mira IP.
    expect(limiter.begin('r1', 'remote', '127.0.0.1').ok).toBe(true);
    advance(1.1);
    expect(limiter.begin('otro', 'local', '192.168.1.5').ok).toBe(true);
  });

  it('respeta el tope de entradas', () => {
    const { limiter, fail } = make({ maxEntries: 5 });
    for (let i = 0; i < 20; i++) fail(`u${i}`);
    expect(limiter.size).toBeLessThanOrEqual(5);
  });

  it('una avalancha de nombres inventados no desaloja a un usuario bloqueado ni al atacado', () => {
    const { limiter, fail } = make({ maxEntries: 20 });
    for (let i = 0; i < 3; i++) fail('maria'); // bloqueada
    fail('juan');
    fail('juan'); // 2 fallos
    for (let i = 0; i < 500; i++) fail(`inventado${i}`); // 1 fallo cada uno
    expect(limiter.lockedSeconds('maria', 'local')).toBeGreaterThan(0);
    expect(limiter.remainingAttempts('juan', 'local')).toBe(1);
    expect(limiter.size).toBeLessThanOrEqual(20);
  });
});
