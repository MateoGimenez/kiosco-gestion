// Contraseñas con bcryptjs (ADR 001 y 003, punto 7). El costo sale de BCRYPT_COST.
// bcrypt gasta mucha CPU: se limita a pocas operaciones a la vez, con una cola corta, para que
// una avalancha de logins no frene el mostrador. Si la cola se llena, 503 SERVER_BUSY.
import bcrypt from 'bcryptjs';
import { ERROR_CODES } from '@kiosco/shared';
import { AppError } from '../../errors';

/** Cuántas operaciones de bcrypt corren a la vez (el mostrador sigue respondiendo). */
const BCRYPT_CONCURRENCY = 2;
/** Cuántas pueden esperar su turno; más que esto se rechaza. */
const BCRYPT_MAX_QUEUE = 16;

/** Cola con concurrencia limitada. Exportada para poder probarla con otros números. */
export class LimitedQueue {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxWaiting: number,
  ) {}

  /** Corre `task` cuando haya lugar. Si la cola de espera está llena, lanza 503 SERVER_BUSY. */
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.running >= this.concurrency) {
      if (this.waiting.length >= this.maxWaiting) {
        throw new AppError(
          503,
          ERROR_CODES.SERVER_BUSY,
          'El sistema está ocupado. Probá de nuevo en unos segundos.',
          { retryAfterSeconds: 5 },
        );
      }
      // El lugar se traspasa directo al siguiente (running no baja entre uno y otro).
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.running += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) next();
      else this.running -= 1;
    }
  }

  /** Estado actual (tests). */
  get stats(): { running: number; waiting: number } {
    return { running: this.running, waiting: this.waiting.length };
  }
}

const bcryptQueue = new LimitedQueue(BCRYPT_CONCURRENCY, BCRYPT_MAX_QUEUE);

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcryptQueue.run(() => bcrypt.hash(password, cost));
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptQueue.run(() => bcrypt.compare(password, hash));
}

/** Costo con el que se generó un hash guardado (NaN si no es un hash bcrypt válido). */
export function hashCost(hash: string): number {
  try {
    return bcrypt.getRounds(hash);
  } catch {
    return Number.NaN;
  }
}

/** Último costo visto en un hash guardado de verdad (el del relleno tiene que parecerse a ese). */
let lastStoredCost: number | undefined;

export function noteStoredCost(hash: string): void {
  const cost = hashCost(hash);
  if (Number.isInteger(cost)) lastStoredCost = cost;
}

const dummyHashes = new Map<number, Promise<string>>();

/**
 * Hash de relleno para comparar cuando el usuario no existe, así el login tarda lo mismo y no
 * revela quién existe. Usa el costo de los hashes guardados (el último visto) y, si todavía no
 * vio ninguno, el configurado: así, si BCRYPT_COST cambia, el relleno no delata a los inexistentes.
 */
export function getDummyHash(configuredCost: number): Promise<string> {
  const cost = lastStoredCost ?? configuredCost;
  let hash = dummyHashes.get(cost);
  if (!hash) {
    hash = bcrypt.hash(`relleno-${Math.random()}-${Date.now()}`, cost);
    dummyHashes.set(cost, hash);
  }
  return hash;
}
