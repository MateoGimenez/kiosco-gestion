# Contexto para continuar el proyecto en una sesión nueva

> Generado el 2026-11-27 al final de una sesión larga. Resume **todo lo necesario** para que una sesión nueva de Claude Code retome el trabajo como **Orquestador** sin perder nada. Las fuentes de verdad detalladas están en los documentos que se enlazan abajo; este archivo es el mapa.

---

## 1. Prompt para pegar en la sesión nueva

Copiá este texto como primer mensaje de la sesión nueva (con el repo `MateoGimenez/kiosco-gestion` conectado):

```text
Sos el Orquestador del proyecto kiosco-gestion (sistema de gestión para un kiosco argentino).
Antes de hacer nada:
1. Hacé `git fetch origin` y `git checkout etapa-5-proveedores-compras` (es la rama en curso; `main` tiene las etapas 1 a 4).
2. Leé docs/CONTEXTO-NUEVA-SESION.md completo, después CLAUDE.md, docs/plan.md (sección 2, 3 y la Etapa 5 en adelante) y docs/relevamiento.md.
3. Prendé PostgreSQL si está apagado y verificá que lint, typecheck y `npm test` den verde (ver sección 6 del archivo de contexto).
4. Mostrame en 10 líneas en qué estado está el proyecto y cuáles son las 2 preguntas pendientes que tengo que responder para cerrar la Etapa 5.
Seguí las mismas reglas de trabajo que figuran en el archivo de contexto (sección 3): preguntar siempre las reglas de negocio, coordinar a los agentes de .claude/agents/, commits chicos que hacés vos, y explicarme todo en español simple.
```

---

## 2. Qué es el proyecto

- **Sistema de gestión para un kiosco argentino** (para un cliente del dueño del proyecto, Mateo): ventas en mostrador con lector de código de barras, stock, proveedores, compras, precios, caja por turnos, usuarios con roles y reportes. **No hay fiado.**
- **Stack:** TypeScript en todo; React + Vite (`apps/web`); Node.js 24 + Express 5 (`apps/api`); PostgreSQL 16 + Prisma 7 (`apps/api/prisma`); código compartido en `packages/shared` (esquemas Zod, dinero con `decimal.js`, cálculos). Monorepo con npm workspaces. Tests: Vitest (unitarios e integración) y Playwright (e2e). CI en GitHub Actions.
- **Repo:** https://github.com/MateoGimenez/kiosco-gestion — una rama por etapa, se une a `main` con merge `--no-ff` cuando el dueño aprueba.
- **Usuario (dueño del proyecto):** programa en JS/TS, React y Express. Quiere respuestas **claras y simples, en español rioplatense**, con preguntas de opción múltiple y una recomendación marcada.

## 3. Cómo se trabaja (reglas del Orquestador)

Estas reglas vienen del pedido original del dueño y de `CLAUDE.md`:

1. **El Orquestador no escribe código de la aplicación.** Delega en los agentes de `.claude/agents/`:
   | Agente | Modelo | Rol |
   |---|---|---|
   | `arquitecto` | opus | Contratos de la API (`docs/api/*.md`), modelo de datos, ADRs, plan |
   | `base-datos` | sonnet | `schema.prisma`, migraciones con CHECKs a mano, seed |
   | `backend` | sonnet | API Express, lógica, tests de integración |
   | `frontend` | sonnet | Pantallas React. **Siempre usa la skill `/impeccable`** (en la sesión puede figurar como `anthropic-skills:impeccable`) |
   | `qa` | sonnet | Tests, `code-review`, recorrer "Cómo probarlo" como el dueño |
   | `seguridad` | opus | Revisión de seguridad (no modifica código) |
   | `documentacion` | haiku | README, manual de uso (`docs/manual/`), CHANGELOG |
2. **Nunca asumir reglas de negocio.** Si algo no está en `docs/requisitos.md` / `docs/relevamiento.md`, frenar y preguntar al dueño (máx. 3–5 preguntas por ronda, opción múltiple, con recomendación). Los agentes listan "Frenar y preguntar" (códigos `H-xx`) y el Orquestador los pregunta. Las decisiones se registran en `docs/relevamiento.md` (al final, por etapa) y en `docs/requisitos.md` sección 7.x (nota "Resueltos por el dueño (fecha)").
3. **Orden de cada etapa** (`docs/plan.md` 2.1): arquitecto (contrato) → preguntas al dueño → base-datos → backend y frontend en paralelo (frontend arranca con datos simulados) → frontend conecta a la API real → seguridad y QA → arreglos → documentación → verificación final del Orquestador (lint, typecheck, format:check, `npm test`, `npm run test:e2e`, CI) → mostrar al dueño "Cómo probarlo" → **merge a `main` solo con el visto bueno del dueño**.
4. **Commits chicos y descriptivos, los hace el Orquestador** (los agentes nunca commitean). Mensajes en español. Cada commit termina con las líneas de atribución que indique el sistema. Un hook exige commitear y pushear al final de cada turno: si un agente sigue trabajando, se commitea como `wip: ... (en progreso)` en la rama de la etapa.
5. **Comentarios y docs en español; nombres de código, archivos y tablas en inglés.** Nada de secretos en el código (`.env` ignorado, `.env.example` al día). **Dinero nunca en `float`/`number`**: `Decimal(14,2)` / `numeric(18,2)` para totales, strings en el JSON, `decimal.js` en shared.
6. **Verificar siempre** lo que reportan los agentes corriendo los tests uno mismo antes de commitear y de informar al dueño. Revisar a ojo las capturas (`/tmp/.../scratchpad/etapaN/`) y mandarlas al dueño.
7. Si un agente se corta por **límite de uso**, revisar su diff parcial (buscar cosas sospechosas), commitearlo como `wip` y retomarlo con un mensaje (o lanzar uno nuevo con el contexto).

## 4. Estado actual (2026-11-27)

| # | Etapa | Estado |
|---|---|---|
| 1 | Base y login | ✅ en `main` |
| 2 | Productos y stock | ✅ en `main` |
| 3 | Ventas | ✅ en `main` |
| 4 | Caja | ✅ en `main` |
| 5 | **Proveedores y compras** | 🔄 **Casi cerrada** en la rama `etapa-5-proveedores-compras` |
| 6 | Precios (aumentos masivos, aviso de cambio de costo, historial) | ⏳ |
| 7 | Reportes y Excel | ⏳ |
| 8 | Instalación Windows, servicios, backups a Google Drive, importación Excel | ⏳ |
| 9 | Acceso remoto con Tailscale | ⏳ |
| — | Entrega final | ⏳ |

### Etapa 5: qué está hecho
- Contratos `docs/api/proveedores.md` y `docs/api/compras.md`, ADR 005 (adjuntos). Decisiones H-54 a H-64 resueltas (aceptadas todas las recomendaciones).
- Base, API y pantallas completas: proveedores (teléfono de 10 dígitos para `wa.me/549…`), compras por unidad o bulto con neto + IVA por alícuota y otros cargos, "pagar ahora", fotos/PDF de factura (tipo real por magic bytes, PDF **siempre como descarga**, nombres limpios), anulación, cuenta corriente con 4 orígenes de pago (efectivo de la caja solo desde el local), saldo inicial y ajustes solo dueño, pedido sugerido con Copiar/WhatsApp, filtro por proveedor en "Para reponer", proveedor habitual en el producto. Deuda de la etapa 4 (reintento de venta sin datos de anulación para el empleado) resuelta.
- Seguridad: sin críticos ni altos (el medio del PDF con JavaScript ya se arregló). QA: los 7 pasos de "Cómo probarlo" funcionan; 52 e2e. Se agregó un **candado** para que dos corridas de tests no usen la misma base a la vez.
- Último estado verificado: api 601, web 185, shared 246 tests (unit + integración) en verde; 52 e2e en la sesión anterior. Manual: guías 24 a 29.

### Etapa 5: qué falta para cerrarla (actualizado 2026-11-27, sesión 2)
1. ✅ **Preguntas del dueño respondidas:** H-65 a) devolución del proveedor en un solo paso; H-66 a) fotos editables en compra anulada; H-67 b) a H-71 a) (detalles de la devolución: 4 orígenes, confirmación si supera el saldo a favor, suelta, encargado y dueño, se corrige con ajuste + salida "Otro"). Registradas en `docs/relevamiento.md` y `docs/requisitos.md` 7.9.
2. ✅ **Retoques de frontend hechos:** `uploadMaxMb` desde `GET /api/settings` (ahora obligatorio en `SettingsSchema`) y `balanceSign()` con `Decimal` en lugar de `Number(balance)`. Quedan `Number()` sobre importes en ventas (`SaleSummary.tsx`, `SaleDetailPage.tsx`, `SalePage.tsx`), solo para comparar con cero: retoque aparte, a decidir.
3. ✅ **Contrato de la devolución:** `docs/api/proveedores.md` secciones 15 y 16 (`POST /api/suppliers/:id/refunds`, `REFUND` en la cuenta corriente, `SUPPLIER_REFUND` en la caja), `caja.md` 11.4, `compras.md` ejemplo H.
4. 🔄 **Implementar la devolución:** base-datos (15.7, dos migraciones) → backend (15.2–15.6, 15.8) y frontend (15.9) → qa (15.10, 15.11) y seguridad → documentacion (guías 27 y 28: sacar el "consultá con el dueño").
5. Verificación final + CI verde + mostrar "Cómo probarlo" (Etapa 5 en `docs/plan.md`, ahora con paso 8) + **pedir aprobación para unir a `main`**.
6. Al cerrar: actualizar `README.md` (línea de estado), `CLAUDE.md` (fase 4 "en curso: Etapas 1 a 5 ✅…") y `CHANGELOG.md`.

## 5. Decisiones importantes ya tomadas (resumen)

Detalle completo en `docs/relevamiento.md` y `docs/requisitos.md` sección 7.

- **Instalación:** el sistema corre en una **PC Windows del kiosco** (8 GB, sin UPS, se apaga al cerrar); se vende **sin internet**; tablets/celulares por WiFi del personal (no hay WiFi para clientes); dueño y encargado entran desde afuera con **Tailscale** (no pueden vender, manejar la caja, crear usuarios ni resetear contraseñas desde afuera). Backups al cerrar cada caja y al arrancar, a una carpeta sincronizada con Google Drive.
- **Acceso (ADR 003):** dos "puertas" (local HTTP en `LOCAL_PORT`, remota solo para `tailscale serve`); cada ruta declara `access: 'any' | 'local'`; CSRF con `X-Kiosco: 1` + `Origin`; cookies distintas por puerta; sesiones en tabla `Session` (logout revoca); bcrypt en un `worker_thread` (ADR 004).
- **Usuarios:** dueño, encargado, empleado; siempre queda al menos un dueño; cambio de contraseña obligatorio tras crear/resetear; el dueño no se resetea a sí mismo (usa "Cambiar mi contraseña"); mínimo 8 caracteres.
- **Responsable inscripto:** IVA por producto; compras en neto + IVA; ganancia sobre el neto; precio sugerido = costo neto × (1 + margen) × (1 + IVA), redondeado **hacia arriba a $10**; margen por producto → subcategoría → categoría; aviso de **venta a pérdida** con confirmación.
- **Ventas:** recargo de crédito (~10 %, configurable) **solo sobre la parte con crédito y antes del descuento**; el servidor recalcula todo (`calculateSale` en shared); `clientRequestId` contra doble clic; anular solo encargado/dueño, desde el local, con caja abierta.
- **Caja:** una sola caja abierta en todo el kiosco; cierre a ciegas (el empleado nunca ve esperado ni diferencia); marca de diferencia de apertura vs. cierre anterior; tope de importes $999.999.999,99.
- **Números en pantalla:** formato es-AR, coma decimal y punto de miles ("1.500,50").

## 6. Entorno de desarrollo (lo que hay que saber)

- **PostgreSQL 16 local** (el contenedor no tiene Docker Hub: da 429). Suele apagarse cuando se reinicia el entorno: `pg_ctlcluster 16 main start`. Usuario `kiosco`, bases `kiosco_dev` y `kiosco_test` (credenciales solo de desarrollo, en el `.env` ignorado por git; si el `.env` no existe en un entorno nuevo, crearlo desde `.env.example` con un `JWT_SECRET` aleatorio de 32+ bytes).
- **Node 24** (`.nvmrc`). En el contenedor anterior se instaló a mano en `/opt/node24`; en un entorno nuevo verificar `node -v` y, si no es 24, instalarlo.
- **Dueño de desarrollo** en `kiosco_dev`: usuario `dueno` (contraseña de prueba solo de desarrollo; si no funciona, recrear con `printf 'dueno\nDueño Prueba\n<clave>\n<clave>\n' | npm run owner:reset`).
- **Prisma bloquea `npm run db:reset` cuando lo corre un asistente de IA**: no forzarlo; usar `db:migrate:deploy` + `owner:reset` + `db:seed` en una base nueva, o pedirle al dueño que lo corra.
- **Tests:** `npm test` (unit + integración), `npm run test:e2e` (Playwright, Chromium preinstalado en `/opt/pw-browsers/chromium`). Hay un candado: si otra corrida usa la misma base, espera. No correr vitest y e2e a la vez desde distintos agentes.
- **CI:** `gh run list --branch <rama>`; el job e2e corre solo en PR a `main`.
- **Capturas:** los agentes de frontend las guardan en el scratchpad de la sesión (`.../scratchpad/etapaN/`); en una sesión nueva la ruta cambia.

## 7. Deuda anotada para etapas futuras

- **Etapa 6:** aviso de cambio de precio al cambiar el costo en una compra (hoy la compra devuelve `costChanges`); nota: el encargado ve precio de venta junto al costo en compras (dentro de PA-03).
- **Etapa 7:** visor de auditoría solo para el dueño (guarda costos); evaluar con el dueño un reporte de "Varios" por vendedor.
- **Etapa 8:** usuario de base separado para la app (sin TRUNCATE/DROP sobre `audit_logs`); servicio en cuenta de Windows aparte con permisos sobre `.env`; trigger que rechace ventas/movimientos en caja cerrada; timeout y reinicio del worker de bcrypt; `npm audit` (3 altas por `effect` vía `@prisma/config`: `overrides` o actualizar Prisma, nunca `--force`); extensiones `unaccent`/`pg_trgm` en Windows; incluir `UPLOADS_DIR` en los backups; ADR de instalación (número siguiente libre: 006).

## 8. Documentos de referencia

| Documento | Para qué |
|---|---|
| `CLAUDE.md` | Reglas del proyecto y estado de fases |
| `docs/relevamiento.md` | **Todas** las respuestas del dueño, en orden |
| `docs/requisitos.md` | Requisitos numerados y sección 7 con todas las decisiones `PA-xx` / `H-xx` |
| `docs/modelo-datos.md` | Tablas, CHECKs, operaciones clave |
| `docs/plan.md` | Plan por etapas, "Cómo probarlo" de cada una, deuda |
| `docs/api/*.md` | Contratos de la API (mandan sobre el código) |
| `docs/decisiones/001–005` | ADRs |
| `docs/manual/` | Manual de uso para el kiosco (guías 01–29) |
| `README.md` / `CHANGELOG.md` | Cómo levantar el proyecto / qué se hizo en cada etapa |
