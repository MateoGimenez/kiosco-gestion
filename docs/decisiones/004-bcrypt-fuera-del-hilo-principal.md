# ADR 004 — bcrypt fuera del hilo principal (`worker_threads`)

- **Estado:** implementado por backend en la etapa 3 (detalles en `docs/api/ventas.md` sección 14); seguridad lo revisa al cerrar la etapa
- **Fecha:** 2026-11-26
- **Etapa:** 3 (Ventas). Resuelve la **deuda de seguridad de la etapa 1** (`docs/plan.md`, etapa 3).
- **Reemplaza:** el detalle "bcrypt corre de a 2 a la vez" del ADR 003 punto 7 y de `docs/api/auth-usuarios.md` 3.1. Todo lo demás del login no cambia.
- **Relacionado:** NF-12 (rapidez en el mostrador), NF-16 (protección del login), ADR 001 (`bcryptjs`), ADR 003 punto 7.

## Contexto

- La API es **un solo proceso de Node**: el mismo hilo atiende el login y la venta.
- Las contraseñas usan **`bcryptjs`** (JavaScript puro, sin compilar nada en Windows; ADR 001). Su versión "asíncrona" no usa otro hilo: parte el trabajo en pedazos y los corre **en el mismo hilo**, intercalados con todo lo demás.
- Hoy se corren hasta **2** bcrypt a la vez, con una cola de 16 (`503 SERVER_BUSY` si se llena). La revisión de la etapa 1 midió que, durante una avalancha de logins, una venta tarda unos 0,5 s más. NF-12 pide menos de 1 s para leer un código.

**Medición (2026-11-26, PC de desarrollo de 4 núcleos, `BCRYPT_COST=12`, 16 logins seguidos).** Se midió cuánto se atrasa una tarea corta (como un paso de una venta) mientras corren los logins:

| Variante | Atraso de cada paso (p50 / p95) | Tiempo de los 16 logins |
|---|---:|---:|
| Hilo principal, de a 2 (hoy) | 182 ms / 182 ms | 4,2 s |
| Hilo principal, de a 1 | 81 ms / 81 ms | 4,1 s |
| `worker_threads`, de a 1 | **0,4 ms / 0,6 ms** | 4,2 s |

Una venta tiene varios pasos que esperan a la base (leer caja, productos, medios, guardar, stock): cada uno puede esperar el atraso de la tabla. Con 182 ms por paso se llega fácil a los 0,5 s medidos; **de a 1 lo baja a la mitad, pero no lo saca**. En un hilo aparte el mostrador **no se entera**, y los logins tardan lo mismo. En la PC del kiosco (más lenta) los números absolutos van a ser mayores, pero la diferencia entre las variantes es la misma.

## Opciones

| Opción | Pros | Contras |
|---|---|---|
| a) Concurrencia 1 en el hilo principal | Cambiar un número. | El atraso sigue (≈ 80 ms por paso con costo 12, más en la PC del kiosco). Los logins legítimos esperan más en la cola. |
| b) **Un `worker_thread` dedicado a bcrypt** | Viene con Node (sin dependencias nuevas ni compilación). El mostrador deja de compartir la CPU con bcrypt. Mismo `bcryptjs`, mismos hashes. | Un archivo más (el worker) y su entrada en el build. Si el worker se cae hay que recrearlo. |
| c) Paquete nativo `bcrypt` (usa los hilos de libuv) | Más rápido. | Se compila en Windows (o depende de binarios precompilados): complica la instalación de la etapa 8. |
| d) Bajar `BCRYPT_COST` | Nada que programar. | Debilita las contraseñas; el costo se decide midiendo en la PC real (etapa 8), no por esto. |

## Decisión

**b), con un solo worker que procesa de a una operación**, y se mantiene la cola actual:

1. Un único `Worker` de `node:worker_threads`, creado al arrancar la API, que recibe `{ id, op: 'hash' | 'compare', ... }` y responde con el resultado. Adentro usa las funciones **sincrónicas** de `bcryptjs` (`hashSync`, `compareSync`): en su propio hilo no molestan a nadie.
2. `hashPassword`, `verifyPassword` y el hash de relleno (`getDummyHash`) pasan por el worker. **Su firma no cambia**: el resto del código (login, usuarios, `owner:reset`) no se toca.
3. `LimitedQueue` queda con **concurrencia 1** (el worker hace una a la vez) y la misma cola de **16**: si se llena, `503 SERVER_BUSY` como hoy. Con costo 12 son ≈ 4 s de espera como máximo para el último de la cola.
4. **Un solo worker y no varios:** la PC del kiosco puede tener solo 2 núcleos, y PostgreSQL y el hilo principal también los necesitan. Un worker alcanza para el uso real (unos pocos logins por turno).
5. **Si el worker se cae** (error o `exit`): las operaciones pendientes se rechazan con `503 SERVER_BUSY` y se crea uno nuevo para las siguientes. Se registra en el log.
6. **Archivo del worker:** autocontenido (solo importa `bcryptjs` y `node:worker_threads`) y con sintaxis TypeScript que Node 24 ejecuta sin compilar (solo tipos), para que funcione igual con `tsx` (desarrollo), Vitest (tests) y el build: `tsdown` lo compila como **una entrada más** junto a `server.ts`, y la API lo carga con `new Worker(new URL('./bcrypt.worker.<ext>', import.meta.url))` según corra desde `src` o desde `dist`. Detalle de backend; si hay problemas con el cargador, vale escribirlo en `.mjs`.
7. `owner:reset` (consola de la PC) puede seguir usando `bcryptjs` directo: no comparte el proceso con el mostrador.

**No se agrega ninguna variable de `.env`.**

## Cómo se verifica

- **Tests (qa):** los de login de la etapa 1 siguen pasando sin cambios (mismos hashes y mismos errores). Nuevos: `hash`/`compare` por el worker dan lo mismo que `bcryptjs` directo; con la cola llena → `503 SERVER_BUSY`; si el worker se termina a la fuerza, la operación pendiente da `503` y la siguiente funciona (worker nuevo).
- **Medición repetible:** un script de desarrollo (por ejemplo `apps/api/scripts/bench-login.ts`, fuera de la app) que lanza N logins fallidos en paralelo contra la API mientras mide cuánto tarda `GET /api/products/search?q=<código>`. **Criterio:** durante la avalancha, la búsqueda por código sigue por debajo de 200 ms (p95), lejos del 1 s de NF-12.
- **Etapa 8:** correr el mismo script en la PC del kiosco, junto con la medición de `BCRYPT_COST` que ya estaba prevista (ADR 003 punto 7).

## Consecuencias

**A favor**
- Una avalancha de logins (fuerza bruta desde el WiFi o desde afuera) ya no frena el mostrador.
- Sin dependencias nuevas, sin compilar nada en Windows, sin cambiar hashes ni contraseñas guardadas.

**En contra / cuidados**
- Un archivo y una entrada de build más; hay que probar el arranque desde `dist` (no solo con `tsx`).
- Mandar la contraseña al worker es un mensaje dentro del mismo proceso (no sale de la memoria de la API); igual, nunca se loguea el contenido de los mensajes.
- Los logins siguen tardando lo mismo (es a propósito: es la protección de bcrypt).
