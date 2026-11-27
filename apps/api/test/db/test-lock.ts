// Candado entre corridas de tests que comparten la base `kiosco_test` (vitest de integración y e2e).
// Dos corridas a la vez se pisaban (TRUNCATE de una en medio de la otra) y daban fallos falsos.
// Con el candado, la segunda corrida ESPERA a que termine la primera y recién ahí arranca.
//
// Funciona con un archivo en la carpeta temporal del sistema, uno por base de datos. Se crea de forma
// atómica (`wx`) con el pid de quien lo tiene; si ese proceso ya no existe (corrida cortada), el
// candado se considera viejo y se pisa. Se suelta al terminar la corrida o al salir el proceso.
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const POLL_MS = 500;
const DEFAULT_WAIT_MS = 20 * 60_000;

/** Ruta del archivo de candado para una URL de base de datos (host + puerto + nombre). */
export function lockPathFor(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const key = `${url.hostname}:${url.port}${url.pathname}`;
  return join(
    tmpdir(),
    `kiosco-test-db-${createHash('sha1').update(key).digest('hex').slice(0, 12)}.lock`,
  );
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: existe pero es de otro usuario.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function tryCreate(path: string): boolean {
  try {
    const fd = openSync(path, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  }
}

function holderPid(path: string): number | null {
  try {
    const pid = Number(readFileSync(path, 'utf8').trim());
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null; // se soltó justo ahora
  }
}

/**
 * Espera el candado de la base de pruebas y lo toma. Devuelve la función que lo suelta
 * (idempotente). Si no lo consigue en `maxWaitMs`, tira un error claro en vez de pisar la otra corrida.
 */
export async function acquireTestDbLock(
  databaseUrl: string,
  maxWaitMs = DEFAULT_WAIT_MS,
): Promise<() => void> {
  const path = lockPathFor(databaseUrl);
  const started = Date.now();
  let warned = false;
  for (;;) {
    if (tryCreate(path)) break;
    const pid = holderPid(path);
    if (pid !== null && pid !== process.pid && !isAlive(pid)) {
      rmSync(path, { force: true }); // corrida cortada: el candado quedó viejo
      continue;
    }
    if (Date.now() - started > maxWaitMs) {
      throw new Error(
        `La base de pruebas sigue ocupada por otra corrida (pid ${pid ?? '?'}) después de ${Math.round(maxWaitMs / 1000)} s. Si no hay ninguna corriendo, borrá ${path}.`,
      );
    }
    if (!warned) {
      warned = true;
      console.warn(
        `[tests] Otra corrida (pid ${pid ?? '?'}) está usando la base de pruebas: espero a que termine…`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    if (holderPid(path) === process.pid) rmSync(path, { force: true });
  };
  process.once('exit', release);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      release();
      process.exit(130);
    });
  }
  return release;
}
