// ADR 004: bcrypt corre en un worker_thread, de a una operación, con la cola de siempre.
import bcrypt from 'bcryptjs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  closeBcryptWorker,
  getDummyHash,
  hashPassword,
  verifyPassword,
} from '../src/modules/auth/password';

afterAll(() => closeBcryptWorker());

describe('bcrypt en un worker_thread', () => {
  it('hash y compare dan lo mismo que bcryptjs directo (mismos hashes)', async () => {
    const hash = await hashPassword('clave-segura-1', 4);
    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    expect(bcrypt.compareSync('clave-segura-1', hash)).toBe(true);
    expect(await verifyPassword('clave-segura-1', hash)).toBe(true);
    expect(await verifyPassword('otra', hash)).toBe(false);
    // Un hash creado por bcryptjs (por ejemplo, de una versión anterior) se verifica igual.
    const old = bcrypt.hashSync('vieja-clave', 4);
    expect(await verifyPassword('vieja-clave', old)).toBe(true);
  });

  it('un hash que no es bcrypt da false (como antes), no un error', async () => {
    expect(await verifyPassword('x', 'no-es-un-hash')).toBe(false);
  });

  it('el hash de relleno es un hash bcrypt válido y se reutiliza', async () => {
    const a = await getDummyHash(4);
    expect(await getDummyHash(4)).toBe(a);
    expect(bcrypt.getRounds(a)).toBe(4);
  });

  it('cola llena -> 503 SERVER_BUSY (1 corriendo + 16 esperando; el 18.º se rechaza)', async () => {
    const accepted = Array.from({ length: 17 }, (_, i) => hashPassword(`clave-${i}`, 4));
    await expect(hashPassword('de-mas', 4)).rejects.toMatchObject({
      status: 503,
      code: 'SERVER_BUSY',
    });
    const hashes = await Promise.all(accepted);
    expect(hashes).toHaveLength(17);
    // Pasada la avalancha, vuelve a andar.
    await expect(hashPassword('despues', 4)).resolves.toMatch(/^\$2/);
  });

  it('si el worker se termina a la fuerza: lo pendiente da 503 y la siguiente operación funciona (worker nuevo)', async () => {
    const pending = hashPassword('lenta', 12);
    const queued = hashPassword('en-cola', 12);
    const closing = closeBcryptWorker();
    await expect(pending).rejects.toMatchObject({ status: 503, code: 'SERVER_BUSY' });
    // La segunda estaba esperando su turno: cuando le toca, usa un worker nuevo y se hace bien.
    await closing;
    await queued.then(
      (h) => expect(h).toMatch(/^\$2/),
      (err: unknown) => expect(err).toMatchObject({ status: 503 }),
    );
    const hash = await hashPassword('nueva', 4);
    expect(await verifyPassword('nueva', hash)).toBe(true);
  });

  it('cerrar el worker dos veces o sin haberlo usado no falla', async () => {
    await closeBcryptWorker();
    await closeBcryptWorker();
    expect(await verifyPassword('a', bcrypt.hashSync('a', 4))).toBe(true);
  });

  it('el hilo principal no se frena mientras bcrypt trabaja (costo 12, ~0,25 s por operación)', async () => {
    let maxGap = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
    }, 5);
    await Promise.all([hashPassword('a', 12), hashPassword('b', 12)]);
    clearInterval(timer);
    // En el hilo principal, cada bcrypt de costo 12 frena el bucle de eventos cientos de ms.
    expect(maxGap).toBeLessThan(80);
  });
});
