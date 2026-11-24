# Kiosco: sistema de gestión

Sistema para administrar un kiosco: ventas, stock, proveedores, compras, precios, caja, usuarios y reportes. No hay fiado: no se le vende a nadie a crédito del kiosco.

> [!NOTE]
> **Estado: etapa 1 de 9 (base y login).** Está armado el proyecto, la base de datos, el login con roles, la gestión de usuarios y el cambio de contraseña. Todavía no hay ventas, stock ni caja: llegan en las etapas siguientes. El plan completo está en [`docs/plan.md`](docs/plan.md).

Stack: TypeScript · React (Vite) · Node.js + Express · PostgreSQL 16 + Prisma.

## Requisitos

- **Node.js 24** (la versión está en [`.nvmrc`](.nvmrc)). Con `nvm`, correr `nvm use` en la raíz instala y usa esa versión.
- **npm 11** o superior (viene con Node 24).
- **PostgreSQL 16**, de una de estas dos formas:
  - **Docker** (recomendado para desarrollo): corre la base en un contenedor con `npm run db:up`.
  - **PostgreSQL 16 instalado** en la PC, sin Docker.

## Puesta en marcha

Los pasos 1 a 3 son iguales en los dos caminos.

### Camino A: con Docker

1. Instalar las dependencias:

   ```bash
   npm install
   ```

2. Crear el archivo de configuración a partir del ejemplo y completarlo:

   ```bash
   cp .env.example .env
   ```

   Hay que cambiar `JWT_SECRET` (la clave que firma las sesiones). Para generar una:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   ```

   Pegá el resultado en `JWT_SECRET=` dentro de `.env`.

   > [!WARNING]
   > `JWT_SECRET` no puede quedar con el valor de ejemplo ni tener menos de 32 bytes. Si lo deja así, la API no arranca. Además, la clave no se sube a git (`.env` está en `.gitignore`).

   También conviene cambiar `POSTGRES_PASSWORD` y las dos URLs (`DATABASE_URL` y `DATABASE_URL_TEST`) para que usen esa misma clave. Docker toma la clave solo la primera vez que crea la base. Si la cambiás después, hay que borrar el volumen de datos de PostgreSQL (`docker volume ls` muestra su nombre, que incluye `kiosco_pgdata`), lo que borra todos los datos.

3. Levantar PostgreSQL, aplicar las migraciones y crear el dueño:

   ```bash
   npm run db:up
   npm run db:migrate:deploy
   npm run owner:reset
   ```

   `owner:reset` pide el nombre de usuario del dueño, su nombre completo (solo si el usuario no existe) y la contraseña, dos veces. Ver [la guía del manual](docs/manual/05-si-el-dueno-olvido-la-contrasena.md).

4. Arrancar la API y la web:

   ```bash
   npm run dev
   ```

5. Abrir <http://localhost:5173> y entrar con el dueño que creaste.

### Camino B: sin Docker

1. Tener PostgreSQL 16 instalado y crear un usuario y dos bases. Ejemplo en `psql`, con una clave propia:

   ```sql
   CREATE USER kiosco WITH PASSWORD 'una-clave-propia';
   CREATE DATABASE kiosco_dev OWNER kiosco;
   CREATE DATABASE kiosco_test OWNER kiosco;
   ```

2. Instalar las dependencias y crear el `.env`, igual que en el camino A (pasos 1 y 2).

3. En `.env`, apuntar `DATABASE_URL` a `kiosco_dev` y `DATABASE_URL_TEST` a `kiosco_test`, con el usuario y la clave del paso 1. Formato:

   ```
   DATABASE_URL=postgresql://kiosco:una-clave-propia@localhost:5432/kiosco_dev?schema=public
   DATABASE_URL_TEST=postgresql://kiosco:una-clave-propia@localhost:5432/kiosco_test?schema=public
   ```

   `DATABASE_URL_TEST` tiene que terminar en `_test`: los tests y los e2e se niegan a correr contra otra base.

4. Aplicar las migraciones, crear el dueño y arrancar:

   ```bash
   npm run db:migrate:deploy
   npm run owner:reset
   npm run dev
   ```

5. Abrir <http://localhost:5173>.

> [!NOTE]
> `npm run db:up` y `npm run db:down` no se usan en el camino B. El script `db:seed` todavía no carga datos: los usuarios no se siembran a propósito (el dueño se crea con `owner:reset`).

## Tests

| Comando | Qué corre |
|---|---|
| `npm test` | Tests unitarios e integración de `shared`, `api` y `web` (Vitest). Los de integración usan la base `kiosco_test`. |
| `npm run db:test:prepare` | Aplica las migraciones a `kiosco_test` sin correr tests. Es opcional: `npm test` ya lo hace. |
| `npm run test:e2e` | Tests de punta a punta en el navegador (Playwright). Levanta su propia API y web, contra `kiosco_test`. |

Para los e2e, la primera vez hay que instalar el navegador:

```bash
npx playwright install chromium
```

Los e2e necesitan la base de pruebas levantada (Docker o PostgreSQL propio). No hace falta tener `npm run dev` corriendo.

> [!NOTE]
> Los tests de la API usan un costo de bcrypt bajo (`BCRYPT_COST` se acepta desde 4 solo con `NODE_ENV=test`). En producción el rango es de 10 a 14.

## Estructura de carpetas

```
kiosco-gestion/
├── apps/
│   ├── api/                # API: Express + Prisma
│   │   ├── prisma/         # schema.prisma, migraciones y seed
│   │   ├── scripts/        # owner-reset.ts (npm run owner:reset)
│   │   ├── src/
│   │   │   ├── modules/    # auth (login, sesión) y users (usuarios), por módulo
│   │   │   ├── middleware/ # control de cada pedido: puerta, Host, CSRF, sesión y rol
│   │   │   └── config.ts   # lectura y validación del .env
│   │   └── test/           # tests de integración y base de pruebas
│   └── web/                # pantallas: React + Vite
│       └── src/
│           ├── pages/      # una pantalla por archivo (Entrar, Usuarios, cambiar contraseña)
│           ├── layout/     # barra superior y menú según el rol
│           ├── components/ # botones, campos, avisos y diálogos
│           └── lib/        # cliente de la API, sesión y textos de error
├── packages/
│   └── shared/             # esquemas Zod, roles, dinero y redondeo, compartidos por API y web
├── e2e/                    # tests de Playwright
├── docs/                   # requisitos, modelo de datos, plan, decisiones (ADR), API y manual
├── docker/                 # script que crea las bases al levantar PostgreSQL
├── .github/workflows/      # integración continua (GitHub Actions)
├── docker-compose.yml      # PostgreSQL 16 para desarrollo
├── .env.example            # variables de entorno documentadas
└── package.json            # workspaces y scripts de la raíz
```

## Scripts disponibles

Todos se corren desde la raíz del repo.

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta la API y la web en modo desarrollo. |
| `npm run db:up` | Enciende PostgreSQL en Docker y espera a que esté listo. |
| `npm run db:down` | Apaga el contenedor de PostgreSQL (conserva los datos). |
| `npm run db:generate` | Regenera el cliente de Prisma. |
| `npm run db:migrate` | Crea y aplica migraciones nuevas (`prisma migrate dev`). Solo para desarrollo. |
| `npm run db:migrate:deploy` | Aplica las migraciones pendientes sin crear nuevas. Es el que se usa en una base nueva. |
| `npm run db:seed` | Corre el seed (hoy no carga datos). |
| `npm run db:reset` | **Borra** la base de desarrollo, la recrea y corre el seed. Ver la nota de abajo. |
| `npm run db:test:prepare` | Aplica las migraciones a la base de pruebas `kiosco_test`. |
| `npm run owner:reset` | Crea al dueño o resetea su contraseña, desde la consola de la PC. |
| `npm test` | Tests unitarios e integración (Vitest) en todos los paquetes. |
| `npm run test:e2e` | Tests de Playwright. |
| `npm run lint` / `npm run lint:fix` | Revisa el código con ESLint (y corrige lo automático). |
| `npm run format` / `npm run format:check` | Da formato con Prettier / verifica que esté formateado. |
| `npm run typecheck` | Chequeo de tipos en todo el repo y en los e2e. |
| `npm run build` | Compila la web y la API para producción. |

> [!WARNING]
> `npm run db:reset` **borra todos los datos** de la base de desarrollo. Antes de correrlo, asegurate de que no tenga nada que quieras conservar.
>
> Si lo corre un asistente de IA, Prisma lo frena y pide una confirmación explícita de la persona que está a cargo, antes de borrar nada.

## Variables de entorno

El archivo `.env` va en la **raíz** del repo, y es uno solo para todo el proyecto. La lista completa, con comentarios en español, está en [`.env.example`](.env.example). Las más importantes:

| Variable | Para qué | Ejemplo (no usar tal cual) |
|---|---|---|
| `DATABASE_URL` | Base de desarrollo. | `postgresql://kiosco:cambiar_esta_clave@localhost:5432/kiosco_dev?schema=public` |
| `DATABASE_URL_TEST` | Base de tests. Tiene que terminar en `_test`. | `postgresql://kiosco:cambiar_esta_clave@localhost:5432/kiosco_test?schema=public` |
| `JWT_SECRET` | Firma de las sesiones. Obligatoria, de 32 bytes o más. | (generar con el comando de arriba) |
| `SESSION_HOURS` | Duración de la sesión en el local (de 1 a 12). | `12` |
| `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCK_MINUTES` | Intentos fallidos antes de bloquear un usuario, y minutos de bloqueo. | `5` / `15` |
| `BCRYPT_COST` | Costo del hash de contraseñas (de 10 a 14 fuera de los tests). | `12` |
| `LOCAL_PORT` | Puerto de la puerta local, por donde entran la PC y las tablets. | `3000` |
| `LOCAL_CIDRS` / `LOCAL_ALLOWED_HOSTS` | Redes y nombres que cuentan como "el local". Vacías, la API no arranca. | `127.0.0.1/32,::1/128` / `localhost,127.0.0.1,::1` |
| `REMOTE_ENABLED` | Prende el acceso desde afuera. Apagado hasta la etapa 9. | `false` |

La puerta remota y `REMOTE_*` se configuran en la etapa 9. Las variables de adjuntos y copias de seguridad se agregan en las etapas 5 y 8.

## Documentación

- [`docs/requisitos.md`](docs/requisitos.md): qué tiene que hacer el sistema, con las reglas del negocio.
- [`docs/modelo-datos.md`](docs/modelo-datos.md): tablas y relaciones.
- [`docs/plan.md`](docs/plan.md): las nueve etapas, con su definición de terminado.
- [`docs/decisiones/`](docs/decisiones/): decisiones técnicas (ADR).
  - [001: estructura y herramientas](docs/decisiones/001-estructura-y-herramientas.md)
  - [002: dinero, redondeos y día de trabajo](docs/decisiones/002-dinero-redondeos-y-dia-de-trabajo.md)
  - [003: acceso local y remoto, HTTPS y cookie de sesión](docs/decisiones/003-acceso-local-remoto-y-https.md)
- [`docs/api/`](docs/api/README.md): contrato de la API. Login y usuarios en [`auth-usuarios.md`](docs/api/auth-usuarios.md).
- [`docs/manual/`](docs/manual/README.md): manual de uso para el dueño, el encargado y el personal.
- [`CHANGELOG.md`](CHANGELOG.md): qué se agregó en cada etapa.
