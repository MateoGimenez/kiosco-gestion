// Medición del ADR 004: cuánto se frena el mostrador mientras hay una avalancha de logins.
// Lanza N logins FALLIDOS (usuarios inexistentes: igual gastan un bcrypt) en paralelo y, a la vez,
// repite la búsqueda por código `GET /api/products/search?q=...` midiendo cuánto tarda.
// Criterio del ADR 004: la búsqueda sigue por debajo de 200 ms (p95) durante la avalancha.
//
// Uso (con la API andando, y un usuario válido):
//   BENCH_USERNAME=dueno BENCH_PASSWORD=... npm run bench:login -w @kiosco/api
// Variables: BENCH_URL (por defecto http://localhost:<PORT>), BENCH_LOGINS (16), BENCH_QUERY (un código o nombre).
// Es solo una herramienta de desarrollo: no forma parte de la app ni se empaqueta.
import { loadRootEnvFile } from '../src/config';

loadRootEnvFile();
const port = process.env.LOCAL_PORT ?? process.env.PORT ?? '3000';
const base = process.env.BENCH_URL ?? `http://localhost:${port}`;
const origin = new URL(base).origin;
const logins = Number(process.env.BENCH_LOGINS ?? '16');
const query = process.env.BENCH_QUERY ?? 'a';
const username = process.env.BENCH_USERNAME;
const password = process.env.BENCH_PASSWORD;
if (!username || !password) {
  console.error('Faltan BENCH_USERNAME y BENCH_PASSWORD (un usuario válido para la búsqueda).');
  process.exit(1);
}

const headers = { 'Content-Type': 'application/json', 'X-Kiosco': '1', Origin: origin };

async function login(user: string, pass: string): Promise<Response> {
  return fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ username: user, password: pass }),
  });
}

const first = await login(username, password);
if (first.status !== 200) {
  console.error(`No se pudo entrar con ${username}: ${first.status}`);
  process.exit(1);
}
const cookie = (first.headers.getSetCookie()[0] ?? '').split(';')[0] ?? '';

async function searchMs(): Promise<number> {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/products/search?q=${encodeURIComponent(query)}`, {
    headers: { Cookie: cookie },
  });
  await res.arrayBuffer();
  if (res.status !== 200) throw new Error(`La búsqueda dio ${res.status}`);
  return performance.now() - t0;
}

const percentile = (sorted: number[], p: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
const summary = (label: string, samples: number[]) => {
  const s = [...samples].sort((a, b) => a - b);
  console.log(
    `${label}: n=${s.length}  p50=${percentile(s, 50).toFixed(1)} ms  p95=${percentile(s, 95).toFixed(1)} ms  máx=${(s.at(-1) ?? 0).toFixed(1)} ms`,
  );
};

// 1) Sin logins: línea de base.
const idle: number[] = [];
for (let i = 0; i < 30; i++) idle.push(await searchMs());
summary('Búsqueda sin logins     ', idle);

// 2) Con la avalancha de logins fallidos en paralelo.
let running = true;
const busy: number[] = [];
const searcher = (async () => {
  while (running) busy.push(await searchMs());
})();
const t0 = performance.now();
const results = await Promise.all(
  Array.from({ length: logins }, (_, i) =>
    login(`nobody-${i}-${Math.random().toString(36).slice(2, 8)}`, 'mala-clave'),
  ),
);
const loginsMs = performance.now() - t0;
running = false;
await searcher;
const codes = new Map<number, number>();
for (const r of results) codes.set(r.status, (codes.get(r.status) ?? 0) + 1);
summary('Búsqueda con la avalancha', busy);
console.log(
  `${logins} logins fallidos en ${(loginsMs / 1000).toFixed(1)} s; respuestas: ${[...codes].map(([c, n]) => `${c} x${n}`).join(', ')}`,
);
const p95 = percentile(
  [...busy].sort((a, b) => a - b),
  95,
);
console.log(
  p95 < 200 ? 'OK: p95 por debajo de 200 ms (ADR 004).' : 'ATENCIÓN: p95 de 200 ms o más.',
);
process.exit(p95 < 200 ? 0 : 2);
