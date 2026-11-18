import { describe, expect, it } from 'vitest';
import { LoginLimiter } from '../src/modules/auth/login-limiter';

function make(maxEntries = 10_000) {
  let now = 1_000_000;
  const limiter = new LoginLimiter({
    maxAttempts: 3,
    windowMinutes: 15,
    lockMinutes: 15,
    maxEntries,
    now: () => now,
  });
  return { limiter, advance: (minutes: number) => (now += minutes * 60_000) };
}

describe('LoginLimiter', () => {
  it('bloquea al llegar al máximo de fallos y avisa solo una vez', () => {
    const { limiter } = make();
    expect(limiter.recordFailure('ana', 'local')).toMatchObject({
      locked: false,
      remainingAttempts: 2,
    });
    expect(limiter.recordFailure('ana', 'local')).toMatchObject({
      locked: false,
      remainingAttempts: 1,
    });
    const third = limiter.recordFailure('ana', 'local');
    expect(third).toMatchObject({ locked: true, retryAfterSeconds: 900 });
    expect(limiter.lockedSeconds('ana', 'local')).toBe(900);
  });

  it('cuenta por puerta y por usuario', () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i++) limiter.recordFailure('ana', 'remote');
    expect(limiter.lockedSeconds('ana', 'remote')).toBeGreaterThan(0);
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    expect(limiter.lockedSeconds('beto', 'remote')).toBe(0);
  });

  it('el bloqueo termina con el tiempo y los fallos viejos salen de la ventana', () => {
    const { limiter, advance } = make();
    for (let i = 0; i < 3; i++) limiter.recordFailure('ana', 'local');
    advance(16);
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    limiter.recordFailure('beto', 'local');
    advance(16);
    expect(limiter.remainingAttempts('beto', 'local')).toBe(3);
  });

  it('reset y resetUser borran el contador', () => {
    const { limiter } = make();
    for (let i = 0; i < 3; i++) {
      limiter.recordFailure('ana', 'local');
      limiter.recordFailure('ana', 'remote');
    }
    limiter.reset('ana', 'local');
    expect(limiter.lockedSeconds('ana', 'local')).toBe(0);
    expect(limiter.lockedSeconds('ana', 'remote')).toBeGreaterThan(0);
    limiter.resetUser('ana');
    expect(limiter.lockedSeconds('ana', 'remote')).toBe(0);
  });

  it('respeta el tope de entradas', () => {
    const { limiter } = make(5);
    for (let i = 0; i < 20; i++) limiter.recordFailure(`u${i}`, 'local');
    expect(limiter.size).toBeLessThanOrEqual(5);
  });
});
