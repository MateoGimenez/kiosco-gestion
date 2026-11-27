# Plan de trabajo – Kiosco (versión 1)

> **Estado:** **aprobado** por el dueño del proyecto el 2026-11-18 (Fase 3), con CI en GitHub Actions, el ajuste de la caja en la etapa 3 (R1) y las recomendaciones de los puntos "Frenar y preguntar" (sección 5).
> **Base:** `docs/requisitos.md` y `docs/modelo-datos.md` (Fase 2 aprobada, con todas las recomendaciones de 7.2 y 7.4).
> **Sin fechas ni estimaciones:** el plan va por etapas, en el orden que aprobó el dueño.
> **Entrega al cliente: todo junto**, cuando estén terminadas todas las etapas. Igual, **cada etapa termina con algo que el dueño del proyecto puede probar**.

---

## 1. Resumen de las etapas

| # | Etapa | Objetivo |
|---|---|---|
| 1 | Base y login | Proyecto armado, base de datos andando y login con usuarios y roles. |
| 2 | Productos y stock | Cargar categorías, subcategorías y productos (IVA, márgenes, precios) y manejar el stock con historial. |
| 3 | Ventas | Vender con lector o búsqueda, pago mixto, recargo, descuento y anulaciones, sobre una caja abierta. |
| 4 | Caja | Completar la caja por turno: cierre a ciegas, arqueo, ingresos y salidas, notas. |
| 5 | Proveedores y compras | Proveedores, compras con neto + IVA y bultos, adjuntos, cuenta corriente y pedido sugerido. |
| 6 | Precios | Aumentos masivos, aviso de cambio de costo en compras e historial de precios. |
| 7 | Reportes | Todos los reportes con filtro de fechas y exportación a Excel. |
| 8 | Instalación | Dejar el sistema listo para la PC Windows: servicios, backups a Google Drive e importación desde Excel. |
| 9 | Acceso remoto | Entrar desde afuera con Tailscale, con las restricciones aprobadas. |
| — | Entrega final | Prueba completa, instalación en el kiosco y capacitación. |

**Ajuste mínimo del orden (aprobado):** el orden de las etapas **no cambia**. Lo único que se adelanta es que la etapa 3 crea las tablas de caja y una **apertura de caja simple**, para que las ventas se guarden en una caja real; la etapa 4 completa el resto. Explicación en la sección 6.

---

## 2. Cómo se trabaja cada etapa

### 2.1 Orden de trabajo de los agentes

| Paso | Quién | Qué hace | Resultado |
|---|---|---|---|
| 1 | **Orquestador** | Abre la etapa: crea la rama `etapa-N-nombre` y repasa el alcance con este plan. Si hay un punto **"Frenar y preguntar"**, lo pregunta al dueño **antes** de seguir. | Alcance confirmado. |
| 2 | **arquitecto** | Define los **contratos de la API** de la etapa: rutas, request, response, errores y permisos por rol. Si hace falta, escribe un ADR. | `docs/api/<modulo>.md` y esquemas Zod en `packages/shared`. |
| 3 | **base-datos** | Esquema Prisma de las tablas de la etapa, migración (con los `CHECK` e índices parciales escritos a mano) y datos de ejemplo (seed). | Migración aplicada y seed corriendo. |
| 4 | **backend** | Rutas, validaciones (con los esquemas compartidos), lógica de negocio en servicios, permisos y auditoría. | API funcionando según el contrato. |
| 5 | **frontend** | Pantallas de la etapa, **siempre con `/impeccable`**, usando los mismos esquemas y funciones compartidas. | Pantallas usables con teclado y en celular. |
| 6 | **qa** | Tests unitarios, de integración y e2e de la etapa; corre **toda** la suite y reporta. Revisión de código con `code-review`. | Reporte de tests. |
| 7 | **seguridad** | Revisión rápida de lo nuevo, con foco en lo que dice cada etapa. | Hallazgos clasificados (crítico, alto, medio, bajo). |
| 8 | **backend / frontend** | Corrigen lo que encontraron qa y seguridad. qa vuelve a correr la suite. | Todo en verde. |
| 9 | **documentacion** | Actualiza la documentación de la API, el README y el manual de uso de la etapa. | Docs al día. |
| 10 | **Orquestador** | Hace commits chicos por avance, muestra el resultado al dueño con los pasos de **"Cómo probarlo"** y, con su visto bueno, integra la rama a `main`. | Etapa cerrada. |

Notas:
- El frontend puede empezar en paralelo con el backend apenas esté el contrato (paso 2), usando datos de prueba. Se conecta cuando la API está lista.
- **El contrato manda:** si backend o frontend necesitan cambiarlo, lo cambia el arquitecto y se avisa a los dos.
- Ningún agente decide reglas de negocio: si algo no está en `requisitos.md`, se frena y el Orquestador pregunta.

### 2.2 Contratos de la API (reglas comunes, se fijan en la etapa 1)

- Todas las rutas bajo `/api`. JSON en request y response.
- Dinero, cantidades y porcentajes viajan como **string** (`"1440.00"`, `"0.350"`).
- Errores con un formato único: `{ "error": { "code": "STOCK_ADJUST_REASON_REQUIRED", "message": "texto en español", "details": {...} } }`. Códigos HTTP: 400 datos inválidos, 401 sin sesión, 403 sin permiso, 404 no existe, 409 conflicto (por ejemplo, ya hay una caja abierta), 422 regla de negocio.
- Los permisos se verifican **en el servidor**, en cada ruta.
- Las respuestas se arman **según el rol**: por ejemplo, el costo nunca viaja a un empleado (PA-03).

---

## 3. Definición de terminado (vale para todas las etapas)

Una etapa está **terminada** cuando:

1. **Tests:** toda la suite (unitarios, integración y e2e) pasa, incluidos los de etapas anteriores. Ningún test se borró ni se debilitó para que pase.
2. **Seguridad:** la revisión no tiene hallazgos **críticos ni altos** abiertos. Los medios y bajos quedan anotados con su decisión.
3. **Contrato cumplido:** la API hace lo que dice `docs/api/` y las pantallas cubren los requisitos de la etapa.
4. **Documentación al día:** API, README y manual de uso.
5. **Configuración:** toda variable nueva está en `.env.example`, sin claves en el código.
6. **Commits hechos** por el Orquestador (chicos, uno por avance) y rama integrada a `main`.
7. **El dueño lo probó** con los pasos de "Cómo probarlo" y dio el visto bueno.
8. **CI en verde** (sección 4.1.4).

---

## 4. Etapas

### Etapa 1 — Base y login

**Objetivo:** tener el proyecto armado, la base de datos andando y el login con usuarios y roles.

**Requisitos:** USR-01 a USR-07, CFG-06, NF-05 (una sucursal, sin nada de multi-sucursal), NF-08 (base de auditoría), NF-09, NF-10, NF-11 (base), NF-13, NF-15, NF-16, NF-17 (la PC del mostrador entra sin internet).

**Tablas:** `User`, `AuditLog`.

#### 4.1.1 Paso 1.0 — Cimientos del proyecto

Lo hace el **arquitecto** (estructura y ADR) junto con **base-datos** (Docker y Prisma) y **qa** (base de tests).

**Monorepo con npm workspaces.** Viene con Node, no agrega herramientas y alcanza de sobra para tres paquetes (pnpm o Turborepo serían más complejidad sin beneficio real acá).

```
kiosco-gestion/
├── apps/
│   ├── api/            # Express + Prisma (backend)
│   │   ├── prisma/     # schema.prisma, migraciones, seed
│   │   └── src/modules/<modulo>/  # rutas, servicio y validación por módulo
│   └── web/            # React + Vite (frontend)
├── packages/
│   └── shared/         # tipos, enums, esquemas Zod y funciones de dinero/redondeo
├── e2e/                # tests de Playwright
├── docs/               # requisitos, modelo, plan, api/, decisiones/
├── docker-compose.yml  # PostgreSQL para desarrollo y tests
├── .env.example
└── package.json        # workspaces y scripts
```

**Paquete compartido (`packages/shared`): sí conviene.** Tiene:
- Los **esquemas Zod** de cada request y response: el backend valida con ellos y el frontend los usa en formularios y para tipar las respuestas. Así el contrato es código y no solo un documento.
- Los **enums** del modelo (roles, motivos, turnos…).
- **Dinero y redondeos** (`decimal.js`, la misma librería que usa `Prisma.Decimal`): redondeo a centavos, al peso entero y de precios hacia arriba; cálculo de recargo, descuento, neto sin IVA y margen. El backend es **la autoridad**: recalcula todo al guardar. El frontend usa las mismas funciones solo para mostrar el total mientras se arma la venta.
- Formato es-AR (moneda y fechas) para pantallas y Excel.

**Tareas del paso 1.0:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | ADR `001-estructura-y-herramientas`: monorepo, paquetes, librerías base (Express, Prisma, Zod, decimal.js, React Router, TanStack Query para datos del servidor), versión de Node LTS fijada en `.nvmrc` y en `engines`. |
| 2 | arquitecto | ADR `002-dinero-redondeos-y-dia-de-trabajo`: pasa a ADR lo decidido en `modelo-datos.md` (1.1 a 1.5). |
| 3 | arquitecto | Contrato común de la API (sección 2.2) en `docs/api/README.md`. |
| 4 | base-datos | `docker-compose.yml` con PostgreSQL (**la misma versión mayor que se va a instalar en Windows**) y dos bases: `kiosco_dev` y `kiosco_test`. Prisma configurado en `apps/api`. |
| 5 | arquitecto | `.env.example` con todas las variables conocidas (sección 4.1.5), comentadas en español. |
| 6 | backend + frontend | Esqueletos de `apps/api` (Express con `helmet`, manejo de errores con el formato común, logger, ruta `/api/health`) y `apps/web` (Vite + React + router). |
| 7 | arquitecto | ESLint (configuración plana) + Prettier en todo el repo, TypeScript en modo estricto. |
| 8 | qa | Vitest configurado en `shared`, `api` (con supertest y base `kiosco_test`) y `web`. Playwright configurado en `e2e/` con un test de humo (abre la página). |
| 9 | arquitecto | Scripts de npm (4.1.3) y, si se aprueba, CI con GitHub Actions (4.1.4). |

#### 4.1.2 Paso 1.1 — Decidir H-01 y PA-39 (antes del login)

> **Resuelto (2026-11-18):** ADR `003-acceso-local-remoto-y-https`. H-01: se decide **por la puerta** (dos listeners: local y remota) + IP real del socket en la puerta local, nunca por encabezados. PA-39: opción c) (HTTP adentro, HTTPS por Tailscale, una cookie por puerta).

**Tarea explícita para `seguridad` + `arquitecto`, antes de escribir el login.** Se deciden juntas porque una condiciona a la otra (`requisitos.md` 7.3 y 7.4):
- **H-01:** cómo sabe el servidor que un pedido viene "de afuera" (Tailscale) para bloquear venta y caja. Recomendación aprobada: por la red de origen.
- **PA-39:** cómo se sirve HTTPS dentro del local y cómo se configura la cookie de sesión (`Secure`, `SameSite`, dominio), sin que la venta dependa nunca de internet.

Resultado: **ADR `003-acceso-local-remoto-y-https`**, con:
- qué direcciones cuentan como "local" y cuáles como "remoto";
- cómo entra cada dispositivo (PC del mostrador, tablets del WiFi, celular desde afuera);
- la configuración de la cookie en desarrollo, en el local y por Tailscale;
- cómo se prueba que la PC del mostrador vende sin internet.

En esta etapa se programa el **middleware que marca un pedido como local o remoto** (según el ADR) y el permiso `requireLocal` para usarlo desde la etapa 3. Tailscale se instala recién en la etapa 9.

#### 4.1.3 Scripts de npm (en la raíz)

| Script | Qué hace |
|---|---|
| `npm run dev` | Levanta API y web en modo desarrollo. |
| `npm run db:up` / `db:down` | Prende / apaga PostgreSQL en Docker. |
| `npm run db:migrate` | Aplica migraciones en desarrollo. |
| `npm run db:seed` | Carga datos de ejemplo. |
| `npm run db:reset` | Borra y recrea la base de desarrollo con el seed. |
| `npm run lint` / `format` | ESLint / Prettier. |
| `npm run typecheck` | Chequeo de tipos en todo el repo. |
| `npm test` | Tests unitarios e integración (Vitest). |
| `npm run test:e2e` | Tests de Playwright. |
| `npm run build` | Compila API y web para producción. |
| `npm run owner:reset` | Crea o resetea la contraseña de un usuario dueño desde la PC (USR-04). |

#### 4.1.4 CI con GitHub Actions (aprobado)

**Se recomienda.** El repo ya está en GitHub y sale gratis. En cada push y pull request: `npm ci` → lint → typecheck → migraciones sobre un PostgreSQL de servicio → tests unitarios e integración. Los e2e de Playwright corren en los pull request a `main`. Si algo falla, se ve antes de integrar la etapa. **Contra:** un archivo más para mantener; si se rechaza, qa corre todo a mano en cada cierre.

#### 4.1.5 Variables de `.env.example` (inicial)

`NODE_ENV`, `DATABASE_URL`, `DATABASE_URL_TEST`, `TZ=America/Argentina/Buenos_Aires`, `JWT_SECRET`, `SESSION_HOURS=12`, `REMOTE_SESSION_HOURS=4`, `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_MINUTES`, `LOGIN_LOCK_MINUTES`, `BCRYPT_COST` y las de las puertas (`LOCAL_BIND`, `LOCAL_PORT`, `LOCAL_CIDRS`, `LOCAL_ALLOWED_HOSTS`, `REMOTE_ENABLED`, `REMOTE_BIND`, `REMOTE_PORT`, `REMOTE_HOST`), según el ADR 003 punto 11. Las de adjuntos y backups (`UPLOADS_DIR`, `UPLOAD_MAX_MB`, `BACKUP_DIR`, `BACKUP_EXTRA_DIR`, `BACKUP_KEEP`, `BACKUP_MAX_AGE_HOURS`) se agregan en las etapas 5 y 8.

#### 4.1.6 Paso 1.2 — Login, usuarios y roles

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contrato `docs/api/auth-usuarios.md`: login, logout, "quién soy", cambiar usuario, ABM de usuarios, reseteo de contraseña. |
| 2 | base-datos | `User` y `AuditLog`, migración y seed (sin contraseñas reales: el dueño se crea con `owner:reset`). |
| 3 | backend | Login con bcrypt, JWT en cookie `httpOnly` (12 h local, 4 h remota; una cookie por puerta, ADR 003), `tokenVersion`, límite de intentos fallidos, middleware de sesión y de rol, middleware local/remoto (ADR 003), auditoría de login y de cambios de usuarios, script `owner:reset`. |
| 4 | frontend (`/impeccable`) | Pantalla de login, barra con usuario actual y botón **"Cambiar usuario"**, ABM de usuarios (solo dueño), base visual y de navegación por rol. |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | README con cómo levantar el proyecto; manual: entrar, cambiar usuario, crear usuarios. |

**Tests de QA:**
- Unitarios: funciones de dinero y redondeo de `shared` (centavos, peso entero, precio hacia arriba a $10, casos con 0,5 y negativos), formato es-AR.
- Integración: login correcto e incorrecto, límite de intentos, logout, sesión vencida, usuario desactivado no entra, `tokenVersion` invalida sesiones al resetear la contraseña, solo el dueño gestiona usuarios (403 para encargado y empleado), puede haber dos dueños, auditoría de login. Más los del ADR 003 punto 10: clasificación de puertas e IP, configuración que no arranca, `X-Kiosco`/`Origin`/`Host`, cookies por puerta, empleado por la puerta remota (403), crear usuario y resetear contraseña por la remota (`403 LOCAL_ONLY`), límite de intentos por puerta, y el test que falla si una ruta no declara `access`.
- e2e: login, cambiar usuario, el empleado no ve el menú de usuarios.

**Seguridad revisa en especial:** costo de bcrypt, flags de la cookie según el ADR 003, que el JWT no lleve datos sensibles, `JWT_SECRET` solo en `.env`, límite de intentos, mensajes de error que no revelan si el usuario existe, `helmet` y CORS, que `passwordHash` nunca salga en una respuesta, el script `owner:reset` (solo corre en la PC) y el middleware local/remoto.

**Cómo probarlo (dueño):**
1. `npm install`. Con Docker: `npm run db:up`. Sin Docker: PostgreSQL 16 con las bases `kiosco_dev` y `kiosco_test` (camino B del README). Después, `npm run db:migrate:deploy` (en una base nueva; `db:migrate` crea migraciones y es para desarrollo). Luego `npm run owner:reset`: pide el nombre de usuario, el nombre completo (solo si el usuario no existe) y la contraseña, dos veces. Por último, `npm run dev`.
2. Abrir `http://localhost:5173` y entrar como dueño.
3. Crear un encargado y un empleado. Cada uno **tiene que elegir su contraseña en el primer ingreso** (la que se le dio es temporal, H-21).
4. Tocar "Cambiar usuario" y entrar como empleado, eligiendo su contraseña: no aparece la gestión de usuarios.
5. Equivocarse varias veces de contraseña y ver que bloquea (5 intentos fallidos en 15 minutos bloquean ese usuario 15 minutos).
6. Como dueño, resetear la contraseña del empleado: aparece un diálogo de confirmación. Si el empleado tenía la sesión abierta, se le cierra, y al volver a entrar tiene que elegir una contraseña nueva.
7. Correr `npm test` y `npm run test:e2e`: todo en verde.

**Terminada cuando:** se cumple la Definición de terminado, los ADR 001, 002 y 003 están escritos y el proyecto se levanta desde cero siguiendo el README.

---

### Etapa 2 — Productos y stock

**Objetivo:** cargar categorías, subcategorías y productos con IVA, márgenes y precios, y manejar el stock con historial, ajustes y mínimos.

**Requisitos:** STK-01 a STK-08, STK-10, PRE-01 a PRE-04, PRE-06 (cambios manuales), PRE-07, CFG-02, CFG-03, CFG-05, CFG-07 (se guarda; se usa desde la etapa 3).

**Tablas:** `Setting`, `Category`, `Subcategory`, `Product` (todo menos `defaultSupplierId`, que llega en la etapa 5), `StockMovement` (ajustes), `PriceChange` (cambios manuales).

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos: categorías y subcategorías, productos (buscar, alta, edición, desactivar), precio sugerido, ajustes de stock, historial de stock, "para reponer", stock negativo, configuración. Qué campos ve cada rol (costos solo para el dueño, y para el encargado solo en precios, PA-03). |
| 2 | base-datos | Tablas, `CHECK`s, índice de "un solo Varios", seed con categorías, subcategorías y unos 50 productos de ejemplo (por unidad y por peso, con distintos IVA y márgenes) y el producto **"Varios"** (H-09). |
| 3 | backend | ABM; cadena de margen producto → subcategoría → categoría; precio sugerido = **costo neto × (1 + margen) × (1 + IVA)**, redondeado hacia arriba a $10 (H-15, aprobado); "margen real" al cambiar el precio a mano; ajustes con motivo (incluido consumo propio) y movimiento de stock en la misma transacción; `PriceChange` en cada cambio manual; permisos: categorías encargado y dueño, márgenes de categoría, subcategoría **y producto** solo dueño (PA-33, H-05). |
| 4 | frontend (`/impeccable`) | Lista de productos con búsqueda rápida, ficha de producto, categorías y subcategorías, ajuste de stock, historial de movimientos, lista "Para reponer", lista de stock negativo y configuración (redondeo, hora de corte, nombre del negocio). |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | API de productos y stock; manual: cargar productos, ajustar stock. |

**Tests de QA:**
- Unitarios: cadena de margen; precio sugerido con IVA 21%, 10,5% y 0%; redondeo hacia arriba ($1.432 → $1.440; $1.440 → $1.440); margen real.
- Integración: código de barras repetido → 409; producto por unidad con cantidad decimal → 400; ajuste con motivo "otro" sin nota → 400 (validación del esquema compartido, `docs/api/productos-stock.md` 8.2); el ajuste deja `stockAfter` correcto y puede quedar negativo; `PriceChange` creado; el encargado no puede cambiar márgenes (403); el empleado no recibe costos en ninguna respuesta; producto desactivado no aparece en la búsqueda para vender.
- Integración, decisiones H-23 a H-32 (2026-11-25):
  - **H-23:** el encargado crea una categoría con margen → 201, y cambiarle el margen después → 403.
  - **H-24/H-25:** el encargado cambia el costo en `/pricing` → `PriceChange` creado, `costPrice` calculado con el IVA del producto y precio sin cambios.
  - **H-26:** reactivar un producto → vuelve a la búsqueda; reactivarlo con la subcategoría desactivada → 422.
  - **H-27:** desactivar una categoría o subcategoría con productos activos → 422.
  - **H-28:** conteo con stock 22 y contado 19 → movimiento −3 y `stockAfter` 19; contado igual al stock → 422.
  - **H-29:** rotura con cantidad positiva → 400; carga inicial negativa → 400; y los mismos casos insertados directo en la base los rechaza el `CHECK`.
  - **H-30:** un producto con mínimo 0 y stock 0 aparece en "Para reponer".
  - **H-31:** ajustar un producto desactivado → 201, y aparece en "stock negativo" si queda negativo.
  - **H-32:** a "Varios" se le cambian nombre e IVA → 200; cualquier otro campo o desactivarlo → 422.
- e2e: crear categoría, subcategoría y producto; ajustar stock (por rotura y por conteo) y verlo en el historial.

**Seguridad revisa en especial:** que el costo no se filtre por ninguna ruta a quien no debe verlo, validación de decimales (sin `number`), que no se puedan mandar campos de más (por ejemplo, `stockQuantity` en la edición del producto: el stock solo cambia con movimientos) y auditoría de ajustes y cambios de precio.

**Cómo probarlo (dueño):**
1. Preparar la base **sin** `npm run db:reset` (ese comando borra toda la base; el dueño lo puede correr, pero no hace falta). En este orden: `npm run db:migrate:deploy`, después `npm run owner:reset` (crea al dueño) y **recién después** `npm run db:seed`. El seed carga 9 categorías, 51 productos y "Varios", con el stock inicial a nombre del dueño. Si ya corriste el seed antes de crear al dueño, volvé a correrlo después de `owner:reset`.
2. Como dueño: el seed ya trae "Golosinas" (margen 40 %) y "Chocolates" (margen 45 %). **No hace falta crearlas**: editá "Chocolates" y poné el margen en 50 %.
3. Crear un producto con costo neto $1.000, IVA 21 %, sin margen propio y **stock inicial 12** (queda como carga inicial): el precio sugerido es $1.000 × 1,5 × 1,21 = $1.815 → **$1.820**.
4. Cambiar el precio a mano a $1.900 y ver el "margen real" (57,02 %).
5. Ajustar el stock por "rotura" y ver el movimiento en el historial.
6. Poner un mínimo mayor que el stock y verlo en "Para reponer".
7. Como dueño, crear desde "Usuarios" un encargado y un empleado. Cada uno tiene que elegir su contraseña en el primer ingreso (H-21). Entrar como encargado: puede crear una categoría poniéndole su margen inicial, pero después no puede cambiar márgenes; sí puede cambiar el costo y el precio en "Precios". Entrar como empleado: ve la lista y la ficha de productos, sin costos.
8. Hacer una "corrección por conteo" escribiendo la cantidad contada y ver la diferencia en el historial.
9. **Venta a pérdida:** en el producto del paso 3 (costo neto $1.000 con IVA 21 %, o sea $1.210 con IVA), poner el precio de venta en $1.000. Aparece el aviso "Estás vendiendo a pérdida" con el margen real de −17,36 %. Tocar "Revisar precio": no se guarda nada. Volver a poner $1.000 y tocar "Vender igual a pérdida": ahora sí se guarda el precio.

**Terminada cuando:** se cumple la Definición de terminado y el dueño puede cargar su catálogo a mano.

---

### Etapa 3 — Ventas

**Objetivo:** vender con lector o búsqueda, con pago mixto, recargo, descuento y anulaciones, sobre una caja abierta.

**Requisitos:** VEN-01 a VEN-15, CFG-01, CFG-04, CAJ-02 (una sola caja abierta), NF-06, NF-11, NF-12, NF-17.

**Tablas:** `PaymentMethod`, `CashSession` (completa; en esta etapa solo se usa la **apertura**), `CashMovement` (completa; en esta etapa solo se usa la devolución automática por anulación), `Sale`, `SaleItem`, `SalePayment`, `StockMovement` (ventas y anulaciones).

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos: buscar por código o nombre, **abrir caja** (turno + efectivo inicial), ver caja abierta, cobrar venta (con un identificador generado por la pantalla para que un doble clic no cree dos ventas), anular venta, listar ventas, medios de pago y recargo. **Hecho:** `docs/api/ventas.md`, `docs/api/caja.md` y ADR 004; preguntas H-33 a H-44 (`ventas.md` 12). |
| 2 | base-datos | Tablas, `CHECK`s, índice de una sola caja abierta, seed de medios de pago (crédito 10%). |
| 3 | backend | Venta en una transacción (sección 4 de `modelo-datos.md`): precios y costos **siempre de la base** (salvo el precio de "Varios"), líneas al peso entero (al más cercano, H-06), descuento en $ o % menor que el subtotal (H-10) repartido entre las líneas, recargo antes del descuento y solo sobre crédito, `businessDate` con la hora de corte, stock (que puede quedar negativo), "Varios" sin stock. Anulación: estado, stock, devolución en efectivo en la caja abierta (H-03: sin caja abierta no se anula), **bloqueada desde afuera** (H-02). Venta y apertura de caja con `requireLocal`. |
| 4 | frontend (`/impeccable`) | **Pantalla de venta** pensada para teclado y lector: foco siempre en el buscador, Enter agrega, atajos para cobrar, aviso de stock insuficiente que no frena, peso a mano, "Varios" con precio y descripción, cobro con varios medios y vuelto, total con recargo. Apertura de caja. Lista de ventas con anulación. Configuración de medios de pago (dueño). |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | API de ventas; manual: abrir caja, vender, cobrar mixto, anular. |

**Tests de QA:**
- Unitarios: recargo con los ejemplos de `requisitos.md` (todo crédito con descuento → $10.000; mixto → $9.500; sin descuento → $8.800); reparto del descuento con centavo sobrante; peso × precio redondeado al peso; `businessDate` a las 02:30 y a las 06:00 con corte 06:00.
- Integración: venta sin caja abierta → 422; segunda apertura de caja → 409 (también con dos pedidos a la vez); la suma de pagos no coincide → 422; precio mandado por la pantalla ignorado; descuento por un empleado → 403; descuento del 100% → 422; venta sin stock deja el stock negativo; "Varios" no mueve stock; mismo identificador de venta dos veces → una sola venta; anulación por empleado → 403; anulación con efectivo sin caja abierta → 422; anulación devuelve stock y crea la salida de caja; anulación y venta desde una IP remota → 403.
- e2e: vender con el lector (simulado tipeando código + Enter), pagar mixto, anular como encargado.

**Seguridad revisa en especial:** que el servidor no confíe en precios, totales ni recargos que manda la pantalla; permisos de descuento y anulación; bloqueo de venta y caja desde afuera; ventas duplicadas; condiciones de carrera en el stock y en la apertura de caja; auditoría de descuentos y anulaciones.

**Cómo probarlo (dueño):**
1. Entrar como empleado nuevo: primero elige su contraseña (al entrar por primera vez, con la contraseña temporal) y después abre la caja (turno Mañana, $5.000 de inicial).
2. Tipear un código de barras + Enter: se agrega el producto. Buscar otro por nombre.
3. Agregar un producto por peso escribiendo 0,350 kg. Los productos por kg del seed no tienen código de barras: buscalos por nombre con F2 (por ejemplo, «Queso de máquina por kg»), elegilo con Enter y escribí 0,350 en la ventana de kilos.
4. Vender algo como "Varios" a $700.
5. Cobrar la mitad en efectivo y la mitad con crédito: ver el recargo solo sobre la parte de crédito y el vuelto.
6. Vender un producto sin stock: avisa y deja vender.
7. Entrar como encargado: armar una venta de exactamente $10.000 con «Café instantáneo frasco 170 g» (con el seed, $6.610: se busca por código o por nombre) y un «Varios» de $3.390 por la diferencia (F4, precio 3390). Si el precio del café cambió, usar «Varios» por lo que falte para llegar a $10.000. Aplicar 10% de descuento y cobrar $4.500 en efectivo y $4.500 con crédito. El total es **$9.500**, con $5.000 en el posnet (ejemplo 2 de `docs/api/ventas.md`, sección 10).
8. Anular esa venta: el stock vuelve y la devolución de los $4.500 en efectivo queda registrada en la caja (se ve en el detalle de la caja, en "Ingresos y salidas", desde la etapa 4).

**Terminada cuando:** se cumple la Definición de terminado y se puede vender un turno entero solo con teclado y lector.

**Deuda de seguridad (de la revisión de la etapa 1, a resolver en esta etapa):**
- Medir en la PC del kiosco el impacto de los logins masivos sobre el mostrador. Hoy, durante un ataque de fuerza bruta, un login tarda unos 0,5 s más. Evaluar bcrypt en `worker_threads` o reducir la concurrencia de bcrypt a 1, según lo que muestre la medición.
  - **Propuesta (ADR 004):** bcrypt en un solo `worker_thread`, de a una operación, con la misma cola (`503 SERVER_BUSY`). Medido en desarrollo: el atraso de cada paso de una venta durante una avalancha de logins baja de ≈ 180 ms (hoy) a menos de 1 ms (con concurrencia 1 en el hilo principal quedaba en ≈ 80 ms). La medición en la PC del kiosco se repite en la etapa 8 con el mismo script.

---

### Etapa 4 — Caja

**Objetivo:** completar la caja por turno: cierre a ciegas, arqueo, ingresos y salidas de efectivo y notas.

**Requisitos:** CAJ-01 a CAJ-09, NF-18 (aviso de caja abierta al arrancar).

**Tablas:** `CashSession` (cierre), `CashMovement` (ingresos y salidas a mano), `CashSessionNote`.

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos: cerrar caja a ciegas, ingresos y salidas, notas, detalle de la caja para encargado y dueño. **Qué datos ve el empleado** antes y después de cerrar: ninguno que permita deducir el esperado. **Hecho:** `docs/api/caja.md` (secciones 9 a 17) y cambios en `modelo-datos.md` 2.11 a 2.13; preguntas H-45 a H-53 (`caja.md` 17, `requisitos.md` 7.8), pendientes del dueño. |
| 2 | base-datos | Tabla `CashSessionNote`; revisar los `CHECK`s de cierre y de motivos. |
| 3 | backend | Cierre: calcula y guarda esperado y diferencia en una transacción; lo puede hacer quien abrió, un encargado o el dueño (H-04). No se cierra con datos inválidos. Movimientos con motivo y descripción, solo encargado y dueño, con `requireLocal`. Notas solo de agregado. Aviso al arrancar si hay una caja abierta de un día anterior. |
| 4 | frontend (`/impeccable`) | Cierre a ciegas (solo pide el efectivo contado; avisa si hay un carrito sin cobrar en esa pantalla), registrar ingreso o salida, detalle de la caja con diferencia y resumen por medio de pago (solo encargado y dueño), agregar nota. |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | Manual: cerrar caja, registrar gastos y retiros, revisar diferencias. |

**Tests de QA:**
- Unitarios: efectivo esperado con ventas en efectivo, pagos mixtos, recargos, ingresos, salidas y una anulación de otro turno.
- Integración: el empleado cierra y la respuesta no trae esperado ni diferencia; el encargado los ve; cerrar dos veces → 409; un encargado cierra la caja que dejó abierta un empleado; empleado registrando una salida → 403; motivo "retiro del dueño" como ingreso → 400; no se puede editar un cierre (no hay ruta); nota agregada por el encargado; movimientos desde una IP remota → 403.
- e2e: abrir, vender en efectivo, registrar un gasto, cerrar a ciegas y ver la diferencia como encargado.

**Seguridad revisa en especial:** que el esperado y la diferencia no se filtren al empleado por ninguna ruta (incluidos resúmenes y listados), permisos de movimientos, que una caja cerrada no se pueda modificar y la auditoría de cierres, salidas y notas.

**Cómo probarlo (dueño):**
1. El dueño crea un empleado nuevo en **Usuarios**. El empleado entra con la contraseña temporal y el sistema le pide elegir la suya ([guía 02](docs/manual/02-cambiar-contrasena.md)). Después abre la caja (turno Tarde, $5.000 de inicial) y vende $3.000 en efectivo y $2.000 con débito.
2. Como encargado: en **Caja**, tocar **Registrar ingreso o salida**, elegir **Sale plata**, motivo **Gasto**, descripción "Pago limpieza" y monto $500 ([guía 21](docs/manual/21-gastos-retiros-y-aportes.md)).
3. Como empleado: en **Vender**, tocar **Cerrar caja**, contar $7.400 y confirmar. No ve cuánto debía haber.
4. Como encargado: en el detalle de la caja, ver el esperado ($7.500) y la diferencia (−$100). Agregar una nota.
5. Como empleado (o encargado): abrir la caja siguiente (turno Noche) con **otro monto**, por ejemplo $7.000, distinto de los $7.400 contados. Como encargado, en **Caja**, ver la etiqueta **Apertura con diferencia** en la lista y, en el detalle, el aviso de diferencia de apertura (se declararon $400 menos que lo contado en el cierre anterior). El empleado no ve ninguno de los dos datos.
6. Como encargado: cerrar la caja que dejó abierto el empleado en el paso 5 (desde **Vender** o **Caja**, con **Cerrar caja**).

**Terminada cuando:** se cumple la Definición de terminado y un turno completo (abrir, vender, mover efectivo, cerrar) funciona de punta a punta.

---

### Etapa 5 — Proveedores y compras

**Objetivo:** gestionar proveedores, cargar compras con neto + IVA y bultos, adjuntar facturas, llevar la cuenta corriente y armar el pedido sugerido.

**Requisitos:** PRV-01 a PRV-06, COM-01 a COM-05, COM-07 a COM-10, CAJ-07, REP-07 (para reponer por proveedor).

**Tablas:** `Supplier`, `Product.defaultSupplierId` (migración nueva), `Purchase`, `PurchaseItem`, `PurchaseAttachment`, `SupplierAccountEntry`, `CashMovement` (pagos con efectivo de la caja), `StockMovement` (compras y anulaciones), `PriceChange` (cambio de costo por compra).

**Frenar y preguntar (antes de empezar):**
- **Saldo inicial y correcciones de la cuenta corriente.** Al empezar a usar el sistema, el kiosco ya le debe plata a algunos proveedores. ¿Cómo se carga esa deuda inicial? ¿Hace falta poder corregir un saldo a mano después (el modelo tiene el tipo `ADJUSTMENT`, pero ningún requisito lo pide)? ¿Quién puede hacerlo? Opciones: a) un movimiento "saldo inicial" por proveedor al instalar, sin correcciones manuales; b) a) más correcciones manuales con motivo, solo el dueño. Recomendación: b).

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos: proveedores, compras (alta con líneas por unidad o por bulto, neto + IVA, otros cargos, "pagar ahora"), adjuntos, anular compra, cuenta corriente, pagos, pedido sugerido. |
| 2 | base-datos | Tablas, migración de `defaultSupplierId`, `CHECK`s (bultos, totales, movimientos de cuenta corriente) y seed de proveedores. |
| 3 | backend | Compra en una transacción: conversión de bultos, costos neto y final, **último costo** en el producto, unidades por bulto actualizadas en el producto (H-07), stock, deuda por el total y "otros cargos" que no van al costo (H-16). "Pagar ahora" y pagos con los cuatro orígenes; si el pago sale de la caja → salida de caja y `requireLocal`. Anulación de compra. Adjuntos en `UPLOADS_DIR` (JPG, PNG o PDF, hasta 10 MB, nombre aleatorio, se sirven solo a encargado y dueño). Pedido sugerido: stock ≤ mínimo, cantidad = mínimo − stock y al menos 1 (H-08), texto para copiar y link de WhatsApp. **En esta etapa el costo se actualiza sin el aviso de cambio de precio; el aviso llega en la etapa 6.** |
| 4 | frontend (`/impeccable`) | Proveedores, carga de compra rápida con teclado (elegir unidad o bulto por línea), adjuntar foto desde el celular, cuenta corriente con saldo, registrar pago, pedido sugerido con botones "Copiar" y "Abrir WhatsApp". |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | Manual: cargar una compra, pagar a un proveedor, armar un pedido. `.env.example` con `UPLOADS_DIR` y `UPLOAD_MAX_MB`. |
| 8 | arquitecto → base-datos → backend y frontend → qa → seguridad → documentacion | **Cierre: devolución del proveedor (H-65 a, PRV-07).** Contrato en `docs/api/proveedores.md` 15 (y `caja.md` 11.4, `compras.md` ejemplo H). **Antes de base-datos, el dueño responde H-67 a H-71** (`proveedores.md` 16). base-datos: enums `REFUND` y `SUPPLIER_REFUND` y `CHECK`s en dos migraciones (15.7). backend: `POST /api/suppliers/:id/refunds` (15.4, 15.8). frontend: "Registrar devolución" en el proveedor y link desde la compra anulada (15.9). qa: 15.10. documentacion: manual 27 (sacar "consultá con el dueño") y 28. |

**Tests de QA:**
- Unitarios: 2 bultos × 12 unidades a $10.000 neto con IVA 21% → 24 unidades, costo neto $833,33, total neto $20.000, total $24.200; línea con IVA 0%; pedido sugerido (stock 3 y mínimo 10 → 7; stock = mínimo → 1; stock negativo).
- Integración: la compra suma stock, actualiza costos y crea la deuda; "pagar ahora" con efectivo de la caja crea la salida de caja; un pago con transferencia no toca la caja; anular revierte stock y deuda pero no los costos; adjunto con tipo no permitido o muy grande → 400; un empleado no ve adjuntos ni compras (403); un pago con efectivo de la caja desde una IP remota → 403; el saldo es la suma de los movimientos.
- e2e: cargar una compra por bulto con foto y ver el stock y el saldo del proveedor.
- **Devolución del proveedor (tarea 8):** unitarios de `checkSupplierRefund`; integración: la devolución en efectivo a la caja suma a la caja y baja el saldo a favor en un paso (ejemplo H), desde la remota → 403 y sin caja → 422 sin guardar nada, doble envío → una sola devolución, `SUPPLIER_REFUND` a mano → 400, los `CHECK`s nuevos; e2e: anular una compra pagada y registrar la devolución (`proveedores.md` 15.10).

**Seguridad revisa en especial:** subida de archivos (verificar el tipo real del archivo y no solo la extensión, tamaño, nombres aleatorios, que no se pueda leer otra ruta del disco, acceso solo con permiso), visibilidad de costos (el encargado los ve en compras, el empleado nunca), bloqueo remoto de pagos con efectivo de la caja y auditoría de pagos y anulaciones.

**Deuda de seguridad de la etapa 4 (a resolver en esta etapa):**
- En el reintento de una venta, al empleado devolverle la venta sin los datos de la anulación (`voidedBy`, `voidReason`, `voidRefund`). **Resuelta en la etapa 5** (verificada por seguridad).

**Cómo probarlo (dueño):**
1. **Proveedores > Nuevo proveedor.** Cargar un proveedor con el teléfono escrito como `11 2345-6789` (código de área sin 0, número sin 15; se guarda en 10 números y el link de WhatsApp lo lleva con 549) y un CUIT válido, como `30-71234567-1`. Después asignarlo como habitual de algunos productos de dos formas: desde el proveedor, con **Asignar productos** (varios a la vez), y desde la ficha de un producto, con **Proveedor habitual** en la sección Proveedor.
2. **Compras > Cargar una compra.** Elegir el proveedor, cargar una línea **por bulto** (2 bultos de 12 a $ 10.000 sin IVA, IVA 21 %: se ven 24 unidades a $ 833,33 sin IVA y subtotal $ 20.000) y otra **por unidad**. Comparar el total con la factura. Sacar una foto con **Sacar foto** (o elegir un JPG o PDF con **Elegir archivo**) en "Fotos de la factura" y guardar.
3. Ver que el stock subió en esos productos, que aparece el aviso "Cambios de costo" con el costo nuevo (y que el precio de venta no cambió solo) y que el proveedor tiene deuda en su cuenta.
4. **Fotos.** En el detalle de la compra, abrir la foto (se ve en otra pestaña). Subir un PDF: no se abre en el navegador, se baja con **Descargar** (es a propósito, por seguridad). Borrar uno de prueba con **Borrar** y confirmar.
5. **Proveedor > Registrar un pago.** Pagar una parte con transferencia y otra con **Efectivo de la caja**. El efectivo necesita una **caja abierta**: sin caja, el sistema responde "No hay ninguna caja abierta". Solo el pago en efectivo aparece en la caja (en el detalle de la caja abierta, como "Pago a proveedor") y baja el esperado del arqueo.
6. Bajar el stock de un producto por debajo del mínimo (**Productos > Ajustar stock**, desde el local) y abrir **Proveedor > Pedido sugerido**: la cantidad sugerida es el mínimo menos el stock. Tocar **Copiar** y **Abrir WhatsApp** (el envío lo hace el celular, no el sistema).
7. **Anular la compra** (con motivo) y ver que el stock y la deuda vuelven, y que los costos quedan como estaban. En una compra anulada se pueden seguir **agregando y borrando fotos** (por ejemplo, la nota de crédito del proveedor, H-66).
8. **Proveedor > Registrar devolución** (H-65). Con la compra anulada del paso 7, que tenía pagos, el proveedor queda con **saldo a favor del kiosco** (en el ejemplo, $ 15.000). Con una **caja abierta** y desde el local, registrar la devolución con **Efectivo que entra a la caja** por ese monto: el saldo vuelve a **$ 0**, en la cuenta corriente aparece "Devolución del proveedor" y en el detalle de la caja abierta aparece un ingreso "Devolución del proveedor" que **sube el esperado** del arqueo. Desde afuera, esa opción no aparece. (Las variantes, como devolver por transferencia o más que el saldo a favor, dependen de H-67 a H-71.)

**Terminada cuando:** se cumple la Definición de terminado y se puede repetir el circuito completo con un proveedor real de ejemplo.

---

### Etapa 6 — Precios

**Objetivo:** aumentos masivos, aviso de cambio de costo con precio sugerido en las compras e historial de precios.

**Requisitos:** PRE-05, PRE-06 (pantalla de historial), PRE-08, COM-06.

**Tablas:** `BulkPriceUpdate`, `PriceChange`, `Product`.

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos: vista previa y confirmación de aumento masivo (por proveedor o categoría, sobre costo o precio), historial por producto, precio sugerido en la compra. |
| 2 | base-datos | Tabla `BulkPriceUpdate` y sus `CHECK`s. |
| 3 | backend | Vista previa sin guardar; confirmación en una transacción con `PriceChange` por producto; **solo aumentos**; sobre costo (sube neto y final y recalcula el precio con margen, IVA y redondeo) o sobre precio (sube y redondea). En la compra: detectar el cambio de costo y devolver el precio sugerido; guardar el precio elegido. |
| 4 | frontend (`/impeccable`) | Pantalla de aumento masivo con vista previa (antes y después por producto); en la compra, aviso por línea con costo anterior, costo nuevo y precio sugerido (aceptar, modificar o dejar igual); historial de precios en la ficha del producto. |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | Manual: aumentos masivos y precios después de una compra. |

**Tests de QA:**
- Unitarios: aumento del 10% sobre costo y sobre precio con redondeo; producto con margen propio, de subcategoría y de categoría.
- Integración: porcentaje negativo o cero → 400; empleado → 403; la vista previa no cambia nada; la confirmación coincide con la vista previa; el historial guarda neto, final, precio y margen; la compra con costo cambiado devuelve el precio sugerido y guarda el elegido.
- e2e: aumento masivo por proveedor con vista previa y confirmación.

**Seguridad revisa en especial:** permisos (encargado y dueño), que la confirmación no acepte precios mandados por la pantalla (se recalculan), auditoría de cada aumento y límites razonables para no actualizar miles de productos por error sin vista previa.

**Nota (PA-03, de la etapa 5):** la respuesta de `POST /api/purchases` (`costChanges`) ya trae el precio de venta actual junto al costo, y la pantalla de compras lo muestra al encargado. PA-03 permite que el encargado vea costos en compras y en precios, así que es coherente, pero el plan no lo anotaba. La etapa 6 agrega el precio sugerido a esa respuesta: confirmar que sigue siendo de encargado y dueño, igual que el costo.

**Cómo probarlo (dueño):**
1. Elegir un proveedor y aplicar un aumento del 8% sobre costo: revisar la vista previa y confirmar.
2. Abrir un producto de ese proveedor y ver el cambio en el historial.
3. Cargar una compra con un costo mayor: aparece el aviso con el precio sugerido; aceptarlo y ver el precio nuevo.
4. Aplicar un aumento sobre precio por categoría y ver el redondeo a $10.

**Terminada cuando:** se cumple la Definición de terminado y todo cambio de precio queda en el historial con su origen.

---

### Etapa 7 — Reportes y exportación a Excel

**Objetivo:** todos los reportes con filtro de fechas por día de trabajo y exportación a Excel.

**Requisitos:** REP-01 a REP-09, NF-07.

**Tablas:** solo lectura de todas. Puede hacer falta algún índice nuevo (base-datos lo agrega si las consultas lo piden).

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | Contratos de cada reporte (filtros, columnas, totales, quién lo ve) y formato de exportación. |
| 2 | base-datos | Revisar las consultas y agregar índices si hace falta. |
| 3 | backend | Consultas: ventas por día de trabajo, turno y medio de pago (recargo aparte); más vendidos y sin movimiento; ganancia sobre el neto por período y categoría (sin recargo; "Varios" aparte, H-09); stock valorizado a costo neto (H-17; negativos aparte); diferencias de caja; deuda con proveedores; para reponer; ventas de "Varios". Exportación `.xlsx` (por ejemplo, con `exceljs`) con formato es-AR. |
| 4 | frontend (`/impeccable`) | Pantalla de reportes con filtro de fechas, tablas legibles en celular y botón "Exportar a Excel". |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |
| 7 | documentacion | Manual: cada reporte, qué muestra y cómo se calcula. |

**Tests de QA:**
- Integración, con datos armados a propósito: ventas a las 02:30 cuentan para el día anterior; anuladas excluidas; ganancia del ejemplo de `requisitos.md` ($1.210 con IVA 21% y costo neto $700 → $300); recargo fuera de la ganancia; stock valorizado sin negativos; encargado pidiendo ganancia o stock valorizado → 403; el Excel se abre y tiene los mismos totales que la pantalla.
- e2e: filtrar un reporte y descargar el Excel.

**Seguridad revisa en especial:** que cada reporte respete el rol (ganancia y stock valorizado solo el dueño), inyección de fórmulas en Excel (textos que empiezan con `=`, `+`, `-` o `@` escritos por usuarios, como descripciones o notas) y consultas pesadas con rangos de fechas enormes.

**Deuda de la revisión de seguridad de la etapa 3 (a resolver en esta etapa):**
- **B4: reporte de "Varios" por vendedor.** Evaluar con el dueño si hace falta un reporte de las ventas de "Varios" por vendedor (la lista de ventas ya muestra "con Varios", pero no hay un total por persona). Es una decisión de negocio: no se implementa hasta que el dueño la tome.

**Cómo probarlo (dueño):**
1. Con el seed y las ventas de las etapas anteriores, abrir cada reporte y filtrar por una semana.
2. Comparar la ganancia de un día con una cuenta a mano de dos o tres ventas.
3. Exportar a Excel y abrirlo: números y fechas en formato argentino.
4. Entrar como encargado: no ve ganancia ni stock valorizado.

**Terminada cuando:** se cumple la Definición de terminado y los totales de pantalla y de Excel coinciden con los cálculos a mano.

---

### Etapa 8 — Instalación (PC Windows, servicios, backups e importación desde Excel)

**Objetivo:** dejar el sistema listo para instalarse en la PC Windows del kiosco: servicios que arrancan solos, backups a Google Drive, importación de productos desde Excel y acceso desde el WiFi del local.

**Requisitos:** NF-01, NF-02 (verificado en la PC real), NF-03, NF-04, NF-12 (medido en una PC parecida), NF-13, NF-18, STK-09.

**Tablas:** ninguna nueva. La importación usa `Product`, `Category`, `Subcategory`, `StockMovement` (carga inicial) y `PriceChange` (`IMPORT`).

**Frenar y preguntar (antes de empezar):**
- **Importación de Excel y stock de productos que ya existen.** H-14 dice que los productos existentes se actualizan, pero no define qué pasa con el **stock** si la planilla lo trae. Opciones: a) se ignora (el stock solo cambia con movimientos del sistema); b) se reemplaza con un ajuste "corrección por conteo"; c) se elige en la pantalla de importación. Recomendación: a), y para corregir stock se usa el ajuste.
- **Datos que hay que pedirle al cliente para la instalación:** cuenta de Google Drive que se usa en la PC, lista de categorías y márgenes, % exacto de recargo de crédito, hora de corte, nombre del negocio, usuarios y la planilla de productos.

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | arquitecto | ADR `005-instalacion-windows-y-backups` (el 004 se usó en la etapa 3 para bcrypt): cómo se instalan PostgreSQL (directo en Windows, misma versión mayor que en Docker) y Node; cómo se registra el backend como **servicio de Windows con inicio automático** (por ejemplo, con NSSM o `node-windows`); cómo el backend sirve también la web compilada (un solo puerto); firewall para el WiFi local; formato del backup; plantilla de Excel. Usa `engineering:deploy-checklist`. |
| 2 | backend | Backups (sección 6 de `modelo-datos.md`): después de cada cierre de caja y al arrancar si la última copia tiene más de 12 h; `pg_dump` + adjuntos; nombre temporal y renombrado; retención H-18 (todas las de 7 días + una por día hasta 30 días); aviso en pantalla si falla. Importación de Excel con vista previa, errores por fila y confirmación (H-14). |
| 3 | frontend (`/impeccable`) | Pantalla de importación (subir, vista previa, errores, confirmar), estado de la última copia de seguridad (encargado y dueño), aviso de caja abierta al arrancar. |
| 4 | documentacion | **Manual de instalación** paso a paso para Windows, **cómo restaurar un backup**, procedimiento `owner:reset`, configuración de Google Drive para escritorio y recomendación de UPS. |
| 5 | qa | Tests (abajo) y prueba de instalación en una PC o máquina virtual con Windows. |
| 6 | seguridad | Revisión (abajo). |

**Tests de QA:**
- Integración: cálculo de qué copias borrar (retención); "copia vieja al arrancar" sí y no; un backup interrumpido no deja un archivo con nombre válido; importación con filas válidas, repetidas, sin categoría (se crea) y con errores.
- Prueba manual en Windows: instalar desde cero con el manual, reiniciar la PC y ver que todo arranca solo; **apagar de golpe durante una venta** y verificar que al volver no hay datos a medias; restaurar un backup en otra base y comprobar que tiene las ventas; entrar desde una tablet por WiFi; medir el tiempo de lectura de un código (menos de 1 segundo).

**Seguridad revisa en especial:** cuenta con la que corre el servicio (sin permisos de administrador), permisos del archivo `.env` en Windows, PostgreSQL escuchando solo en la PC, contraseña fuerte del usuario de base, puerto abierto solo en la red local, que los backups (contienen todo) quedan en una cuenta de Google con verificación en dos pasos (evaluar si conviene cifrarlos) y la subida de archivos de la importación.

**Deuda de seguridad de la etapa 3 (worker de bcrypt, ADR 004):**
- **B1: tiempo máximo por operación del worker de bcrypt, y reinicio.** Hoy una operación del worker no tiene tiempo máximo: si se cuelga, el login queda esperando sin límite (la cola de 16 solo corta cuando se llena). Hay que poner un tiempo máximo por operación que responda `503 SERVER_BUSY`, y decidir si el worker se reinicia después de un corte por tiempo. Medirlo en la PC del kiosco junto con el script `bench:login`.
- **B2: `failPending` se ejecuta dos veces.** Cuando el worker da un error y después sale (`exit`), la función que rechaza lo pendiente (`failPending` en `apps/api/src/modules/auth/password.ts`) corre dos veces. No rompe nada hoy (la segunda vez no hay nada pendiente), pero hay que dejarla de manera que una sola caída avise una vez y no deje estado a medias.

**Cómo probarlo (dueño):**
1. Seguir el manual de instalación en una PC o máquina virtual con Windows.
2. Reiniciar la PC: el sistema queda disponible sin tocar nada.
3. Desde un celular en el mismo WiFi, entrar con la dirección que indica el manual.
4. Cerrar una caja y ver aparecer la copia en la carpeta de Google Drive.
5. Importar una planilla de ejemplo con productos y ver la vista previa y los errores.
6. Desenchufar la PC en medio de una venta, prenderla y comprobar que todo está bien.
7. Restaurar una copia siguiendo el manual.

**Terminada cuando:** se cumple la Definición de terminado y otra persona puede instalar el sistema desde cero solo con el manual.

**Deuda de seguridad (de la revisión de la etapa 1, a resolver en esta etapa):**
- **Usuario de base separado para la aplicación,** con permisos mínimos: sobre `audit_logs`, solo `INSERT` y `SELECT`, sin `TRUNCATE` ni `DROP`.
- **Servicio de Windows en una cuenta aparte,** con permisos restringidos sobre el archivo `.env` y sobre la carpeta de instalación.
- **`npm audit`:** hay 3 vulnerabilidades de severidad alta en `effect`, una dependencia de Prisma. No son explotables desde la API. Resolver con `overrides` o actualizando Prisma, y volver a correr `npm audit` antes de la entrega. Figura desde la etapa 1; no se volvió a verificar al cerrar la etapa 5.
- **Copias de seguridad de `UPLOADS_DIR`:** la carpeta de adjuntos de compras (fotos y PDF de facturas, ADR 005) tiene que ir en cada copia junto con `pg_dump`. Una copia solo de la base no tiene las facturas. Revisar también que la limpieza de archivos al arrancar (borrar `.tmp` viejos y archivos de adjuntos borrados, y avisar de archivos sin fila) funcione con la carpeta de la PC del kiosco.

**Deuda de seguridad de la etapa 4 (caja):**
- **Trigger `BEFORE INSERT` en `cash_movements` y `sales`** que rechace si la caja no está abierta. Hoy lo controla el backend dentro de la transacción (`FOR SHARE`, `docs/api/caja.md` 6); el trigger sería una segunda barrera en la base, como los `CHECK` de la etapa 4.

---

### Etapa 9 — Acceso remoto con Tailscale

**Objetivo:** que el dueño y el encargado entren desde afuera con Tailscale, con HTTPS, y que desde afuera no se pueda vender ni manejar la caja.

**Requisitos:** NF-14, NF-15, NF-16 (verificación con acceso real), sección 3 de `requisitos.md` (acceso desde afuera), H-01 y PA-39 (según el ADR 003).

**Tablas:** ninguna.

**Frenar y preguntar (antes de empezar):**
- **Cuenta de Tailscale:** quién es el titular (recomendado: el dueño del kiosco, no el desarrollador) y qué celulares se autorizan (el del dueño y el del encargado).

**Tareas:**

| Orden | Agente | Tarea |
|---|---|---|
| 1 | seguridad + arquitecto | Revisar el ADR 003 con la instalación real y definir las reglas de acceso de Tailscale (solo los dispositivos del dueño y del encargado llegan a la PC del kiosco). |
| 2 | backend | Ajustes de cookie y HTTPS según el ADR; verificar que el middleware local/remoto funciona con direcciones reales de Tailscale; el login de un empleado desde afuera se rechaza. |
| 3 | frontend (`/impeccable`) | Desde afuera, ocultar venta y caja y mostrar un aviso claro de "acceso remoto". |
| 4 | documentacion | Manual: instalar Tailscale en la PC y en los celulares, entrar desde afuera, qué se puede y qué no, qué hacer si se pierde un celular (sacarlo de Tailscale y resetear la contraseña). |
| 5 | qa | Tests (abajo). |
| 6 | seguridad | Revisión (abajo). |

**Tests de QA:**
- Integración: pedidos por la **puerta remota** (ADR 003) → venta, caja, pagos con efectivo de la caja, anulaciones, crear usuarios y resetear contraseñas dan `403 LOCAL_ONLY`; reportes, precios, compras, configuración, aumentos masivos, importación y notas de cierre funcionan; un empleado desde afuera → 403; un equipo de Tailscale que apunta directo a la puerta local → `403 NETWORK_NOT_ALLOWED`.
- Prueba manual: desde un celular con datos móviles (sin el WiFi del local), entrar, ver un reporte, cambiar un precio e intentar abrir la caja (rechazado). Cortar internet en el local: se sigue vendiendo en la PC del mostrador.

**Seguridad revisa en especial:** que no haya puertos abiertos en el router, reglas de acceso de Tailscale, HTTPS de punta a punta, cookies, límite de intentos de login desde afuera, auditoría con IP remota y el procedimiento ante un celular perdido.

**Cómo probarlo (dueño):**
1. Instalar Tailscale en la PC de prueba y en el celular siguiendo el manual.
2. Desconectar el celular del WiFi y entrar desde los datos móviles.
3. Ver reportes y cambiar un precio: funciona.
4. Intentar vender o abrir la caja: aparece el aviso y el servidor lo rechaza.
5. Apagar el router de internet del local: la PC del mostrador sigue vendiendo.

**Terminada cuando:** se cumple la Definición de terminado y la prueba desde afuera funciona con las restricciones aprobadas.

---

### Entrega final (no es una etapa de desarrollo)

1. **qa:** corrida completa de todos los tests y un **ensayo general**: un día simulado con tres turnos, compras, pagos, ventas, anulaciones y reportes.
2. **seguridad:** revisión final completa (no solo de la última etapa).
3. **documentacion:** manual de uso completo, manual de instalación y de backups.
4. **Orquestador:** limpiar datos de prueba, preparar la base inicial con los datos del cliente (categorías, márgenes, usuarios, importación de productos, saldos iniciales con proveedores), instalar en la PC del kiosco con el manual de la etapa 8, configurar Tailscale (etapa 9) y capacitar al personal.

---

## 5. Puntos "Frenar y preguntar"

> **Resueltos:** el dueño aceptó las cuatro recomendaciones de esta tabla (2026-11-18). En la etapa 8 igual hay que **pedirle los datos al cliente**.

| Etapa | Pregunta | Recomendación |
|---|---|---|
| 5 | Saldo inicial con proveedores y correcciones manuales de la cuenta corriente (¿se permiten?, ¿quién?). | Un movimiento de saldo inicial al instalar y correcciones con motivo, solo el dueño. |
| 8 | Stock de productos que ya existen al importar desde Excel. | Ignorarlo; el stock se corrige con un ajuste. |
| 8 | Datos para la instalación (cuenta de Google Drive, categorías y márgenes, % de recargo, hora de corte, usuarios, planilla de productos). | Pedirlos al cliente antes de la entrega final. |
| 9 | Titular de la cuenta de Tailscale y celulares autorizados. | El dueño del kiosco como titular; celulares del dueño y del encargado. |

---

## 6. Riesgos y dependencias entre etapas

| # | Riesgo o dependencia | Cómo se maneja |
|---|---|---|
| R1 | **Ventas (3) necesita caja (4):** cada venta se guarda en una caja abierta y la anulación devuelve efectivo como movimiento de caja. | **Ajuste mínimo (aprobado):** la etapa 3 crea las tablas `CashSession` y `CashMovement` completas y programa la **apertura** de caja y la **devolución automática** por anulación. La etapa 4 agrega el cierre a ciegas, el arqueo, los movimientos a mano y las notas. No se usa una caja "de prueba" falsa, así no hay nada que deshacer después. **El orden de las etapas no cambia.** |
| R2 | **Productos (2) antes que proveedores (5):** el producto tiene un proveedor habitual. | `defaultSupplierId` se agrega con una migración en la etapa 5; hasta entonces no se usa. |
| R3 | **Compras (5) antes que el aviso de precio (6):** en la etapa 5 el costo se actualiza sin sugerir precio. | Se acepta: no hay entrega parcial al cliente. La etapa 6 agrega el aviso sobre la misma pantalla de compras. |
| R4 | **Importación de Excel recién en la etapa 8:** hasta ahí no se pueden probar las etapas con el catálogo real. | Seed con datos de ejemplo realistas desde la etapa 2. Si el dueño quiere probar antes con datos reales, la importación se puede adelantar como tarea suelta (se decide en su momento). |
| R5 | **H-01 y PA-39 condicionan el login (1) y el acceso remoto (9).** | Se deciden en la etapa 1 (ADR 003) y se verifican con la instalación real en la etapa 9. Si algo no funciona en la práctica, se ajusta solo la configuración de cookie y red, no la lógica. |
| R6 | **Problemas de Windows descubiertos tarde** (rutas, servicios, `pg_dump`). | Al cerrar la etapa 1, prueba rápida de levantar el proyecto en Windows. La etapa 8 se prueba en una máquina virtual Windows antes de la entrega. |
| R7 | **Cálculos de dinero, IVA, recargo y día de trabajo** son lo más fácil de romper. | Funciones únicas en `packages/shared`, con tests unitarios desde la etapa 1 y los ejemplos numéricos de `requisitos.md` como casos de prueba. |
| R8 | **`CHECK`s e índices parciales escritos a mano** (Prisma no los ve). | base-datos los documenta en cada migración y qa tiene un test por cada uno (intenta guardar el dato inválido y espera el error). |
| R9 | **Entrega única al final:** el cliente ve el sistema recién al terminar. | El dueño del proyecto prueba cada etapa; ensayo general antes de la entrega. |
| R10 | **PC con 8 GB y sin UPS.** | PostgreSQL con configuración moderada de memoria; transacciones en todo (NF-11); prueba de apagón en la etapa 8; recomendar UPS al cliente. |
| R11 | **Backups que suben a Drive solo con internet y PC prendida.** | La pantalla muestra que la copia local quedó hecha; el manual explica esperar unos minutos antes de apagar si hay internet. |

---

## 7. Documentos y ADR que se van generando

| Documento | Etapa |
|---|---|
| `docs/decisiones/001-estructura-y-herramientas.md` | 1 |
| `docs/decisiones/002-dinero-redondeos-y-dia-de-trabajo.md` | 1 |
| `docs/decisiones/003-acceso-local-remoto-y-https.md` (H-01 y PA-39) | 1 (antes del login) |
| `docs/decisiones/004-bcrypt-fuera-del-hilo-principal.md` (deuda de seguridad de la etapa 1) | 3 |
| `docs/decisiones/005-instalacion-windows-y-backups.md` | 8 |
| `docs/api/README.md` (reglas comunes) y `docs/api/<modulo>.md` | 1 a 9 |
| Manual de uso, de instalación y de backups (`documentacion`) | Se completa etapa por etapa |
