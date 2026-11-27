import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { acquireTestDbLock, lockPathFor } from './test-lock';

// URL propia de este archivo: no choca con el candado real de `kiosco_test`.
const URL_FOR_TESTS = `postgresql://u:p@localhost:5432/lock_selftest_${process.pid}_test`;
const path = lockPathFor(URL_FOR_TESTS);

afterEach(() => rmSync(path, { force: true }));

describe('candado de la base de pruebas (unitarias)', () => {
  it('toma el candado, lo suelta y puede volver a tomarse', async () => {
    const release = await acquireTestDbLock(URL_FOR_TESTS, 1000);
    expect(existsSync(path)).toBe(true);
    release();
    expect(existsSync(path)).toBe(false);
    release(); // soltar dos veces no rompe
    const again = await acquireTestDbLock(URL_FOR_TESTS, 1000);
    again();
  });

  it('una segunda corrida espera a que la primera lo suelte', async () => {
    const release = await acquireTestDbLock(URL_FOR_TESTS, 1000);
    // Lo que el pid actual tiene tomado cuenta como ocupado: se simula otra corrida con el pid del padre.
    writeFileSync(path, String(process.ppid));
    let acquired = false;
    const second = acquireTestDbLock(URL_FOR_TESTS, 5000).then((r) => {
      acquired = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 1200));
    expect(acquired).toBe(false); // el padre sigue vivo: se espera
    rmSync(path, { force: true }); // "termina" la otra corrida
    const releaseSecond = await second;
    expect(acquired).toBe(true);
    releaseSecond();
    release();
  });

  it('un candado de un proceso que ya no existe se pisa', async () => {
    writeFileSync(path, '999999999');
    const release = await acquireTestDbLock(URL_FOR_TESTS, 2000);
    expect(existsSync(path)).toBe(true);
    release();
  });

  it('si el candado no se libera a tiempo, falla con un mensaje claro en vez de pisar a la otra corrida', async () => {
    writeFileSync(path, String(process.ppid));
    await expect(acquireTestDbLock(URL_FOR_TESTS, 700)).rejects.toThrow(/sigue ocupada/);
  });
});
