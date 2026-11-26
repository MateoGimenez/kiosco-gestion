// Contraseñas con bcryptjs (ADR 001, 003 punto 7 y ADR 004). El costo sale de BCRYPT_COST.
// bcrypt gasta mucha CPU: corre en UN worker_thread aparte (el mostrador no se entera), de a una
// operación, con una cola corta. Si la cola se llena, 503 SERVER_BUSY.
import { Worker } from 'node:worker_threads';
import bcrypt from 'bcryptjs';
import { ERROR_CODES } from '@kiosco/shared';
import { AppError } from '../../errors';

/** Cuántas operaciones de bcrypt corren a la vez: el worker hace una por vez (ADR 004). */
const BCRYPT_CONCURRENCY = 1;
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

// --- Worker ---------------------------------------------------------------------------------

type WorkerRequest =
  | { op: 'hash'; password: string; cost: number }
  | { op: 'compare'; password: string; hash: string };
type WorkerResponse =
  { id: number; ok: true; result: string | boolean } | { id: number; ok: false };

interface Pending {
  resolve: (value: string | boolean) => void;
  reject: (err: unknown) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

const busyError = () =>
  new AppError(
    503,
    ERROR_CODES.SERVER_BUSY,
    'El sistema está ocupado. Probá de nuevo en unos segundos.',
    { retryAfterSeconds: 5 },
  );

/** Desde `src` (dev, tests) el worker es .ts; desde el build (`dist/server.mjs`) es .mjs. */
function workerUrl(): URL {
  const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'mjs';
  return new URL(`./bcrypt.worker.${ext}`, import.meta.url);
}

/** Rechaza todo lo pendiente con 503: el worker se cayó o se cerró. */
function failPending(): void {
  for (const p of pending.values()) p.reject(busyError());
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(workerUrl());
  // No mantiene vivo el proceso por sí solo: el apagado lo cierra con `closeBcryptWorker`.
  w.unref();
  w.on('message', (msg: WorkerResponse) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error('bcrypt falló.'));
  });
  // Si se cae (error o salida), lo pendiente da 503 y el próximo pedido crea un worker nuevo.
  const onGone = (err?: unknown) => {
    if (worker === w) worker = null;
    // Se avisa por consola solo si fue un error: el log de la app no está acá y no se imprime nada del mensaje.
    if (err) console.error('El worker de bcrypt se cayó:', (err as Error).name ?? 'error');
    failPending();
  };
  w.once('error', onGone);
  w.once('exit', () => onGone());
  worker = w;
  return w;
}

function callWorker(request: WorkerRequest): Promise<string | boolean> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage({ id, ...request });
    } catch (err) {
      pending.delete(id);
      reject(err);
    }
  });
}

/** Crea el worker al arrancar la API (si no, se crea con el primer login). */
export function startBcryptWorker(): void {
  getWorker();
}

/** Cierra el worker al apagar el servidor. Lo pendiente da 503. Se puede volver a usar después (crea otro). */
export async function closeBcryptWorker(): Promise<void> {
  const w = worker;
  worker = null;
  if (w) await w.terminate();
  failPending();
}

export function hashPassword(password: string, cost: number): Promise<string> {
  return bcryptQueue.run(async () => (await callWorker({ op: 'hash', password, cost })) as string);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcryptQueue.run(
    async () => (await callWorker({ op: 'compare', password, hash })) as boolean,
  );
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
    // Una sola vez por costo: va directo al worker (que hace una operación por vez), sin pasar por la cola.
    hash = callWorker({
      op: 'hash',
      password: `relleno-${Math.random()}-${Date.now()}`,
      cost,
    }) as Promise<string>;
    dummyHashes.set(cost, hash);
    // Si falló (worker caído), no se queda guardado el error: el próximo login lo vuelve a pedir.
    hash.catch(() => dummyHashes.delete(cost));
  }
  return hash;
}
