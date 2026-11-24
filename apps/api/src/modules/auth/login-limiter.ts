// Límite de intentos de login, en memoria (ADR 003, punto 7).
//
// Tres defensas, todas síncronas (sin `await` entre el chequeo y la anotación, así dos pedidos
// en paralelo no pueden saltearse el límite):
//  1. Por (usuario escrito, puerta): los intentos EN CURSO cuentan desde antes de comparar la
//     contraseña (`begin`). Se descuentan si el login sale bien y se vuelven fallo si sale mal.
//     Se cuenta igual para nombres que no existen, así no se revela quién existe.
//  2. Por puerta: tope de intentos por minuto (frena una avalancha de nombres inventados).
//  3. En la puerta local, además, tope por minuto por IP del socket.
// Se reinicia con la API: aceptado (nadie de afuera puede reiniciarla).
import type { Channel } from '../../channel';

export interface LimiterOptions {
  maxAttempts: number;
  windowMinutes: number;
  lockMinutes: number;
  /** Tope de intentos por minuto por puerta (todas las personas juntas). Sin valor: sin tope. */
  maxPerMinuteDoor?: number;
  /** Tope de intentos por minuto por IP del socket (solo puerta local). Sin valor: sin tope. */
  maxPerMinuteIp?: number;
  /** Tope de entradas en memoria. */
  maxEntries?: number;
  /** Reloj inyectable (tests). */
  now?: () => number;
}

interface Entry {
  failures: number[]; // instantes (ms) de los fallos dentro de la ventana
  lockedUntil: number;
  /** Intentos que ya reservaron lugar pero todavía no terminaron de comparar la contraseña. */
  pending: number;
}

export interface FailureResult {
  /** True si ESTE fallo empezó el bloqueo. */
  locked: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}

/** Por qué no se dejó empezar el intento. */
export type RejectReason = 'LOCKED' | 'PENDING' | 'RATE';

/** Reserva de un intento. Hay que cerrarla con `fail`, `succeed` o `cancel` (las dos últimas son seguras de repetir). */
export interface Ticket {
  /** La contraseña fue incorrecta (o el usuario no puede entrar): suma un fallo. */
  fail(): FailureResult;
  /** Login correcto: borra el contador del par. */
  succeed(): void;
  /** El intento no llegó a resolverse (error interno, cola llena): libera el lugar sin sumar fallo. */
  cancel(): void;
}

export type BeginResult =
  { ok: true; ticket: Ticket } | { ok: false; reason: RejectReason; retryAfterSeconds: number };

/** Segundos de espera sugeridos cuando hay demasiados intentos en curso a la vez. */
const PENDING_RETRY_SECONDS = 5;
/** Qué fracción de las entradas se descarta cuando se llena el mapa. */
const EVICT_FRACTION = 0.1;

export class LoginLimiter {
  private readonly entries = new Map<string, Entry>();
  /** Instantes (ms) de los intentos del último minuto, por "puerta" o "IP". */
  private readonly rates = new Map<string, number[]>();
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(private readonly opts: LimiterOptions) {
    this.maxEntries = opts.maxEntries ?? 20_000;
    this.now = opts.now ?? Date.now;
  }

  private key(username: string, channel: Channel): string {
    return `${channel}:${username}`;
  }

  private get windowMs(): number {
    return this.opts.windowMinutes * 60_000;
  }

  /** Fallos que siguen dentro de la ventana. */
  private recentFailures(entry: Entry): number {
    const windowStart = this.now() - this.windowMs;
    return entry.failures.filter((t) => t > windowStart).length;
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
    return Math.max(0, this.opts.maxAttempts - (entry ? this.recentFailures(entry) : 0));
  }

  /**
   * Reserva un intento ANTES de comparar la contraseña. Es síncrono: el chequeo de bloqueo,
   * los topes y la anotación del intento en curso ocurren sin ceder el control, así que una
   * ráfaga en paralelo no puede pasar de `maxAttempts` intentos entre fallos e intentos en curso.
   */
  begin(username: string, channel: Channel, ip?: string | null): BeginResult {
    const key = this.key(username, channel);
    const existing = this.entries.get(key);

    // 1. Ya bloqueado.
    if (existing) {
      const left = existing.lockedUntil - this.now();
      if (left > 0)
        return { ok: false, reason: 'LOCKED', retryAfterSeconds: Math.ceil(left / 1000) };
    }

    // 2. Topes por minuto (puerta y, en la local, IP).
    const rateKeys = [`door:${channel}`];
    if (channel === 'local' && ip) rateKeys.push(`ip:${ip}`);
    const limits = [
      this.opts.maxPerMinuteDoor,
      channel === 'local' ? this.opts.maxPerMinuteIp : undefined,
    ];
    for (const [i, rk] of rateKeys.entries()) {
      const limit = limits[i];
      if (limit === undefined) continue;
      const wait = this.rateWaitSeconds(rk, limit);
      if (wait > 0) return { ok: false, reason: 'RATE', retryAfterSeconds: wait };
    }

    // 3. Fallos recientes + intentos en curso: si ya alcanzan el máximo, este no empieza.
    const used = existing ? this.recentFailures(existing) + existing.pending : 0;
    if (used >= this.opts.maxAttempts) {
      return { ok: false, reason: 'PENDING', retryAfterSeconds: PENDING_RETRY_SECONDS };
    }

    // Todo en orden: se anota el intento (tope por minuto + intento en curso).
    const entry = existing ?? this.createEntry(key);
    if (!entry) return { ok: false, reason: 'RATE', retryAfterSeconds: PENDING_RETRY_SECONDS };
    const now = this.now();
    rateKeys.forEach((rk, i) => {
      if (limits[i] !== undefined) this.noteRate(rk, now);
    });
    entry.pending += 1;
    return { ok: true, ticket: this.makeTicket(key, entry, username, channel) };
  }

  private makeTicket(key: string, entry: Entry, username: string, channel: Channel): Ticket {
    let settled = false;
    const release = () => {
      entry.pending = Math.max(0, entry.pending - 1);
    };
    return {
      fail: () => {
        if (!settled) {
          settled = true;
          release();
        }
        return this.registerFailure(key, entry);
      },
      succeed: () => {
        if (settled) return;
        settled = true;
        release();
        this.reset(username, channel);
      },
      cancel: () => {
        if (settled) return;
        settled = true;
        release();
        this.dropIfIdle(key, entry);
      },
    };
  }

  /** Suma un fallo y, si llega al máximo, empieza el bloqueo. */
  private registerFailure(key: string, entry: Entry): FailureResult {
    const now = this.now();
    // Si la entrada fue desalojada o reseteada mientras tanto, se vuelve a registrar.
    if (this.entries.get(key) !== entry) this.entries.set(key, entry);
    entry.failures = entry.failures.filter((t) => t > now - this.windowMs);
    entry.failures.push(now);

    let locked = false;
    if (entry.failures.length >= this.opts.maxAttempts) {
      entry.lockedUntil = now + this.opts.lockMinutes * 60_000;
      entry.failures = [];
      locked = true;
    }
    return {
      locked,
      remainingAttempts: Math.max(0, this.opts.maxAttempts - entry.failures.length),
      retryAfterSeconds: locked ? this.opts.lockMinutes * 60 : 0,
    };
  }

  /** Borra el contador de un par (login exitoso, o cambio de nombre o rol). */
  reset(username: string, channel: Channel): void {
    const key = this.key(username, channel);
    const entry = this.entries.get(key);
    if (!entry) return;
    // Si hay intentos en curso, se conserva la entrada (solo se limpian fallos y bloqueo).
    if (entry.pending > 0) {
      entry.failures = [];
      entry.lockedUntil = 0;
    } else {
      this.entries.delete(key);
    }
  }

  /** Borra el contador de un usuario en las dos puertas (reseteo de contraseña, renombre, cambio de rol). */
  resetUser(username: string): void {
    this.reset(username, 'local');
    this.reset(username, 'remote');
  }

  /** Cantidad de entradas (tests). */
  get size(): number {
    return this.entries.size;
  }

  // --- Topes por minuto -------------------------------------------------------------------

  /** Segundos que faltan para poder intentar de nuevo, o 0 si todavía hay lugar. */
  private rateWaitSeconds(rateKey: string, limit: number): number {
    const list = this.rates.get(rateKey);
    if (!list) return 0;
    const cutoff = this.now() - 60_000;
    const recent = list.filter((t) => t > cutoff);
    if (recent.length < limit) return 0;
    return Math.max(1, Math.ceil((recent[0]! + 60_000 - this.now()) / 1000));
  }

  private noteRate(rateKey: string, now: number): void {
    const cutoff = now - 60_000;
    if (!this.rates.has(rateKey) && this.rates.size >= this.maxEntries) {
      // Se limpian los contadores que ya no tienen intentos del último minuto.
      for (const [k, list] of this.rates) {
        if (list.every((t) => t <= cutoff)) this.rates.delete(k);
      }
      // Si siguen todos activos, se deja de contar por IP nueva (la puerta sigue protegida).
      if (this.rates.size >= this.maxEntries) return;
    }
    const list = (this.rates.get(rateKey) ?? []).filter((t) => t > cutoff);
    list.push(now);
    this.rates.set(rateKey, list);
  }

  // --- Memoria acotada --------------------------------------------------------------------

  private dropIfIdle(key: string, entry: Entry): void {
    if (
      entry.pending === 0 &&
      entry.lockedUntil <= this.now() &&
      this.recentFailures(entry) === 0 &&
      this.entries.get(key) === entry
    ) {
      this.entries.delete(key);
    }
  }

  /** Crea la entrada; si el mapa está lleno, primero hace lugar. Devuelve null si no se pudo. */
  private createEntry(key: string): Entry | null {
    if (this.entries.size >= this.maxEntries) this.makeRoom();
    if (this.entries.size >= this.maxEntries) return null;
    const entry: Entry = { failures: [], lockedUntil: 0, pending: 0 };
    this.entries.set(key, entry);
    return entry;
  }

  /**
   * Hace lugar sin ayudar a quien inunda con nombres inventados: primero se borra lo vencido y,
   * si hace falta, un lote (10 %) de las entradas MENOS importantes: sin bloqueo y con menos
   * fallos (los nombres inventados suelen tener uno solo). Los bloqueados y los que están
   * siendo atacados de verdad (muchos fallos) se conservan. No se tocan los intentos en curso.
   */
  private makeRoom(): void {
    const now = this.now();
    const windowStart = now - this.windowMs;
    for (const [k, e] of this.entries) {
      if (e.pending === 0 && e.lockedUntil <= now && e.failures.every((t) => t <= windowStart)) {
        this.entries.delete(k);
      }
    }
    if (this.entries.size < this.maxEntries) return;

    const candidates = [...this.entries.entries()]
      .map(([k, e], order) => ({
        k,
        order,
        locked: e.lockedUntil > now ? 1 : 0,
        failures: e.failures.length,
        pending: e.pending,
      }))
      .filter((c) => c.pending === 0)
      .sort((a, b) => a.locked - b.locked || a.failures - b.failures || a.order - b.order);
    const batch = Math.max(1, Math.floor(this.maxEntries * EVICT_FRACTION));
    for (const c of candidates.slice(0, batch)) this.entries.delete(c.k);
  }
}
