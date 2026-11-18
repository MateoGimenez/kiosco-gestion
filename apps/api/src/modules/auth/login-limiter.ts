// Límite de intentos de login, en memoria, por (usuario escrito, puerta) (ADR 003, punto 7).
// Se cuenta igual para nombres que no existen, así no se revela quién existe.
// Se reinicia con la API: aceptado (nadie de afuera puede reiniciarla).
import type { Channel } from '../../channel';

export interface LimiterOptions {
  maxAttempts: number;
  windowMinutes: number;
  lockMinutes: number;
  /** Tope de entradas en memoria. */
  maxEntries?: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

interface Entry {
  failures: number[]; // instantes (ms) de los fallos dentro de la ventana
  lockedUntil: number;
}

export interface FailureResult {
  /** True si ESTE fallo empezó el bloqueo. */
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly opts: LimiterOptions) {
    this.maxEntries = opts.maxEntries ?? 10_000;
    this.now = opts.now ?? Date.now;
  }

  private key(username: string, channel: Channel): string {
    return `${channel}:${username}`;
  }

  /** Segundos que faltan para que termine el bloqueo, o 0 si no está bloqueado. */
  lockedSeconds(username: string, channel: Channel): number {
    const entry = this.entries.get(this.key(username, channel));
    if (!entry) return 0;
    const left = entry.lockedUntil - this.now();
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** Intentos que le quedan a ese par (se calcula igual exista o no el usuario). */
  remainingAttempts(username: string, channel: Channel): number {
    const entry = this.entries.get(this.key(username, channel));
    const windowStart = this.now() - this.opts.windowMinutes * 60_000;
    const count = entry ? entry.failures.filter((t) => t > windowStart).length : 0;
    return Math.max(0, this.opts.maxAttempts - count);
  }

  recordFailure(username: string, channel: Channel): FailureResult {
    const now = this.now();
    const key = this.key(username, channel);
    this.makeRoom(key);
    const entry = this.entries.get(key) ?? { failures: [], lockedUntil: 0 };
    const windowStart = now - this.opts.windowMinutes * 60_000;
    entry.failures = entry.failures.filter((t) => t > windowStart);
    entry.failures.push(now);

    let locked = false;
    if (entry.failures.length >= this.opts.maxAttempts) {
      entry.lockedUntil = now + this.opts.lockMinutes * 60_000;
      entry.failures = [];
      locked = true;
    }
    // Se vuelve a insertar para que quede como el más reciente.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return {
      locked,
      remainingAttempts: Math.max(0, this.opts.maxAttempts - entry.failures.length),
      retryAfterSeconds: locked ? this.opts.lockMinutes * 60 : 0,
    };
  }

  /** Borra el contador de un par (login exitoso). */
  reset(username: string, channel: Channel): void {
    this.entries.delete(this.key(username, channel));
  }

  /** Borra el contador de un usuario en las dos puertas (reseteo de contraseña). */
  resetUser(username: string): void {
    this.reset(username, 'local');
    this.reset(username, 'remote');
  }

  /** Cantidad de entradas (tests). */
  get size(): number {
    return this.entries.size;
  }

  /** Mantiene el tope: primero limpia lo vencido, y si sigue lleno saca lo más viejo. */
  private makeRoom(incomingKey: string): void {
    if (this.entries.has(incomingKey) || this.entries.size < this.maxEntries) return;
    const now = this.now();
    const windowStart = now - this.opts.windowMinutes * 60_000;
    for (const [k, e] of this.entries) {
      if (e.lockedUntil <= now && e.failures.every((t) => t <= windowStart)) this.entries.delete(k);
    }
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}
