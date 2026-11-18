# ADR 001 — Estructura del proyecto y herramientas

- **Estado:** aceptado (punto 6 revisado el 2026-11-18: Node 24 LTS)
- **Fecha:** 2026-11-18
- **Etapa:** 1 (Base y login), paso 1.0
- **Relacionado:** `docs/plan.md` (4.1.1 a 4.1.5), ADR 002 (dinero), ADR 003 (acceso local/remoto y HTTPS)

## Contexto

El sistema tiene un backend (Express + Prisma), un frontend (React + Vite) y código que tienen que compartir los dos: los esquemas de validación, los enums y, sobre todo, las funciones de dinero y redondeo (que tienen que dar **exactamente** lo mismo en la pantalla y en el servidor). Lo desarrolla un equipo de agentes que trabaja por etapas, y se instala en una PC con Windows sin conexión garantizada a internet.

Hacía falta decidir cómo se organiza el repo, cómo se conectan los paquetes entre sí, qué librerías se usan (y en qué versión) y qué herramientas cuidan la calidad del código.

## Decisión

### 1. Monorepo con npm workspaces

Un solo repositorio con tres paquetes, manejados con los **workspaces de npm**:

```
kiosco-gestion/
├── apps/
│   ├── api/                 # @kiosco/api — Express + Prisma (backend)
│   │   ├── prisma/          # schema.prisma, migraciones, seed
│   │   └── src/
│   │       ├── modules/<modulo>/   # rutas, servicio y validación de cada módulo
│   │       └── generated/          # cliente de Prisma generado (no se sube a git)
│   └── web/                 # @kiosco/web — React + Vite (frontend)
├── packages/
│   └── shared/              # @kiosco/shared — tipos, enums, esquemas Zod, dinero y redondeo, formato es-AR
├── e2e/                     # tests de Playwright (no es un workspace; se corre desde la raíz)
├── docs/                    # requisitos, modelo, plan, api/, decisiones/
├── .github/workflows/ci.yml # integración continua
├── docker-compose.yml       # PostgreSQL 16 para desarrollo (lo arma base-datos)
├── .env.example             # variables documentadas (el .env real no se sube)
├── eslint.config.js, .prettierrc, tsconfig.base.json, .editorconfig, .nvmrc
└── package.json             # workspaces y scripts de la raíz
```

**Por qué npm workspaces:** viene con Node, no hay que instalar ni aprender otra herramienta, y para tres paquetes alcanza de sobra.
- **Pros:** cero herramientas extra; un solo `npm install` y un solo `package-lock.json`; funciona igual en Linux (CI) y en Windows (kiosco).
- **Contras:** no tiene caché de builds ni corre tareas en paralelo como Turborepo o Nx. Con tres paquetes chicos no hace falta.
- **Descartado:** pnpm (otra herramienta que instalar en la PC del kiosco), Turborepo/Nx (complejidad sin beneficio a esta escala).

### 2. Cómo se usa el paquete compartido: como código fuente, sin compilarlo aparte

`@kiosco/shared` **no tiene paso de compilación**. Su `package.json` apunta directo al código TypeScript (`"exports": { ".": "./src/index.ts" }`), y cada consumidor lo compila con su propia herramienta:

| Quién | En desarrollo | Para producción |
|---|---|---|
| `web` | Vite lo compila al vuelo | `vite build` lo incluye en el paquete final |
| `api` | `tsx watch` lo compila al vuelo | `tsdown` empaqueta la API **junto con** `shared` en `apps/api/dist/` |
| Tests | Vitest lo compila al vuelo | — |
| Tipos | `tsc --noEmit` lo revisa como parte de cada paquete | — |

- **Pros:** un cambio en `shared` se ve al instante en la API y en las pantallas, sin "compilar shared primero" ni procesos extra mirando cambios. Es lo más simple de usar día a día.
- **Contras:** la API necesita un empaquetador (`tsdown`) para producción en lugar de solo `tsc`. Las dependencias de npm (Express, Prisma, etc.) **no** se empaquetan: quedan en `node_modules`, como siempre.
- **Plan B** si `tsdown` diera problemas con Prisma: correr la API en producción con `tsx` (sin paso de build). Es un cambio de un script.

Reglas para `shared`:
- Solo código que corre igual en Node y en el navegador: **nada** de `fs`, `process`, DOM ni Prisma. Por eso su `tsconfig` no carga tipos de Node ni del DOM.
- Sin efectos al importarlo (`"sideEffects": false`): solo exporta funciones, constantes, tipos y esquemas.

### 3. Módulos ES y TypeScript estricto

- Todos los paquetes usan **módulos ES** (`"type": "module"`, `import`/`export`).
- `tsconfig.base.json` en la raíz, que cada paquete extiende. Modo **estricto completo**: `strict`, `noUncheckedIndexedAccess` (leer `lista[0]` puede dar `undefined`), `noImplicitReturns`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax` (los `import type` quedan explícitos).
- `module: Preserve` + `moduleResolution: Bundler`: como todo pasa por un compilador (Vite, tsx, tsdown, Vitest), los `import` relativos van **sin extensión** (`import { x } from './money'`).
- `tsc` solo **chequea tipos** (`noEmit`); no genera archivos.
- `"types": []` en la base: cada paquete declara los tipos globales que usa (`node` en la API, `vite/client` en web). Así el código compartido no puede usar por error algo que solo existe en Node.

### 4. Cómo se sirve en producción y en desarrollo

- **Producción (PC del kiosco):** **un solo proceso de Node**. La API atiende `/api/*` y además sirve los archivos ya compilados de las pantallas (`apps/web/dist`), con "fallback" a `index.html` para las rutas del frontend. Pantallas y API quedan en **el mismo origen** (misma dirección y puerto).
- **Desarrollo:** Vite en `http://localhost:5173` con un **proxy** de `/api` hacia la API (`http://localhost:3000`). Para el navegador también es el mismo origen.
- **Por qué:** con el mismo origen la cookie de sesión funciona sin trucos y **no hace falta CORS** (no se instala el paquete `cors`). Hay un solo servicio de Windows para instalar (etapa 8). PA-39 quedó resuelta en el ADR 003 (opción c: HTTP en el local, HTTPS por Tailscale), que usa este mismo esquema.
- **Contra:** si algún día las pantallas se sirvieran desde otro lado, habría que agregar CORS. No está previsto.

### 5. Un solo `.env` en la raíz

- Hay **un único** `.env` en la raíz del repo (y en la carpeta de instalación en el kiosco). La API y Prisma lo cargan **con ruta explícita** a la raíz (por ejemplo, `process.loadEnvFile()` de Node o `dotenv` con `path`), no "desde la carpeta actual", porque los scripts de workspace corren dentro de `apps/api`.
- La API **valida las variables al arrancar** con un esquema Zod: si falta una obligatoria (por ejemplo `JWT_SECRET`) no arranca y lo dice claramente.
- Todas las variables están documentadas en `.env.example` (NF-13).

### 6. Versión de Node: 24 LTS (decisión revisada el 2026-11-18)

> **Decisión revisada.** La versión original de este ADR fijaba Node 22 LTS y dejaba como pregunta abierta pasar a Node 24. El dueño del proyecto aprobó el cambio en la etapa 1 (`docs/relevamiento.md`, "Etapa 1: decisiones de acceso local/remoto"), **antes** de escribir el login.

- `.nvmrc` con `24` y `"engines": { "node": "^24.11.0", "npm": ">=11" }` en **todos** los `package.json` (raíz, `api`, `web` y `shared`). 24.11.0 es la primera versión 24 marcada como LTS; npm 11 es el que viene con Node 24.
- La CI usa la misma versión: `actions/setup-node` lee `.nvmrc` (`node-version-file`), así hay **una sola fuente** de la versión.
- `@types/node` ^24.19.2 (alineado con la versión mayor de Node).
- **Por qué:** Node 22 deja de recibir parches de seguridad el **30/04/2027**; Node 24 tiene soporte hasta el **30/04/2028**. El sistema se va a usar varios años y la PC del kiosco va a estar alcanzable por Tailscale: conviene arrancar con la versión con más soporte.
- **Contra:** ninguno relevante hoy; todas las librerías de la tabla del punto 7 soportan Node 24. Verificado el 2026-11-18 con Node 24.22.3: `npm install`, `lint`, `typecheck`, `test` y `test:e2e` en verde.
- **Antes de abril de 2028** hay que pasar a la LTS siguiente (cambio chico: `.nvmrc`, `engines`, `@types/node` y correr la suite).

### 7. Librerías base y versiones

Versiones estables vigentes al 2026-11-18 (verificadas con `npm view`). En los `package.json` van con `^` (aceptan arreglos y mejoras compatibles), salvo TypeScript con `~` (solo arreglos). El `package-lock.json` se sube a git: **todos instalan exactamente lo mismo** (`npm ci` en CI y en el kiosco).

Cada agente instala las de su paquete con la versión de esta tabla (`npm install <paquete>@<versión> -w @kiosco/api`). Para cambiar de versión mayor, se actualiza este ADR.

**Backend (`@kiosco/api`)**

| Librería | Versión | Para qué | Por qué esta |
|---|---|---|---|
| `express` + `@types/express` | ^5.3.0 / ^5.0.6 | Servidor HTTP y rutas | Pedida en el stack. La versión 5 atrapa sola los errores de las funciones `async`. |
| `prisma` + `@prisma/client` | ^7.10.1 | ORM, migraciones | Pedido en el stack. Se usa la **7** (estable); la 8 todavía está en "release candidate". |
| `@prisma/adapter-pg` + `pg` | ^7.10.1 / ^8.23.1 | Conexión de Prisma a PostgreSQL | Prisma 7 se conecta a la base a través de este adaptador. |
| `zod` | ^4.6.7 | Validar requests, respuestas y `.env` | Un mismo esquema valida en el servidor y tipa el frontend (vive en `shared`). |
| `decimal.js` | ^10.6.0 | Cuentas de dinero exactas | Es la librería que usa `Prisma.Decimal` por dentro (ADR 002). Va en `shared`. |
| `helmet` | ^8.3.0 | Encabezados de seguridad HTTP | Estándar, sin configuración complicada. |
| `bcryptjs` | ^3.0.3 | Guardar contraseñas | Ver punto 8. |
| `jsonwebtoken` + `@types/jsonwebtoken` | ^9.0.3 / ^9.0.10 | Firmar y verificar la sesión | Pedido en el stack (JWT en cookie). |
| `cookie-parser` + `@types/cookie-parser` | ^1.4.7 / ^1.4.10 | Leer la cookie de sesión | El más usado con Express; mínimo. |
| `ipaddr.js` | ^2.5.0 | Decidir si la IP de un pedido está en las redes del local (`LOCAL_CIDRS`) | Agregada por el ADR 003. Normaliza IPv4/IPv6 (`::ffff:192.168.1.5`) y compara contra rangos CIDR; trae sus propios tipos. Express ya la usa por dentro. |
| `pino` + `pino-http` | ^10.4.0 / ^11.0.0 | Registro (log) del servidor y de cada pedido | Rápido, con niveles (`LOG_LEVEL`) y fácil de mandar a archivo en Windows. `pino-pretty` ^13.2.0 solo en desarrollo. |
| `tsx` (dev) | ^4.23.15 | Correr la API en desarrollo, scripts (`owner:reset`, seed) | Corre TypeScript directo, recarga al guardar. |
| `tsdown` (dev) | ^0.23.7 | Empaquetar la API para producción | Ver punto 2. Es de la misma familia que el motor de Vite 8. |

**Frontend (`@kiosco/web`)**

| Librería | Versión | Para qué | Por qué esta |
|---|---|---|---|
| `react` + `react-dom` | ^19.3.1 | Pantallas | Pedido en el stack. |
| `@types/react` + `@types/react-dom` | ^19.3.0 | Tipos | — |
| `react-router` | ^8.5.2 | Navegación entre pantallas | El estándar. Se usa como **SPA** (sin "modo framework" ni render en el servidor): más simple. |
| `@tanstack/react-query` | ^5.108.0 | Pedir datos a la API, caché y reintentos | Evita escribir a mano carga/errores/recarga de cada pantalla. |
| `vite` + `@vitejs/plugin-react` | ^8.3.8 / ^6.3.0 | Servidor de desarrollo y compilación | Pedido en el stack. |

**Tests**

| Librería | Versión | Para qué |
|---|---|---|
| `vitest` | ^5.1.1 | Unitarios e integración en los tres paquetes |
| `supertest` + `@types/supertest` | ^7.3.2 / ^7.2.1 | Pedidos HTTP a la API en los tests de integración (base `kiosco_test`) |
| `@playwright/test` | ^1.65.1 | Tests e2e (en la raíz, carpeta `e2e/`) |
| `jsdom` + `@testing-library/react` | ^31.0.1 / ^16.3.3 | Tests de componentes en `web` (si qa los usa) |

**Herramientas de la raíz (ya instaladas)**

| Librería | Versión | Para qué |
|---|---|---|
| `typescript` | ~6.0.3 | Chequeo de tipos. **No** la 7: `typescript-eslint` todavía no la soporta (admite hasta la 6.0). |
| `eslint` + `@eslint/js` | ^10.15.0 / ^10.0.1 | Revisión de código |
| `typescript-eslint` | ^8.73.0 | Reglas de ESLint para TypeScript |
| `eslint-plugin-react-hooks` + `eslint-plugin-react-refresh` | ^7.1.1 / ^0.5.8 | Reglas de React (solo en `apps/web/src`) |
| `eslint-config-prettier` + `prettier` | ^10.1.8 / ^3.10.1 | Formato automático, sin pelear con ESLint |
| `concurrently` | ^10.0.7 | Levantar API y web juntas con `npm run dev` (funciona igual en Windows) |
| `@types/node` | ^24.19.2 | Tipos de Node 24 |

**Lo que no se usa a propósito:** `cors` (mismo origen, punto 4), librería de fechas (alcanza con `Intl` nativo para la zona de Buenos Aires y el formato es-AR), `express-validator` (se usa Zod), Redux u otro manejo de estado global (TanStack Query + estado local de React alcanzan).

### 8. Contraseñas: `bcryptjs` en vez de `bcrypt`

- `bcrypt` es un **módulo nativo** (C++): trae binarios precompilados, pero si no hay uno para la combinación exacta de sistema/Node, intenta compilarse y en Windows eso necesita herramientas de compilación que la PC del kiosco no tiene. También puede chocar con antivirus o con instalaciones sin internet.
- `bcryptjs` es **JavaScript puro**: se instala igual en cualquier lado, no depende de la versión de Node y trae sus propios tipos.
- **Es el mismo algoritmo bcrypt** y produce hashes compatibles (`$2b$...`): si algún día se cambia a `bcrypt` nativo, las contraseñas guardadas siguen sirviendo.
- **Contra:** es algo más lento que el nativo. Solo se usa al entrar y al cambiar contraseñas, unas pocas veces por turno: no se nota. La lentitud no ayuda a un atacante (él usa su propio hardware). Se usan siempre las funciones **asíncronas** (`hash`, `compare`) para no trabar el servidor.
- El costo (cantidad de rondas) lo fija `seguridad` en el paso 1.2.

### 9. Calidad de código

- **ESLint en configuración plana** (`eslint.config.js`, un solo archivo en la raíz): reglas recomendadas de JS y TypeScript, reglas de React solo en `apps/web/src`, `eqeqeq` y **prohibido `parseFloat`** (el dinero nunca pasa por números de coma flotante, ADR 002). Las reglas que necesitan información de tipos (más lentas y con más configuración) no se activan por ahora; se pueden sumar si qa o seguridad lo piden.
- **Prettier** para el formato (comillas simples, punto y coma, 100 columnas, fin de línea LF). La documentación Markdown no se formatea automáticamente.
- **`.editorconfig`** y **`.gitattributes`** (LF en todo): el formato no cambia si alguien edita desde Windows.

### 10. Scripts

Los scripts de la raíz (`docs/plan.md` 4.1.3) delegan en los workspaces. Para que funcionen, **cada workspace expone estos nombres**:

| Workspace | Scripts que tiene que tener |
|---|---|
| `@kiosco/shared` | `typecheck`, `test` |
| `@kiosco/api` | `dev`, `build`, `typecheck`, `test`, `db:migrate` (`prisma migrate dev`), `db:migrate:deploy` (`prisma migrate deploy`, para CI y el kiosco), `db:seed`, `db:reset`, `owner:reset` |
| `@kiosco/web` | `dev`, `build`, `typecheck`, `test` |

`npm run lint`, `format` y `test:e2e` corren desde la raíz. `npm run typecheck` y `npm test` recorren los workspaces y saltean los que todavía no tienen el script (`--if-present`).

### 11. Integración continua (GitHub Actions)

`.github/workflows/ci.yml`: en cada push y pull request corre `npm ci` → lint → formato → tipos → migraciones sobre un PostgreSQL 16 temporal → `npm test`. Los e2e de Playwright corren además en los pull request hacia `main`. La clave `JWT_SECRET` de CI se genera al azar en cada corrida (no queda escrita en el repo).

## Consecuencias

**A favor**
- Un solo `npm install` y un solo `npm run dev` para todo.
- El contrato de la API es **código** (esquemas Zod en `shared`) y las cuentas de dinero son **una sola implementación** usada por servidor y pantallas.
- Pocas herramientas, todas estándar; nada que compilar en la PC del kiosco.

**En contra / cuidados**
- La API necesita `tsdown` para producción (plan B: `tsx`).
- Hay que respetar que `shared` no use nada de Node ni del navegador.
- Node 24 vence en abril de 2028 (punto 6): actualizar a la LTS siguiente antes de esa fecha.

## Preguntas abiertas

Ninguna. La única (pasar a Node 24) quedó resuelta: ver punto 6.
