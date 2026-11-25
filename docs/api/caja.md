# API — Caja (etapa 3: apertura y caja abierta)

> Etapa 3, tarea 1. Requisitos: CAJ-01 (turno y efectivo inicial), CAJ-02 (una sola caja abierta), CAJ-09 (no desde afuera), VEN-13; PA-02, PA-30, PA-32; R1 del plan (ajuste mínimo: la etapa 3 solo **abre** la caja).
> Base: contrato común (`docs/api/README.md`), ADR 002 (día de trabajo) y ADR 003 (puertas, `requireLocal`).
> Modelo: `CashSession` y `CashMovement` (`docs/modelo-datos.md` 2.11 y 2.13). Las tablas se crean **completas** en esta etapa.
> Ventas, anulaciones y medios de pago: `docs/api/ventas.md`.

## 0. Qué entra y qué queda afuera en esta etapa

| Entra (etapa 3) | Queda para la etapa 4 |
|---|---|
| **Abrir la caja** (turno + efectivo inicial). | **Cerrar la caja** (cierre a ciegas, `countedCash`, `expectedCash`, `difference`). |
| **Ver la caja abierta** (para la pantalla de venta). | **Arqueo** y detalle de la caja con resumen por medio de pago. |
| **Listar cajas** (mínimo, para filtrar ventas por caja). | **Ingresos y salidas a mano** (`CashMovement` con motivo elegido por el usuario). |
| La **devolución automática por anulación** (`CashMovement` `OUT` / `SALE_VOID_REFUND`), que crea `POST /api/sales/:id/void` (`ventas.md` 7). | **Notas** de cierre (`CashSessionNote`). |
| | Aviso al arrancar si quedó una caja abierta de un día anterior (NF-18). |
| | Qué datos de la caja ve el empleado antes y después de cerrar (plan, etapa 4, tarea 1). |

**Consecuencia para probar la etapa 3:** como todavía no hay cierre, una vez abierta la caja no se puede abrir otra por la API. Para volver a empezar en desarrollo: `npm run db:reset` (borra la base). Los tests que necesitan "sin caja abierta" o "caja de un turno cerrado" la cierran **directo en la base** (con los campos de cierre completos, para cumplir el `CHECK` del modelo 2.11).

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles |
|---|---|:---:|---|
| `GET /api/cash-sessions/current` | Caja abierta (o `null`) y día de trabajo actual | `any` | Todos |
| `POST /api/cash-sessions` | Abrir la caja | **`local`** | Todos (matriz: "Vender, abrir y cerrar su caja") |
| `GET /api/cash-sessions` | Listar cajas (para filtrar ventas) | `any` | OWNER, MANAGER |

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **Orden de registro en Express:** `/api/cash-sessions/current` antes que cualquier `/api/cash-sessions/:id` (la etapa 4 agrega `:id`).
- Ver la caja abierta **no** es "manejar la caja": es `access: 'any'` (igual, por la puerta remota solo entran encargado y dueño).

## 2. Esquemas (van a Zod en `@kiosco/shared`, carpeta `cash/`)

```ts
ShiftSchema = 'MORNING' | 'AFTERNOON' | 'NIGHT'          // Mañana, Tarde, Noche (PA-32)
CashSessionStatusSchema = 'OPEN' | 'CLOSED'

// Lo que ve el EMPLEADO. Sin efectivo inicial (ver 2.1).
CashSessionPublicSchema = {
  id: number;
  shift: Shift;
  businessDate: string;              // YYYY-MM-DD, día de trabajo calculado al abrir (ADR 002 punto 7)
  status: CashSessionStatus;
  openedAt: string;                  // ISO UTC
  openedBy: { id: number; fullName: string };
}

// Lo que ven ENCARGADO y DUEÑO.
CashSessionSchema = CashSessionPublic & {
  openingCash: Money;                // efectivo inicial (PA-30)
  closedAt: string | null;           // etapa 4; en esta etapa siempre null salvo cajas cerradas a mano en tests
  closedBy: { id: number; fullName: string } | null;
}
// La etapa 4 agrega countedCash, expectedCash y difference (solo encargado y dueño).

CurrentCashSessionResponseSchema = {
  cashSession: CashSession | CashSessionPublic | null;   // null = no hay caja abierta
  currentBusinessDate: string;       // día de trabajo de "ahora" según el servidor (hora de corte)
}

OpenCashSessionRequestSchema = {     // estricto
  shift: Shift;
  openingCash: Money;                // ≥ 0, hasta 2 decimales ("0" se permite: CHECK >= 0)
}

CashSessionListQuerySchema = {
  page?; pageSize?;                  // README 5
  from?: string; to?: string;        // YYYY-MM-DD, por DÍA DE TRABAJO, ambos incluidos; from > to → 400
  status?: CashSessionStatus;
}
```

### 2.1 Visibilidad por rol (provisoria hasta la etapa 4)

| Dato | EMPLOYEE | MANAGER | OWNER |
|---|:---:|:---:|:---:|
| Turno, día de trabajo, estado, quién y cuándo abrió | ✅ | ✅ | ✅ |
| Efectivo inicial (`openingCash`) | ❌ | ✅ | ✅ |
| Lista de cajas | ❌ (403) | ✅ | ✅ |

**Por qué el empleado no ve el efectivo inicial:** el cierre es **a ciegas** (CAJ-03): el empleado no tiene que poder deducir el efectivo esperado. El efectivo inicial es una parte de esa cuenta, y la caja la pudo abrir otra persona. Es la opción más cerrada; la etapa 4 define la visibilidad completa (pregunta **H-40**, `ventas.md` 12). Si el dueño elige otra cosa, se agrega el campo al esquema público (cambio que solo agrega).

## 3. `GET /api/cash-sessions/current` — Caja abierta

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos.
- **Response 200:** `CurrentCashSessionResponseSchema`. `CashSession` para OWNER y MANAGER; `CashSessionPublic` para EMPLOYEE. **Nunca 404:** si no hay caja abierta, `cashSession: null`.
- **Para qué la usa la pantalla:**
  - **Venta:** si `cashSession` es `null`, muestra el formulario de apertura en lugar del carrito (cualquier rol puede abrir, sección 4). Igual el servidor rechaza cobrar sin caja (`422 CASH_SESSION_REQUIRED`, `ventas.md` 6): otro dispositivo pudo cerrarla mientras tanto (regla 8 de ventas).
  - Si `cashSession.businessDate` es anterior a `currentBusinessDate`, la caja quedó abierta de un día anterior: la pantalla lo muestra como aviso (el aviso formal y el cierre llegan en la etapa 4, NF-18).
  - **Lista de ventas:** usa `currentBusinessDate` como filtro por defecto.
- **Errores:** `401`. **Auditoría:** no.
- **Ejemplo** (encargado):

```json
{
  "cashSession": {
    "id": 7, "shift": "MORNING", "businessDate": "2026-11-26", "status": "OPEN",
    "openedAt": "2026-11-26T10:02:11.000Z", "openedBy": { "id": 4, "fullName": "Lucía Pérez" },
    "openingCash": "5000.00", "closedAt": null, "closedBy": null
  },
  "currentBusinessDate": "2026-11-26"
}
```

## 4. `POST /api/cash-sessions` — Abrir la caja

- **Sesión:** sí. **Acceso:** **`local`** (CAJ-09, ADR 003 punto 6): desde la puerta remota → `403 LOCAL_ONLY` (auditado como `ACCESS_DENIED`). **Roles:** todos (matriz de `requisitos.md` 3 y CAJ-01: "el empleado abre la caja").
- **Request:** `OpenCashSessionRequestSchema`.
- **Qué hace** (una transacción):
  1. `businessDate = getBusinessDate(ahora, Setting.businessDayCutoffMinutes, TZ)` (ADR 002 punto 7). `openedAt` = ahora, del reloj **del servidor**.
  2. Inserta la caja con `status = OPEN`, `openedById` = el usuario de la sesión.
  3. **Una sola caja abierta** (PA-02, CAJ-02): lo garantiza el índice único parcial `cash_sessions_single_open` (modelo 2.11). Si ya hay una (también si dos pedidos llegan a la vez), la base rechaza la segunda: el backend traduce el error de unicidad (`P2002`) a `409 CASH_SESSION_ALREADY_OPEN`. **No** se consulta primero y se inserta después (eso deja pasar a dos pedidos simultáneos).
  4. Audita.
- **El turno se elige libremente** (PA-32): el servidor no lo compara con la hora ni con el turno anterior (pregunta **H-44**).
- **Response 201:** `CashSession` (OWNER, MANAGER) o `CashSessionPublic` (EMPLOYEE).
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Turno inválido; `openingCash` sin formato, negativo o como número de JSON; campo desconocido. |
| `403` | `LOCAL_ONLY` | Desde la puerta remota. |
| `409` | `CASH_SESSION_ALREADY_OPEN` | Ya hay una caja abierta. `details: { "cashSession": CashSessionPublic }` (la abierta: turno, quién y cuándo; **sin** efectivo inicial, sea cual sea el rol). |

- **Auditoría:** `CASH_SESSION_OPEN`, `entityType` `CashSession`, `entityId` = id, `details: { shift, businessDate, openingCash }`.
- **Ejemplo** (paso 1 de "Cómo probarlo": empleado, Mañana, $5.000):

```json
{ "shift": "MORNING", "openingCash": "5000" }
```

```json
{
  "id": 7, "shift": "MORNING", "businessDate": "2026-11-26", "status": "OPEN",
  "openedAt": "2026-11-26T10:02:11.000Z", "openedBy": { "id": 5, "fullName": "Juan Ruiz" }
}
```

## 5. `GET /api/cash-sessions` — Listar cajas

Mínima: solo para que la lista de ventas pueda filtrar por caja (`ventas.md` 8). La etapa 4 le agrega los datos del cierre.

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (EMPLOYEE → `403`).
- **Query:** `CashSessionListQuerySchema`. Paginada. Orden: `openedAt` descendente (la más nueva primero).
- **Response 200:** `Paginated<CashSession>`.
- **Errores:** `400` (fechas inválidas, `from` posterior a `to`), `403`. **Auditoría:** no.

## 6. Reglas para backend (concurrencia con ventas y anulaciones)

- **Venta y anulación** leen la caja abierta **dentro de su transacción** con `SELECT ... FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`. Así, cuando la etapa 4 programe el cierre (que va a tomar la fila con `FOR UPDATE`), un cierre espera a que terminen las ventas en curso y ninguna venta queda en una caja que se cerró a mitad de camino.
- La caja **cerrada nunca se modifica** (D9): la devolución de una venta de otro turno va a la caja **abierta** (`ventas.md` 7).

## 7. Códigos y acciones nuevos

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `CASH_SESSION_ALREADY_OPEN` | Ya hay una caja abierta. Para abrir otra, primero hay que cerrar esa. |
| 422 | `CASH_SESSION_REQUIRED` | No hay ninguna caja abierta. Abrí la caja para seguir. (Lo usan venta y anulación, `ventas.md`.) |

Acción de auditoría: `CASH_SESSION_OPEN` (ya estaba en `modelo-datos.md` 2.21).
