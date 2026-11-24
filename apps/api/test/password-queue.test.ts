import { describe, expect, it } from 'vitest';
import { LimitedQueue } from '../src/modules/auth/password';
import { AuditThrottle, usernameHmac } from '../src/audit';

describe('LimitedQueue (cola de bcrypt)', () => {
  it('corre como máximo N a la vez y rechaza con 503 SERVER_BUSY si la cola se llena', async () => {
    const queue = new LimitedQueue(2, 3);
    let running = 0;
    let maxRunning = 0;
    const releases: (() => void)[] = [];
    const task = () =>
      new Promise<void>((resolve) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        releases.push(() => {
          running -= 1;
          resolve();
        });
      });
    // 2 corriendo + 3 esperando = 5 aceptados; el sexto se rechaza.
    const accepted = Array.from({ length: 5 }, () => queue.run(task));
    await expect(queue.run(task)).rejects.toMatchObject({ status: 503, code: 'SERVER_BUSY' });
    expect(queue.stats).toEqual({ running: 2, waiting: 3 });
    while (releases.length > 0 || running > 0) {
      releases.shift()?.();
      await new Promise((r) => setImmediate(r));
    }
    await Promise.all(accepted);
    expect(maxRunning).toBe(2);
    expect(queue.stats).toEqual({ running: 0, waiting: 0 });
  });

  it('un error en una tarea no deja el lugar ocupado', async () => {
    const queue = new LimitedQueue(1, 1);
    await expect(queue.run(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(queue.run(() => Promise.resolve(7))).resolves.toBe(7);
  });
});

describe('AuditThrottle', () => {
  it('deja pasar 1 por minuto por clave y respeta el tope de claves', () => {
    let now = 0;
    const t = new AuditThrottle(60_000, 2, () => now);
    expect(t.allow('a')).toBe(true);
    expect(t.allow('a')).toBe(false);
    expect(t.allow('b')).toBe(true);
    expect(t.allow('c')).toBe(false); // tope de claves
    now = 61_000;
    expect(t.allow('a')).toBe(true);
    expect(t.allow('c')).toBe(true); // las vencidas se limpian
  });
});

describe('usernameHmac', () => {
  it('es estable, depende de la clave y no contiene lo escrito', () => {
    const a = usernameHmac('x'.repeat(40), 'MiClaveSecreta1');
    expect(a).toBe(usernameHmac('x'.repeat(40), 'MiClaveSecreta1'));
    expect(a).not.toBe(usernameHmac('y'.repeat(40), 'MiClaveSecreta1'));
    expect(a).toMatch(/^[0-9a-f]{16}$/);
  });
});
