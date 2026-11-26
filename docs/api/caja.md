# API — Caja (etapa 3: apertura; etapa 4: cierre a ciegas, arqueo, movimientos y notas)

> Etapa 3, tarea 1: apertura y caja abierta. Requisitos: CAJ-01 (turno y efectivo inicial), CAJ-02 (una sola caja abierta), CAJ-09 (no desde afuera), VEN-13; PA-02, PA-30, PA-32; R1 del plan (ajuste mínimo: la etapa 3 solo **abre** la caja).
> **Etapa 4, tarea 1:** cierre a ciegas, arqueo, movimientos a mano, notas, detalle y lista de cajas, aviso de caja vieja. Requisitos: CAJ-01 a CAJ-09, NF-18; PA-17, PA-28, PA-29, PA-30; H-03, H-04, H-40, H-41; regla 8 de ventas (carrito y cierre).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero, día de trabajo) y ADR 003 (puertas, `requireLocal`; "notas a cierres de caja" se permiten desde afuera, punto 6).
> Modelo: `CashSession`, `CashSessionNote` y `CashMovement` (`docs/modelo-datos.md` 2.11 a 2.13 y sección 4). Cambios al modelo de la etapa 4: sección 16.
> Ventas, anulaciones y medios de pago: `docs/api/ventas.md`.
> **Preguntas de la etapa 4 (H-45 a H-53): sección 17, pendientes del dueño.** El contrato está escrito con la recomendación de cada una ("mientras tanto"); si el dueño elige otra opción, se ajusta el punto indicado.

## 0. Qué entra en cada etapa

| Etapa 3 (hecho) | Etapa 4 (este documento, secciones 9 a 17) |
|---|---|
| **Abrir la caja** (turno + efectivo inicial). | **Cerrar la caja a ciegas** (`countedCash`; el servidor calcula `expectedCash` y `difference`). Sección 10. |
| **Ver la caja abierta** (para la pantalla de venta). | **Aviso de caja vieja** (NF-18) en `GET /api/cash-sessions/current`. Sección 3. |
| **Listar cajas** (mínimo, para filtrar ventas por caja). | **Lista con datos de cierre y filtros** (sección 5) y **detalle / arqueo** de una caja (sección 13). |
| La **devolución automática por anulación** (`CashMovement` `OUT` / `SALE_VOID_REFUND`), que crea `POST /api/sales/:id/void` (`ventas.md` 7). | **Ingresos y salidas a mano** (sección 11). |
| | **Notas** agregadas a un cierre (sección 12). |
| | **Qué ve cada rol** antes y después de cerrar (sección 2.1). |

Queda para la **etapa 5**: el pago a proveedor con efectivo de la caja (`SUPPLIER_PAYMENT`, sección 11.2). Para la **etapa 8**: la copia de seguridad después de cada cierre (la respuesta del cierre suma un campo `backup`).

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles | Etapa |
|---|---|:---:|---|:---:|
| `GET /api/cash-sessions/current` | Caja abierta (o `null`), día de trabajo actual y aviso de caja vieja | `any` | Todos | 3 (+4) |
| `POST /api/cash-sessions` | Abrir la caja | **`local`** | Todos | 3 |
| `GET /api/cash-sessions` | Listar cajas, con datos de cierre y filtros | `any` | OWNER, MANAGER | 3 (+4) |
| `GET /api/cash-sessions/:id` | **Detalle y arqueo** de una caja | `any` | OWNER, MANAGER | 4 |
| `POST /api/cash-sessions/:id/close` | **Cerrar a ciegas** | **`local`** | Todos (EMPLOYEE solo la que abrió, H-04) | 4 |
| `POST /api/cash-sessions/:id/notes` | **Agregar una nota** a una caja cerrada | `any` | OWNER, MANAGER | 4 |
| `POST /api/cash-movements` | **Ingreso o salida a mano** en la caja abierta | **`local`** | OWNER, MANAGER | 4 |

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **Orden de registro en Express:** `/api/cash-sessions/current` **antes** que `/api/cash-sessions/:id` (si no, `current` se toma como un id y da `400`).
- **Rol antes que puerta** (ADR 003): un empleado que registra un movimiento recibe `403 FORBIDDEN` desde cualquier puerta; un encargado desde la remota, `403 LOCAL_ONLY` (auditado como `ACCESS_DENIED`).
- Ver la caja abierta, el detalle y la lista **no** es "manejar la caja": son `access: 'any'` (por la puerta remota solo entran encargado y dueño). Agregar notas tampoco mueve plata: `any` (ADR 003 punto 6, decisión del dueño de la etapa 1).

## 2. Esquemas (van a Zod en `@kiosco/shared`, carpeta `cash/`)

Requests **estrictos** (campo desconocido → `400`); respuestas sin `strict` (README 3). `Money`, `MoneyInputSchema` y `PositiveMoneyInputSchema` como en `productos-stock.md` 3.2 y `ventas.md` 4.1.

```ts
ShiftSchema = 'MORNING' | 'AFTERNOON' | 'NIGHT'          // Mañana, Tarde, Noche (PA-32)
CashSessionStatusSchema = 'OPEN' | 'CLOSED'
SignedMoney = string                 // respuesta: "-100.00", "7500.00". Solo en expectedCash y difference (pueden ser negativos)
UserRef = { id: number; fullName: string }

// Lo que ve el EMPLEADO de una caja. Sin efectivo inicial ni nada del arqueo (2.1).
CashSessionPublicSchema = {
  id: number;
  shift: Shift;
  businessDate: string;              // YYYY-MM-DD, día de trabajo calculado al abrir (ADR 002 punto 7)
  status: CashSessionStatus;
  openedAt: string;                  // ISO UTC
  openedBy: UserRef;
}

// Lo que ven ENCARGADO y DUEÑO.
CashSessionSchema = CashSessionPublic & {
  openingCash: Money;                // efectivo inicial (PA-30)
  closedAt: string | null;
  closedBy: UserRef | null;
}

CurrentCashSessionResponseSchema = {
  cashSession: CashSession | CashSessionPublic | null;   // null = no hay caja abierta
  currentBusinessDate: string;       // día de trabajo de "ahora" según el servidor (hora de corte)
  isFromPreviousBusinessDay: boolean; // etapa 4 (NF-18): la abierta es de un día de trabajo anterior. false si no hay caja
  canClose: boolean;                 // etapa 4: el usuario de la sesión puede cerrar la abierta (H-04). false si no hay caja
}

OpenCashSessionRequestSchema = {     // estricto
  shift: Shift;
  openingCash: Money;                // ≥ 0, hasta 2 decimales ("0" se permite: CHECK >= 0)
}

CashSessionListQuerySchema = {
  page?; pageSize?;                  // README 5
  from?: string; to?: string;        // YYYY-MM-DD, por DÍA DE TRABAJO, ambos incluidos; from > to → 400
  status?: CashSessionStatus;
  shift?: Shift;                     // etapa 4
  openedById?: number;               // etapa 4: quién abrió
  closedById?: number;               // etapa 4: quién cerró
  hasDifference?: boolean;           // etapa 4: "true" = cerradas con difference ≠ 0; "false" = cerradas con 0. Implica status CLOSED
  hasOpeningDifference?: boolean;    // etapa 4: "true" = abrieron con efectivo distinto de lo contado en el cierre anterior (solo "true" filtra; "false" no filtra)
}
```

Esquemas nuevos de la etapa 4 (detalle en las secciones 10 a 13):

```ts
// --- Requests (estrictos) ---
CloseCashSessionRequestSchema = {
  countedCash: Money;                // MoneyInputSchema: ≥ 0, hasta 2 decimales. SOLO el efectivo contado (PA-28)
  closingNote?: string | null;       // nota de quien cierra (modelo 2.11): trim, hasta 500; "" = sin nota
}

ManualCashMovementReasonSchema = 'OWNER_WITHDRAWAL' | 'EXPENSE' | 'CASH_CONTRIBUTION' | 'OTHER'
                                     // NO incluye SALE_VOID_REFUND (lo crea solo la anulación) ni SUPPLIER_PAYMENT (etapa 5)
CreateCashMovementRequestSchema = {
  direction: 'IN' | 'OUT';
  reason: ManualCashMovementReason;  // coherente con direction (11.1), si no → 400
  description: string;               // trim, 1 a 200 (CAJ-06: motivo + descripción)
  amount: PositiveMoney;             // > 0, hasta 2 decimales
}

CreateCashSessionNoteRequestSchema = {
  note: string;                      // trim, 1 a 500
}

// --- Respuestas ---
CashSessionClosedPublicSchema = CashSessionPublic & {   // respuesta del cierre para el EMPLEADO
  closedAt: string;
  closedBy: UserRef;
  countedCash: Money;                // lo que él mismo escribió (eco de su dato; no permite deducir el esperado)
}

CashSessionListItemSchema = CashSession & {             // lista, solo OWNER y MANAGER
  countedCash: Money | null;         // null si está abierta
  expectedCash: SignedMoney | null;  // guardado al cerrar
  difference: SignedMoney | null;    // countedCash − expectedCash. Negativo = faltante
  noteCount: number;                 // cantidad de notas agregadas (CashSessionNote)
}

CashSummarySchema = {                // cuenta del efectivo (sección 9)
  openingCash: Money;
  cashSales: Money;                  // Σ lo cobrado en efectivo (pagos CASH) de TODAS las ventas de esta caja, también las anuladas después
  cashIn: Money;                     // Σ movimientos IN
  cashOut: Money;                    // Σ movimientos OUT (incluye devoluciones por anulación)
  voidRefunds: Money;                // de cashOut, lo que son devoluciones por anulación (SALE_VOID_REFUND). Informativo
  expectedCash: SignedMoney;         // openingCash + cashSales + cashIn − cashOut
}

PaymentMethodSummarySchema = {       // "los otros medios se muestran como información" (CAJ-03)
  paymentMethod: { id; kind: PaymentMethodKind; name: string };
  paymentCount: number;              // cantidad de pagos con ese medio
  amount: Money;                     // Σ amount (sin recargo)
  surchargeAmount: Money;            // Σ recargo (solo crédito)
  chargedAmount: Money;              // Σ lo cobrado con ese medio (en crédito, lo del posnet)
  voidedChargedAmount: Money;        // de chargedAmount, lo de ventas anuladas después (se devolvió por fuera o en otra caja)
}

CashSessionSalesSummarySchema = {
  count: number;                     // ventas cobradas en esta caja (todas)
  voidedCount: number;               // de esas, las anuladas (en cualquier momento)
  total: Money;                      // Σ total de todas
  voidedTotal: Money;                // Σ total de las anuladas
  surchargeAmount: Money;            // Σ recargo de todas (se muestra aparte, PA-31)
}

CashMovementSchema = {
  id: number;
  cashSessionId: number;
  direction: 'IN' | 'OUT';
  reason: CashMovementReason;        // los 6 de PA-29
  description: string;
  amount: Money;                     // siempre positivo; el sentido lo da direction
  user: UserRef;                     // quién lo registró (en una devolución, quién anuló)
  createdAt: string;
  sale: { id: number; cashSessionId: number } | null;     // SALE_VOID_REFUND: la venta y SU caja original (puede ser otra)
  supplierAccountEntryId: number | null;                  // SUPPLIER_PAYMENT (etapa 5)
  supplier: { id: number; name: string } | null;          // etapa 5: a quién se pagó (solo SUPPLIER_PAYMENT; proveedores.md 8)
}

CashSessionNoteSchema = {
  id: number; cashSessionId: number; note: string; user: UserRef; createdAt: string;
}

CashSessionDetailSchema = CashSession & {               // detalle y arqueo, solo OWNER y MANAGER
  countedCash: Money | null;
  expectedCash: SignedMoney | null;  // el GUARDADO al cerrar (foto fija); null si está abierta
  difference: SignedMoney | null;
  closingNote: string | null;
  summary: CashSummary;              // abierta: cuenta "hasta ahora" (H-52); cerrada: recalculada, igual a expectedCash (9.3)
  paymentSummary: PaymentMethodSummary[];   // medios con al menos un pago, orden sortOrder e id
  sales: CashSessionSalesSummary;
  movements: CashMovement[];         // todos, del más viejo al más nuevo (sin paginar: son pocos por turno)
  notes: CashSessionNote[];          // todas, de la más vieja a la más nueva
}
```

Funciones nuevas en `shared` (`cash/`), con tests unitarios (sección 9.2):

| Función | Qué hace |
|---|---|
| `calculateExpectedCash({ openingCash, cashSales, cashIn, cashOut })` | `openingCash + cashSales + cashIn − cashOut`, con `Decimal`. Sin redondeo: todos los sumandos ya tienen 2 decimales. Puede dar negativo. |
| `cashDifference(countedCash, expectedCash)` | `countedCash − expectedCash`. Negativo = faltante; positivo = sobrante. |
| `MANUAL_CASH_REASON_DIRECTIONS` | Constante con los sentidos permitidos por motivo (11.1). La usan el esquema Zod y la pantalla (para ofrecer solo los motivos de cada sentido). |

### 2.1 Visibilidad por rol (H-40 a; CAJ-03, CAJ-05)

| Dato | EMPLOYEE | MANAGER | OWNER |
|---|:---:|:---:|:---:|
| Turno, día de trabajo, estado, quién y cuándo abrió | ✅ | ✅ | ✅ |
| Aviso de caja vieja y "puedo cerrarla" (`isFromPreviousBusinessDay`, `canClose`) | ✅ | ✅ | ✅ |
| Efectivo inicial (`openingCash`) | ❌ | ✅ | ✅ |
| Cerrar la caja que **abrió él** | ✅ | ✅ | ✅ |
| Cerrar una caja que abrió **otro** (H-04 b) | ❌ `403` | ✅ | ✅ |
| Respuesta del cierre | `CashSessionClosedPublic`: "cerrada", quién y cuándo, y lo que **él** contó | `CashSessionDetail` | `CashSessionDetail` |
| Efectivo esperado, diferencia, resumen del efectivo, resumen por medio de pago | ❌ (en ninguna ruta, ni antes ni después de cerrar) | ✅ | ✅ |
| Detalle y lista de cajas | ❌ `403` | ✅ | ✅ |
| Registrar ingresos y salidas | ❌ `403` | ✅ (solo local) | ✅ (solo local) |
| Agregar notas | ❌ `403` | ✅ (también desde afuera) | ✅ (también desde afuera) |

**Por qué el empleado no ve el efectivo inicial:** el cierre es **a ciegas** (CAJ-03): el empleado no tiene que poder deducir el efectivo esperado. El efectivo inicial es una parte de esa cuenta, y la caja la pudo abrir otra persona. El dueño lo decidió así (**H-40 a**, 2026-11-25: el empleado ve solo la venta que acaba de cobrar, ni lista de ventas ni efectivo inicial; `ventas.md` 12).

**Qué no recibe el empleado en ninguna respuesta** (regla para backend y test obligatorio de qa, sección 15): las claves `openingCash`, `expectedCash`, `difference`, `summary`, `paymentSummary`, `cashSales`, `cashIn`, `cashOut`, `voidRefunds`, `movements` y `notes`. Se busca de forma recursiva en **todas** las respuestas que puede pedir un empleado (`current`, abrir, cerrar, y los errores `409` de abrir y cerrar). Lo que sí recibe al cerrar, `countedCash`, es el número que él mismo escribió.

**Cómo se arma:** igual que en la etapa 3, una función por rol (`toCashSessionForRole`) y `.parse()` con el esquema del rol antes de responder. La respuesta del cierre para el empleado se arma **solo** con los campos de `CashSessionClosedPublic`; nunca se arma el detalle y después se le sacan campos.

## 3. `GET /api/cash-sessions/current` — Caja abierta

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos.
- **Response 200:** `CurrentCashSessionResponseSchema`. `CashSession` para OWNER y MANAGER; `CashSessionPublic` para EMPLOYEE. **Nunca 404:** si no hay caja abierta, `cashSession: null`, `isFromPreviousBusinessDay: false` y `canClose: false`.
- **Campos de la etapa 4:**
  - `isFromPreviousBusinessDay` = `cashSession.businessDate < currentBusinessDate` (los dos calculados por el servidor con la hora de corte, ADR 002 punto 7). Ejemplo con corte 06:00: una caja abierta el lunes a las 19:00 (día lunes) sigue abierta el martes a las 08:00 (día martes) → `true`. A las 02:30 del martes todavía es el día lunes → `false`.
  - `canClose` = hay caja abierta **y** (el rol es OWNER o MANAGER **o** el usuario es quien la abrió) (H-04 b). Solo sirve para mostrar u ocultar el botón; el servidor lo vuelve a controlar al cerrar (sección 10).
- **Para qué la usa la pantalla:**
  - **Venta:** si `cashSession` es `null`, muestra el formulario de apertura en lugar del carrito (cualquier rol puede abrir, sección 4). Igual el servidor rechaza cobrar sin caja (`422 CASH_SESSION_REQUIRED`, `ventas.md` 6): otro dispositivo pudo cerrarla mientras tanto (regla 8 de ventas).
  - **Aviso de caja vieja (NF-18), sección 14:** la pantalla consulta esta ruta **al cargar la aplicación** (después del login y al cambiar de usuario) y, si `isFromPreviousBusinessDay` es `true`, muestra el aviso.
  - **Lista de ventas:** usa `currentBusinessDate` como filtro por defecto.
- **Errores:** `401`. **Auditoría:** no.
- **Ejemplo** (encargado; caja de la noche anterior que nadie cerró):

```json
{
  "cashSession": {
    "id": 6, "shift": "NIGHT", "businessDate": "2026-11-25", "status": "OPEN",
    "openedAt": "2026-11-25T23:02:11.000Z", "openedBy": { "id": 5, "fullName": "Juan Ruiz" },
    "openingCash": "5000.00", "closedAt": null, "closedBy": null
  },
  "currentBusinessDate": "2026-11-26",
  "isFromPreviousBusinessDay": true,
  "canClose": true
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
- **El turno se elige libremente** (PA-32): el servidor no lo compara con la hora ni con el turno anterior (**H-44 a**, decisión del dueño 2026-11-25).
- **Response 201:** `CashSession` (OWNER, MANAGER) o `CashSessionPublic` (EMPLOYEE).
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Turno inválido; `openingCash` sin formato, negativo o como número de JSON; campo desconocido. |
| `403` | `LOCAL_ONLY` | Desde la puerta remota. |
| `409` | `CASH_SESSION_ALREADY_OPEN` | Ya hay una caja abierta. `details: { "cashSession": CashSessionPublic }` (la abierta: turno, quién y cuándo; **sin** efectivo inicial, sea cual sea el rol). |

- **Auditoría:** `CASH_SESSION_OPEN`, `entityType` `CashSession`, `entityId` = id, `details: { shift, businessDate, openingCash }`; si el efectivo inicial no coincide con lo contado en el cierre anterior, suma `openingDifference`, `previousCashSessionId` y `previousCountedCash`.
- **Ejemplo** (paso 1 de "Cómo probarlo" de la etapa 3: empleado, Mañana, $5.000):

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

En la etapa 3 era mínima (para filtrar ventas por caja, `ventas.md` 8). **La etapa 4 le suma los datos del cierre y más filtros.**

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (EMPLOYEE → `403`).
- **Query:** `CashSessionListQuerySchema`. Paginada. Orden: `openedAt` descendente (la más nueva primero).
- **Response 200:** `Paginated<CashSessionListItem>` (etapa 4; antes `Paginated<CashSession>`: se agregan campos, no cambia ninguno).
- `hasDifference=true` sirve para "cajas con diferencia" (CAJ-05); `noteCount` para ver cuáles ya tienen una explicación (H-48). El reporte de diferencias por turno y por empleado (REP-05) es de la etapa 7.
- **`openingVsPreviousClose`** (en cada ítem, y en el detalle): `{ previousCashSessionId, previousCountedCash, difference } | null`. `difference = openingCash − previousCountedCash` (con signo, `"0.00"` si coincide). `null` si no había cierre anterior. `hasOpeningDifference=true` deja solo las de `difference ≠ 0`. Nunca llega al empleado (ni el campo ni el filtro: la lista es 403).
- **Rapidez:** son unas 3 cajas por día (≈ 1.100 por año): los índices de `businessDate` y `(openedById, openedAt)` alcanzan; `noteCount` sale de una consulta agrupada (no una por caja).
- **Errores:** `400` (fechas inválidas, `from` posterior a `to`, `hasDifference` que no es `true`/`false`), `403`. **Auditoría:** no.

## 6. Reglas para backend (concurrencia con ventas, anulaciones, movimientos y cierre)

- **Venta, anulación y movimiento a mano** leen la caja abierta **dentro de su transacción** con `SELECT ... FROM cash_sessions WHERE status = 'OPEN' FOR SHARE`.
- **El cierre** toma la fila de la caja con `SELECT ... FROM cash_sessions WHERE id = :id FOR UPDATE`. Ese bloqueo **espera** a que terminen las ventas, anulaciones y movimientos en curso (que tienen la fila con `FOR SHARE`). Cuando el cierre termina, los que llegaron mientras tanto vuelven a leer la fila, ya no está `OPEN`, y responden `422 CASH_SESSION_REQUIRED`. Así **ninguna venta ni movimiento queda en una caja que se cerró a mitad de camino**, y el esperado incluye todo lo que se guardó antes del cierre.
- La caja **cerrada nunca se modifica** (D9): la devolución de una venta de otro turno va a la caja **abierta** (`ventas.md` 7); un movimiento a mano siempre va a la caja abierta; las notas se agregan en otra tabla (`CashSessionNote`).

## 7. Códigos y acciones nuevos

| HTTP | `code` | Mensaje sugerido | Etapa |
|---|---|---|:---:|
| 409 | `CASH_SESSION_ALREADY_OPEN` | Ya hay una caja abierta. Para abrir otra, primero hay que cerrar esa. | 3 |
| 422 | `CASH_SESSION_REQUIRED` | No hay ninguna caja abierta. Abrí la caja para seguir. (Lo usan venta, anulación y movimientos.) | 3 |
| 409 | `CASH_SESSION_ALREADY_CLOSED` | Esta caja ya está cerrada. | 4 |
| 409 | `CASH_SESSION_NOT_CLOSED` | Las notas se agregan a una caja cerrada. | 4 |

Además se usan los comunes `VALIDATION_ERROR`, `FORBIDDEN`, `LOCAL_ONLY` y `NOT_FOUND`. Van a `ERROR_CODES` en `shared`.

Acciones de auditoría (ya listadas en `modelo-datos.md` 2.21): `CASH_SESSION_OPEN` (etapa 3), `CASH_SESSION_CLOSE`, `CASH_MOVEMENT_IN`, `CASH_MOVEMENT_OUT` y `CASH_SESSION_NOTE` (etapa 4). Todas en la misma transacción que la acción (README 8).

## 8. Decisiones del dueño (2026-11-25)

Las preguntas de la etapa 3 (H-33 a H-44, `requisitos.md` 7.7) se resolvieron aceptando todas las recomendaciones. Las que tocan la caja:

| H | Decisión | Dónde |
|---|---|---|
| H-40 | El empleado ve solo la venta que acaba de cobrar: de la caja, **sin efectivo inicial** (`CashSessionPublic`) y sin la lista de cajas (`403`). | 2.1, 3, 5 |
| H-41 | Anular una venta siempre requiere una caja abierta (`422 CASH_SESSION_REQUIRED`), tenga o no efectivo. | `ventas.md` 7 |
| H-44 | El turno se elige libremente al abrir; el servidor no lo valida. | 4 |

Las de la etapa 4 (H-45 a H-53) están en la sección 17, **pendientes**.

---

# Etapa 4

## 9. Efectivo esperado y diferencia (CAJ-04)

### 9.1 Fórmula

```
expectedCash = openingCash
             + cashSales     Σ (amount + surchargeAmount) de los pagos con medio kind = CASH
                             de TODAS las ventas de esta caja (también las anuladas después)
             + cashIn        Σ amount de los CashMovement IN de esta caja
             − cashOut       Σ amount de los CashMovement OUT de esta caja
                             (gastos, retiros, otros y devoluciones por anulación)

difference   = countedCash − expectedCash      (negativo = faltante; positivo = sobrante)
```

Reglas de la cuenta (todas salen de documentos aprobados):

- **Solo efectivo** (CAJ-03, CAJ-04, PA-28). El efectivo es el medio con `kind = CASH`, no el nombre ni el id (`ventas.md` 5). Débito, crédito, QR y transferencia van solo al resumen por medio de pago (`paymentSummary`), nunca al esperado.
- **El recargo del crédito no entra:** queda en el posnet, no en la caja. En efectivo el recargo es siempre 0 (`CHECK` de `payment_methods`, `ventas.md` 13), así que `amount + surchargeAmount` de un pago en efectivo es su `amount`. Se escribe la suma completa para que sea **la misma cuenta** que usa la anulación para devolver (`Σ chargedAmount` de los pagos en efectivo, `ventas.md` 7 paso 5).
- **El vuelto no entra:** `SalePayment.amount` en efectivo es **lo que queda en la caja**, nunca lo que entregó el cliente (`ventas.md` 2.5). El vuelto no se guarda (VEN-12).
- **Las ventas anuladas siguen contando en su caja** (modelo 2.11): esa plata entró en ese turno. La devolución es una salida (`SALE_VOID_REFUND`) en la caja **abierta al anular**, que puede ser otra (PA-17). Así una caja cerrada nunca cambia (D9).
- **Puede dar negativo:** por ejemplo, abrir con $0 y anular una venta en efectivo de otro turno. El sistema no controla que haya efectivo suficiente para una devolución (`ventas.md` 7) ni para una salida (H-53). Por eso el modelo deja de exigir `expectedCash >= 0` (sección 16). El contado nunca es negativo (`CHECK counted_cash >= 0`).
- **Sin redondeo:** todos los sumandos tienen 2 decimales; las sumas y la resta son exactas con `Decimal` (ADR 002).

### 9.2 Ejemplos (tests unitarios obligatorios de `calculateExpectedCash` y de integración con el cierre)

Medios del seed: `1` Efectivo, `2` Débito, `3` Crédito (10 %).

**Ejemplo A — el de "Cómo probarlo" del plan** (caja Tarde):

| Paso | Efectivo | Otros medios |
|---|---:|---|
| Abrir con $5.000 | `openingCash` 5.000 | |
| Venta de $3.000 en efectivo | `cashSales` + 3.000 | |
| Venta de $2.000 con débito | — | Débito 2.000 (solo informativo) |
| Gasto "Pago limpieza" $500 (`OUT` / `EXPENSE`) | `cashOut` + 500 | |
| **Esperado** | 5.000 + 3.000 + 0 − 500 = **7.500** | |
| Contado a ciegas | **7.400** | |
| **Diferencia** | 7.400 − 7.500 = **−100** (faltan $100) | |

**Ejemplo B — con vuelto** (la venta del ejemplo 4 de `ventas.md`): abrir con $5.000; venta de **$4.647** en efectivo; el cliente entrega $5.000 y recibe $353 de vuelto.
- `SalePayment.amount` en efectivo = **4.647** (no 5.000). Entró un billete de $5.000 y salieron $353: quedan $4.647 más en la caja.
- Esperado = 5.000 + 4.647 = **9.647**. Contado 9.647 → diferencia **0**.
- Si la cuenta usara lo entregado ($5.000), el esperado daría 10.000 y aparecería un faltante falso de $353.

**Ejemplo C — devolución por anulación de una venta de otro turno (PA-17):**
- Caja **#7, Mañana** (ya cerrada): tuvo la venta #1024 del ejemplo 2 de `ventas.md` ($4.500 en efectivo + $4.500 con crédito, $5.000 en el posnet). Esos $4.500 cuentan en el esperado de la #7, que **no cambia** después.
- Caja **#8, Tarde:** abrir con $5.000; ventas en efectivo por $2.000; un encargado anula la venta #1024 → la anulación crea `OUT` / `SALE_VOID_REFUND` de **$4.500** en la #8 (`ventas.md` 7). Los $5.000 del crédito se devuelven en el posnet, por fuera.
- Esperado de la #8 = 5.000 + 2.000 + 0 − 4.500 = **2.500**. Contado 2.500 → diferencia **0**.
- En el detalle de la #8, el movimiento trae `sale: { "id": 1024, "cashSessionId": 7 }` (la devolución es de una venta de otra caja); `summary.voidRefunds` = 4.500. En el detalle de la #7, `sales.voidedCount` = 1 y `paymentSummary` del crédito con `voidedChargedAmount` 5.000.
- **Misma caja:** si la venta se anula en el mismo turno, suma y resta en la misma caja: abrir 5.000 + venta en efectivo 3.000 − devolución 3.000 = **5.000**.

**Ejemplo D — pago mixto con recargo** (la venta del ejemplo 2 de `ventas.md`): abrir con **$2.000**; venta de subtotal $10.000 con descuento $1.000; el cliente paga $4.500 en efectivo (entrega $5.000, vuelto $500) y $4.500 con crédito (recargo $500 → **$5.000 en el posnet**). Total de la venta: $9.500.

| | `amount` | `surchargeAmount` | `chargedAmount` | ¿Entra en el esperado? |
|---|---:|---:|---:|:---:|
| Efectivo | 4.500 | 0 | 4.500 | ✅ |
| Crédito | 4.500 | 500 | 5.000 | ❌ (posnet) |

- Esperado = 2.000 + 4.500 = **6.500**. Ni el total de la venta ($9.500), ni el crédito, ni su recargo de $500 entran en la caja.
- `paymentSummary`: Efectivo `chargedAmount` 4.500; Crédito `amount` 4.500, `surchargeAmount` 500, `chargedAmount` 5.000. `sales.surchargeAmount` 500 (se muestra aparte, PA-31).

**Casos unitarios extra:** sin ventas ni movimientos (esperado = efectivo inicial); efectivo inicial $0 + devolución de $4.500 → esperado **−4.500** (y el cierre funciona); un aporte de cambio `IN` de $1.000 suma 1.000.

### 9.3 Una cuenta, dos momentos

- **Al cerrar** se calcula y se **guarda** `expectedCash` y `difference` (foto fija, modelo 2.11). No se recalculan nunca.
- **En el detalle** (`summary`) la cuenta se arma de nuevo con los datos actuales. Para una caja **cerrada** tiene que dar exactamente el `expectedCash` guardado, porque nada de lo que suma cambia después del cierre (las ventas anuladas siguen contando; las devoluciones van a otra caja). **Test obligatorio de qa:** cerrar, anular después una venta en efectivo de esa caja desde otra caja abierta, y comprobar que el detalle de la cerrada sigue dando el mismo `summary.expectedCash` = `expectedCash`.
- Para una caja **abierta**, `summary` es "cómo va hasta ahora" (solo encargado y dueño; H-52).

## 10. `POST /api/cash-sessions/:id/close` — Cerrar la caja a ciegas

- **Sesión:** sí. **Acceso:** **`local`** (CAJ-09): desde la remota → `403 LOCAL_ONLY` + `ACCESS_DENIED`. **Roles:** todos (matriz: "cerrar su caja"); **EMPLOYEE solo la caja que abrió él** (H-04 b).
- **Por qué el `:id` en la ruta:** se cierra **la caja que la pantalla está mostrando**. Si mientras tanto otro la cerró y alguien abrió otra, el pedido no cierra la nueva por error con un conteo viejo: responde `409 CASH_SESSION_ALREADY_CLOSED`.
- **Request:** `CloseCashSessionRequestSchema`. **Solo el efectivo contado** (PA-28) y, opcional, la nota de quien cierra (`closingNote`, modelo 2.11). La pantalla no manda nada del esperado ni de otros medios (si los manda → `400`, esquema estricto).

### 10.1 Qué hace, en este orden (una transacción)

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod (`:id` entero positivo; `countedCash` ≥ 0 con hasta 2 decimales). | `400 VALIDATION_ERROR` |
| 2 | Bloquear la caja: `SELECT ... FROM cash_sessions WHERE id = :id FOR UPDATE` (sección 6). Espera a las ventas, anulaciones y movimientos en curso. | No existe → `404 NOT_FOUND` |
| 3 | **Quién cierra (H-04 b):** si el rol es EMPLOYEE y `openedById` no es el usuario → rechazar. OWNER y MANAGER cierran cualquiera. | `403 FORBIDDEN` ("Esta caja la abrió otra persona. La puede cerrar quien la abrió, un encargado o el dueño.") |
| 4 | Si `status = CLOSED`. | `409 CASH_SESSION_ALREADY_CLOSED`, `details: { closedAt, closedBy }` |
| 5 | Calcular con dos consultas de suma (no se traen las ventas una por una): `cashSales` (pagos `CASH` de las ventas de esta caja, todas), `cashIn` y `cashOut` (movimientos de esta caja). `expectedCash = calculateExpectedCash(...)`; `difference = cashDifference(countedCash, expectedCash)`. | — |
| 6 | `UPDATE cash_sessions SET status = 'CLOSED', closed_at = ahora (reloj del servidor), closed_by_id, counted_cash, expected_cash, difference, closing_note`. | Un `CHECK` roto → `500` (es un error del backend, no del usuario) |
| 7 | Auditar `CASH_SESSION_CLOSE`. | — |
| 8 | Después de confirmar (fuera de la transacción, **etapa 8**): copia de seguridad (modelo sección 6). Si falla, el cierre **igual** queda hecho. | — |

- Dos cierres a la vez (dos dispositivos, o el empleado y el encargado): el segundo espera en el paso 2 y choca en el paso 4 (`409`). **Nunca** se cierra dos veces ni se pisan los números.
- **Contado $0:** se permite (`CHECK counted_cash >= 0` del modelo aprobado; H-50).
- **Sin control de diferencia grande:** cualquier diferencia se guarda y solo se informa (CAJ-05; H-45). El servidor **nunca** responde algo distinto según el esperado: si lo hiciera (por ejemplo, "volvé a contar"), probando montos se podría adivinar el esperado.
- **No se cierra con datos inválidos** (plan): formato incorrecto → `400` y no se guarda nada.

### 10.2 Carrito sin cobrar (regla 8 de ventas, PA-18)

El servidor **no conoce los carritos** (viven solo en la pantalla, VEN-14). Por eso no hay ningún control en la API:
- **En la pantalla desde la que se cierra:** si el carrito tiene líneas, el botón "Cerrar caja" no sigue: muestra "Tenés un carrito sin cobrar. Cobralo o vacialo antes de cerrar la caja." (regla 8: "no se puede cerrar la caja con un carrito sin cobrar en la pantalla desde la que se cierra"). Lo hace el frontend.
- **En otro dispositivo** con un carrito armado: al cobrar, el servidor responde `422 CASH_SESSION_REQUIRED` (la caja ya está cerrada) y la pantalla ofrece abrir una caja nueva (regla 8). El `clientRequestId` del carrito se mantiene (`ventas.md` 2.4).

### 10.3 Respuesta según el rol

- **EMPLOYEE → `200` `CashSessionClosedPublic`:** que quedó cerrada, quién y cuándo, y el efectivo que **él** escribió. **Nada** del esperado, la diferencia, el efectivo inicial ni los otros medios (2.1). La pantalla muestra "Caja cerrada. Contaste $ 7.400." (H-46).
- **OWNER y MANAGER → `200` `CashSessionDetail`** (el mismo del detalle, sección 13), con `expectedCash` y `difference` guardados.
- La pantalla de cierre es **a ciegas para todos** (H-04: "contando a ciegas igual"): el formulario solo pide el contado. El encargado ve el resultado **después** de cerrar.
- **Si se pierde la respuesta** (se cortó el WiFi) y la pantalla reintenta: `409 CASH_SESSION_ALREADY_CLOSED` con `details.closedBy`. Si `closedBy.id` es el usuario, la pantalla muestra "La caja ya quedó cerrada" como éxito (un encargado puede ver el detalle con `GET /:id`).

### 10.4 Errores

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | `:id` no numérico; `countedCash` sin formato, negativo, con más de 2 decimales o como número de JSON; `closingNote` de más de 500; campo desconocido (`expectedCash`, `difference`, otros medios…). | `fields` |
| `403` | `FORBIDDEN` | Empleado que cierra una caja que abrió otro (H-04 b). | — |
| `403` | `LOCAL_ONLY` | Puerta remota. | — |
| `404` | `NOT_FOUND` | No existe la caja. | — |
| `409` | `CASH_SESSION_ALREADY_CLOSED` | Ya estaba cerrada (cerrar dos veces). | `{ closedAt, closedBy: UserRef }` (iguales para todos los roles; no dicen nada del arqueo) |
| `422` | `CASH_AMOUNT_OUT_OF_RANGE` | Defensa en profundidad: un total del cierre no entra en la columna (`numeric(18,2)`). No debería ocurrir porque todo importe de entrada tiene tope de 9 enteros; el mensaje pide avisar al dueño. | — |

### 10.5 Auditoría

`CASH_SESSION_CLOSE`, `entityType` `CashSession`, `entityId` = id, `details: { shift, businessDate, openedById, countedCash, expectedCash, difference, closingNote, summary: { openingCash, cashSales, cashIn, cashOut } }`. El registro queda con la puerta y la IP (README 8). La auditoría **no** se muestra a empleados.

### 10.6 Ejemplo (pasos 3 y 4 de "Cómo probarlo" del plan; ejemplo A)

Empleado que abrió la caja #8:

```json
{ "countedCash": "7400" }
```

Respuesta al **empleado**:

```json
{
  "id": 8, "shift": "AFTERNOON", "businessDate": "2026-11-26", "status": "CLOSED",
  "openedAt": "2026-11-26T17:00:05.000Z", "openedBy": { "id": 5, "fullName": "Juan Ruiz" },
  "closedAt": "2026-11-26T23:01:40.000Z", "closedBy": { "id": 5, "fullName": "Juan Ruiz" },
  "countedCash": "7400.00"
}
```

Si el que cierra es un **encargado** (o el encargado pide después `GET /api/cash-sessions/8`):

```json
{
  "id": 8, "shift": "AFTERNOON", "businessDate": "2026-11-26", "status": "CLOSED",
  "openedAt": "2026-11-26T17:00:05.000Z", "openedBy": { "id": 5, "fullName": "Juan Ruiz" },
  "openingCash": "5000.00",
  "closedAt": "2026-11-26T23:01:40.000Z", "closedBy": { "id": 5, "fullName": "Juan Ruiz" },
  "countedCash": "7400.00", "expectedCash": "7500.00", "difference": "-100.00", "closingNote": null,
  "summary": { "openingCash": "5000.00", "cashSales": "3000.00", "cashIn": "0.00", "cashOut": "500.00",
               "voidRefunds": "0.00", "expectedCash": "7500.00" },
  "paymentSummary": [
    { "paymentMethod": { "id": 1, "kind": "CASH", "name": "Efectivo" }, "paymentCount": 1,
      "amount": "3000.00", "surchargeAmount": "0.00", "chargedAmount": "3000.00", "voidedChargedAmount": "0.00" },
    { "paymentMethod": { "id": 2, "kind": "DEBIT_CARD", "name": "Débito" }, "paymentCount": 1,
      "amount": "2000.00", "surchargeAmount": "0.00", "chargedAmount": "2000.00", "voidedChargedAmount": "0.00" }
  ],
  "sales": { "count": 2, "voidedCount": 0, "total": "5000.00", "voidedTotal": "0.00", "surchargeAmount": "0.00" },
  "movements": [
    { "id": 91, "cashSessionId": 8, "direction": "OUT", "reason": "EXPENSE", "description": "Pago limpieza",
      "amount": "500.00", "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-26T19:15:00.000Z",
      "sale": null, "supplierAccountEntryId": null }
  ],
  "notes": []
}
```

## 11. `POST /api/cash-movements` — Ingreso o salida de efectivo a mano

- **Sesión:** sí. **Acceso:** **`local`** (CAJ-09, ADR 003 punto 6). **Roles:** OWNER, MANAGER (CAJ-06, PA-29: también los **ingresos**). EMPLOYEE → `403 FORBIDDEN`.
- **Va siempre a la caja abierta** (como la venta y la anulación): no lleva `cashSessionId`. La plata sale o entra del mismo cajón físico, así que pertenece a la caja abierta en ese momento. La respuesta dice en qué caja quedó.
- **Request:** `CreateCashMovementRequestSchema`.
- **Qué hace** (una transacción):
  1. Validar formato y la coherencia motivo/sentido (11.1) → `400`.
  2. Caja abierta con `FOR SHARE` (sección 6). Si no hay → `422 CASH_SESSION_REQUIRED` (H-47).
  3. Crear el `CashMovement` con `userId` = el usuario de la sesión.
  4. Auditar.
- **No se controla que haya efectivo suficiente** para una salida (H-53): como en la devolución por anulación (`ventas.md` 7), la diferencia aparece en el arqueo. La pantalla le muestra al encargado el esperado "hasta ahora" (`summary` del detalle) como referencia.
- **Doble clic:** como en el resto de la API (README 7), la pantalla deshabilita el botón mientras espera. No se agrega clave de idempotencia: un movimiento repetido se ve en el detalle y se compensa con otro movimiento `OTHER` del sentido contrario, con descripción.
- **No se editan ni se borran** movimientos (no hay rutas). Un error se corrige con otro movimiento.
- **Response 201:** `CashMovementSchema`.

### 11.1 Motivo y sentido (PA-29; `CHECK` del modelo 2.13)

| Motivo | `reason` | Sentidos permitidos a mano |
|---|---|---|
| Retiro del dueño | `OWNER_WITHDRAWAL` | Solo `OUT` |
| Gasto | `EXPENSE` | Solo `OUT` |
| Aporte de cambio | `CASH_CONTRIBUTION` | Solo `IN` |
| Otro | `OTHER` | `IN` u `OUT` (la descripción explica qué fue) |
| Devolución por anulación | `SALE_VOID_REFUND` | **Nunca a mano:** la crea solo la anulación de una venta (`ventas.md` 7), con la venta vinculada. → `400` |
| Pago a proveedor | `SUPPLIER_PAYMENT` | **Reservado para la etapa 5** (11.2). → `400` |

- La coherencia se valida en el **esquema Zod compartido** (con `MANUAL_CASH_REASON_DIRECTIONS`): "retiro del dueño" como `IN` → `400 VALIDATION_ERROR` con `fields: [{ "path": "direction", "message": "Un retiro del dueño siempre es una salida." }]` (test del plan). El `CHECK` de la base es la segunda barrera.
- La pantalla elige primero el sentido ("Ingreso" / "Salida") y después muestra solo los motivos de ese sentido.

### 11.2 Pago a proveedor en efectivo: reservado para la etapa 5 (decisión técnica)

**Decisión:** en esta etapa `SUPPLIER_PAYMENT` **no** se acepta como movimiento a mano (`400`). Lo crea solo el pago a proveedor de la etapa 5 (PRV-04, CAJ-07: "genera automáticamente la salida de caja").

| | Reservarlo (elegida) | Permitirlo a mano ahora |
|---|---|---|
| Deuda con el proveedor | Siempre coincide: cada salida `SUPPLIER_PAYMENT` tiene su movimiento de cuenta corriente (PRV-03). | La caja diría "pagué a X" pero la deuda con X no bajaría: dos registros que no coinciden. |
| Base de datos | Ya lo exige el `CHECK` (`SUPPLIER_PAYMENT` ⇒ `supplier_account_entry_id IS NOT NULL`). | Habría que aflojar el `CHECK` y después volver a ajustarlo. |
| Uso real | No hay entrega al cliente antes de terminar todas las etapas (plan): nadie lo necesita mientras tanto. | — |

**Contra:** en las pruebas de la etapa 4 no se puede registrar un pago a proveedor con la plata de la caja; se prueba en la etapa 5.

**Etapa 5:** la salida `SUPPLIER_PAYMENT` la crean el pago a proveedor con `source = CASH_REGISTER` y el "pagar ahora" de una compra (`proveedores.md` 8, `compras.md` 5), en la caja abierta, solo en el local y sin caja → `422 CASH_SESSION_REQUIRED`. A mano sigue dando `400`. Entra en el esperado como cualquier salida (9.1); la auditoría es `SUPPLIER_PAYMENT` (no se escribe un `CASH_MOVEMENT_OUT` aparte).

### 11.3 Errores y auditoría

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Motivo y sentido que no coinciden; `SALE_VOID_REFUND` o `SUPPLIER_PAYMENT`; descripción vacía o de más de 200; `amount` 0, negativo, con más de 2 decimales o como número de JSON; campo desconocido (`cashSessionId`, `saleId`, `userId`…). |
| `403` | `FORBIDDEN` | Empleado. |
| `403` | `LOCAL_ONLY` | Puerta remota (encargado o dueño). |
| `422` | `CASH_SESSION_REQUIRED` | No hay caja abierta (H-47). |

- **Auditoría:** `CASH_MOVEMENT_IN` o `CASH_MOVEMENT_OUT` (según `direction`), `entityType` `CashMovement`, `entityId` = id, `details: { cashSessionId, reason, description, amount }`. (La devolución por anulación no escribe uno aparte: la cubre `SALE_VOID`, `ventas.md` 7.)
- **Ejemplo** (paso 2 de "Cómo probarlo": encargado, gasto de $500):

```json
{ "direction": "OUT", "reason": "EXPENSE", "description": "Pago limpieza", "amount": "500" }
```

```json
{
  "id": 91, "cashSessionId": 8, "direction": "OUT", "reason": "EXPENSE", "description": "Pago limpieza",
  "amount": "500.00", "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-26T19:15:00.000Z",
  "sale": null, "supplierAccountEntryId": null
}
```

## 12. `POST /api/cash-sessions/:id/notes` — Agregar una nota a un cierre

- **Sesión:** sí. **Acceso:** `any`: **también desde afuera** (ADR 003 punto 6 y decisión del dueño de la etapa 1: "las notas no mueven plata"; CAJ-08). **Roles:** OWNER, MANAGER (CAJ-08: los que ven la diferencia). EMPLOYEE → `403`.
- **Request:** `CreateCashSessionNoteRequestSchema`.
- **Solo se agregan** (PA-30, CAJ-08): no hay rutas para editar ni borrar notas, ni para cambiar los números del cierre ("un cierre hecho no se corrige"). Cada nota queda con quién y cuándo.
- **Solo en cajas cerradas:** CAJ-08 habla de notas "a un cierre hecho" (modelo 2.12: "notas agregadas a un cierre"). Una caja abierta → `409 CASH_SESSION_NOT_CLOSED`. Lo que pasa con la plata durante el turno se registra como movimiento (sección 11). La nota de quien cierra va en el propio cierre (`closingNote`).
- **Notas obligatorias:** no hay (H-48). La lista de cajas muestra `difference` y `noteCount` para ver qué diferencias no tienen explicación.
- **Response 201:** `CashSessionNoteSchema`.
- **Errores:** `400` (nota vacía o de más de 500, campo desconocido), `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CASH_SESSION_NOT_CLOSED`.
- **Auditoría:** `CASH_SESSION_NOTE`, `entityType` `CashSession`, `entityId` = id de la caja (así se encuentra todo lo de una caja con el índice `(entityType, entityId)`), `details: { cashSessionNoteId, note }`. Con `channel` `REMOTE` si se agregó desde afuera (NF-08).
- **Ejemplo** (paso 4 de "Cómo probarlo"):

```json
{ "note": "Juan avisó que dio mal un vuelto de $100." }
```

```json
{ "id": 12, "cashSessionId": 8, "note": "Juan avisó que dio mal un vuelto de $100.",
  "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-26T23:10:02.000Z" }
```

## 13. `GET /api/cash-sessions/:id` — Detalle y arqueo de una caja

- **Sesión:** sí. **Acceso:** `any` (ver datos no es manejar la caja). **Roles:** OWNER, MANAGER (CAJ-03, CAJ-05). EMPLOYEE → `403`.
- **Response 200:** `CashSessionDetailSchema` (igual para encargado y dueño: no hay costos ni ganancia).
  - **Esperado, contado y diferencia:** los guardados al cerrar (`null` si está abierta).
  - **`openingVsPreviousClose`:** diferencia de apertura (sección 5); el frontend la resalta si `difference ≠ "0.00"`.
  - **`summary`:** la cuenta del efectivo (sección 9). En una caja **abierta** es "cómo va hasta ahora" (**H-52**, mientras tanto: se muestra); en una cerrada da lo mismo que `expectedCash`.
  - **`paymentSummary`:** cada medio usado en esta caja, con lo cobrado (en crédito, lo del posnet con recargo) y cuánto de eso es de ventas anuladas después. Incluye las ventas anuladas por la misma razón que el esperado: esa plata pasó por ese turno; la devolución se hizo por fuera o en otra caja.
  - **`sales`:** cantidad y totales de las ventas cobradas en esta caja y de las anuladas. **La lista de ventas** de la caja sale de `GET /api/sales?cashSessionId=:id` (paginada, `ventas.md` 8.1); no se repite acá (un turno puede tener cientos).
  - **Anulaciones**, en dos lugares: las ventas **de esta caja** que se anularon (`sales.voidedCount`, `voidedTotal`, `paymentSummary[].voidedChargedAmount`) y las devoluciones **registradas en esta caja** (en `movements`, motivo `SALE_VOID_REFUND`, con `sale.cashSessionId` de la venta original).
  - **`movements`** y **`notes`:** todos, sin paginar.
- **Rapidez:** un puñado de consultas agrupadas por caja (pagos por medio, movimientos por sentido, ventas por estado); índices existentes `sales(cash_session_id, created_at)`, `sale_payments(sale_id)`, `cash_movements(cash_session_id)`, `cash_session_notes(cash_session_id)`.
- **Errores:** `400` (`:id` no numérico), `403`, `404`. **Auditoría:** no.
- **Ejemplo:** sección 10.6.

## 14. Aviso al arrancar: caja abierta de un día anterior (NF-18)

NF-18 punto 5: "al arrancar, el sistema avisa si había una caja abierta, para cerrarla normalmente". Pasa cuando se cortó la luz o se apagó la PC sin cerrar.

- **Qué es "de un día anterior":** `cashSession.businessDate < currentBusinessDate`, con la hora de corte (sección 3). El turno noche que pasa la medianoche **no** dispara el aviso antes de la hora de corte.
- **Cómo lo obtiene la pantalla:** con `GET /api/cash-sessions/current` (campos `isFromPreviousBusinessDay` y `canClose`). No hace falta una ruta nueva. La pantalla lo consulta **al cargar la aplicación**, después del login y al "cambiar usuario", y muestra a **todos los roles** un aviso: "Quedó abierta la caja del turno Noche del 25/11, abierta por Juan Ruiz. Cerrala contando el efectivo." Con `canClose: true`, ofrece el botón "Cerrar caja"; con `false` (empleado que no la abrió): "Avisale a un encargado o al dueño para que la cierre".
- **En el servidor:** al arrancar, el backend consulta si hay una caja `OPEN` de un día anterior y lo deja en el log (nivel `warn`, con id, turno, día y quién la abrió). Solo informa: no cierra nada solo.
- **Qué se puede hacer mientras tanto (H-49, mientras tanto: solo aviso):** se sigue vendiendo en esa caja. Cada venta lleva **su propio** día de trabajo (el de hoy, ADR 002), así que los reportes por día no se mezclan; el arqueo de esa caja sí junta los dos días hasta que alguien la cierre.
- **Lo que estaba en un carrito sin cobrar se perdió** (no se guarda hasta cobrar, PA-18, NF-18): no hay nada que recuperar.

## 15. Notas para los demás agentes

- **base-datos:** tabla `CashSessionNote` y los cambios de la sección 16 en una migración nueva (los `CHECK` e índices parciales escritos a mano, con un test por cada uno, R8 del plan). Seed: opcional, una caja cerrada de ejemplo con una nota, armada con el cálculo correcto.
- **backend:**
  - Esquemas y funciones de la sección 2 en `@kiosco/shared` (`cash/`), con tests unitarios de los ejemplos de 9.2.
  - Cierre según 10.1 (orden exacto; `FOR UPDATE` sobre la caja; sumas con SQL agregado, nunca con `number`). Movimientos y notas según 11 y 12.
  - Respuestas por rol: el empleado recibe `CashSessionClosedPublic` armado campo por campo (2.1).
  - `GET /current` con `isFromPreviousBusinessDay` y `canClose`; aviso en el log al arrancar (sección 14).
  - Registrar `/current` antes que `/:id`. `access` de cada ruta según la tabla de la sección 1.
- **frontend (`/impeccable`):**
  - **Cierre a ciegas:** un solo campo (efectivo contado) y nota opcional; confirmación del monto escrito ("¿Contaste $ 7.400?", H-45) sin mostrar nada del esperado; bloqueo si hay carrito sin cobrar en esa pantalla (10.2); botón visible solo con `canClose`.
  - Después de cerrar: el empleado ve "Caja cerrada. Contaste $ X."; encargado y dueño ven el detalle con la diferencia resaltada (negativa = faltante).
  - **Movimientos:** primero "Ingreso" o "Salida", después los motivos de ese sentido (`MANUAL_CASH_REASON_DIRECTIONS`), descripción y monto. Solo encargado y dueño, solo en el local.
  - **Detalle:** esperado, contado, diferencia, `summary` paso a paso (como la tabla del ejemplo A), resumen por medio de pago, ventas (con link a la lista filtrada por caja), anulaciones, movimientos y notas; "Agregar nota" en cajas cerradas.
  - **Aviso de caja vieja** (sección 14) al cargar la app.
  - Mensajes por `code`.
- **qa:**
  - Unitarios: los ejemplos A, B, C y D de 9.2 y los casos extra (esperado negativo incluido).
  - Integración, los del plan: el empleado cierra y la respuesta no trae esperado ni diferencia; el encargado los ve; cerrar dos veces → `409`; un encargado cierra la caja que dejó abierta un empleado; un **empleado no puede cerrar la caja que abrió otro** (`403`); empleado registrando una salida → `403`; "retiro del dueño" como ingreso → `400`; `SALE_VOID_REFUND` y `SUPPLIER_PAYMENT` a mano → `400`; no hay ruta para editar un cierre ni un movimiento (`PATCH`/`PUT`/`DELETE` → `404`); nota agregada por el encargado, también por la puerta remota; nota en caja abierta → `409`; movimientos y cierre por la puerta remota → `403 LOCAL_ONLY`; movimiento sin caja abierta → `422`.
  - **Visibilidad (2.1):** búsqueda recursiva de las claves prohibidas en todas las respuestas que puede pedir un empleado, incluidos los `409`.
  - **Concurrencia:** una venta en curso y un cierre a la vez → la venta queda en la caja y en el esperado, o recibe `422`; nunca una venta en una caja cerrada. Dos cierres a la vez → uno `200` y otro `409`.
  - **9.3:** el detalle de una caja cerrada no cambia después de anular una de sus ventas desde otra caja.
  - **`isFromPreviousBusinessDay`** con relojes simulados (antes y después de la hora de corte).
  - Esperado negativo: abrir con $0, anular una venta en efectivo de otra caja y cerrar → `200` con `expectedCash` negativo.
  - e2e del plan: abrir, vender en efectivo, registrar un gasto, cerrar a ciegas y ver la diferencia como encargado.
- **seguridad:** revisar en especial 2.1 (que el esperado no se filtre al empleado por ninguna ruta, incluidos errores, listas y la respuesta del cierre), 10.1 paso 3 (H-04), que una caja cerrada no se pueda modificar (sin rutas de edición; notas en otra tabla), el orden rol → puerta, y la auditoría de cierres, movimientos y notas (con la puerta remota en las notas).

## 16. Cambios al modelo de datos (etapa 4)

Detalle en `docs/modelo-datos.md` 2.11 a 2.13 y sección 4. Resumen para base-datos:

| Tabla | Cambio | Por qué |
|---|---|---|
| `cash_sessions` | **Quitar** `cash_sessions_expected_cash_check` (`expected_cash >= 0`). | El esperado puede ser negativo (9.1): con ese `CHECK`, cerrar esa caja fallaría y, como hay una sola caja abierta, **el kiosco no podría abrir otra**. |
| `cash_sessions` | **Agregar** `CHECK (difference IS NULL OR difference = counted_cash - expected_cash)`. | La diferencia siempre coincide con sus dos números (como `sales_total_check`). |
| `cash_sessions` | **Agregar** `CHECK (status = 'CLOSED' OR closing_note IS NULL)`. | La nota de quien cierra solo existe en una caja cerrada. |
| `cash_session_notes` | **Crear** la tabla (modelo 2.12) con FK a `cash_sessions` y a `users`, índices en `cash_session_id` **y `user_id`** (toda FK lleva índice, modelo 1.6), `CHECK (btrim(note) <> '')`. | Notas de cierre (PA-30, CAJ-08). Que la caja esté cerrada lo controla el backend (un `CHECK` no mira otra tabla). |
| `cash_movements` | **Agregar** `CHECK (sale_id IS NULL OR reason = 'SALE_VOID_REFUND')` y `CHECK (supplier_account_entry_id IS NULL OR reason = 'SUPPLIER_PAYMENT')`. | Una venta o un movimiento de cuenta corriente solo se vinculan a su motivo. |
| `cash_movements` | **Agregar** `CHECK (btrim(description) <> '')`. | CAJ-06: descripción obligatoria. |
| `cash_movements` | **Agregar** índice único parcial `cash_movements_one_refund_per_sale ON cash_movements (sale_id) WHERE reason = 'SALE_VOID_REFUND'`. | Segunda barrera contra devolver dos veces la misma venta (la primera es el `FOR UPDATE` de la anulación). Parcial y en SQL, para no cambiar la relación de Prisma que usa el código de ventas. |

No hace falta migrar datos: todavía no hay cajas reales cerradas. Los tests que cierran cajas "a mano" en la base tienen que cumplir el `CHECK` nuevo de `difference`.

## 17. Frenar y preguntar (etapa 4) — pendientes del dueño

No están definidos en `requisitos.md` ni en `relevamiento.md`. Cada uno tiene opciones y la recomendación del arquitecto; **decide el dueño**. La columna "Mientras tanto" dice cómo está escrito este contrato (es la recomendación); si el dueño elige otra opción, se cambia el punto indicado. También están en `requisitos.md` 7.8.

| H | Pregunta | Opciones | Recomendación | Mientras tanto (dónde) |
|---|---|---|---|---|
| H-45 | **Diferencia grande al cerrar:** ¿sin límite o se pide confirmación? | a) Sin límite: se guarda y solo se informa (CAJ-05). La pantalla pide confirmar el **monto escrito** ("¿Contaste $ 7.400?") a todos, sin mirar el esperado. b) Si la diferencia pasa de $X, el servidor no cierra y pide "volvé a contar" (sin decir cuánto). c) Como b), pero solo cuando cierra un encargado o el dueño. | a). Con b), probando montos el empleado adivina el esperado (deja de ser a ciegas); c) agrega una regla para quien ya puede ver el detalle. | a) (10.1, 15) |
| H-46 | **¿Qué ve el empleado después de cerrar?** | a) "Caja cerrada" y lo que él contó, sin decir si hubo diferencia. b) Además "con diferencia / sin diferencia", sin el monto. c) El monto de la diferencia. | a). b) y c) contradicen CAJ-05 y H-40 (la diferencia solo la ven encargado y dueño). | a) (10.3) |
| H-47 | **¿Movimientos sin caja abierta?** (por ejemplo, un gasto pagado con el kiosco cerrado) | a) No: primero se abre una caja (`422`), igual que para anular (H-03). b) Sí, sin caja: no entran en ningún arqueo (cambia el modelo). c) Se cargan en la última caja cerrada (rompe "un cierre no se corrige"). | a). | a) (11) |
| H-48 | **¿La nota es obligatoria si hay diferencia?** | a) No; la lista muestra la diferencia y cuántas notas tiene cada caja. b) Sí, desde $X: la caja queda "pendiente de revisar" hasta que un encargado o el dueño agregue una nota (no puede frenar el cierre, porque es a ciegas). | a). b) agrega un estado nuevo y un monto a definir. | a) (5, 12) |
| H-49 | **Caja abierta de un día anterior al arrancar:** ¿solo aviso o se bloquea vender? | a) Solo aviso a todos; se sigue vendiendo en esa caja hasta que alguien la cierre. b) Aviso y no se vende hasta cerrarla. c) Como b), y cualquier usuario puede cerrar una caja vieja (cambia H-04). | a): es lo que dice NF-18 ("avisa para cerrarla normalmente"). Con b), si la abrió otro empleado y no hay encargado, el kiosco no puede vender (H-04 b). | a) (14) |
| H-50 | **¿El contado puede ser $0?** | a) Sí (por ejemplo, después de un retiro del dueño). b) No, mínimo $1. | a), con la confirmación del monto de H-45. El modelo aprobado ya lo permite (`CHECK >= 0`). | a) (10.1) |
| H-51 | **Aporte de cambio al abrir:** ¿se registra aparte del efectivo inicial? Relacionado: si entre el cierre de un turno y la apertura del siguiente alguien saca plata, hoy no queda registrado en ninguna caja. | a) No: el efectivo inicial es todo lo que hay al abrir (incluye el cambio); los aportes durante el turno son movimientos "aporte de cambio". b) Al abrir se cargan aparte "efectivo inicial" y "aporte de cambio". c) a), y el detalle muestra a encargado y dueño, al lado del efectivo inicial, lo contado en el cierre anterior (solo informativo). | c): no cambia cómo se abre y deja ver si faltó plata entre turnos. | a) (sin cambios; c) agrega un campo al detalle) |
| H-52 | **¿Encargado y dueño ven el esperado de una caja ABIERTA** ("cómo va hasta ahora")? | a) Sí, en el detalle; el formulario de cierre igual no lo muestra (H-04: "contando a ciegas igual"). b) No: el esperado aparece recién al cerrar. | a): ya ven todas las partes de la cuenta (efectivo inicial, ventas, movimientos); ocultar la suma no protege nada y les sirve antes de un retiro. | a) (13) |
| H-53 | **¿Se permite una salida mayor que el efectivo que debería haber** (esperado negativo)? | a) Sí, como la devolución por anulación: no se controla y aparece en el arqueo. b) Se rechaza (`422`) si la salida supera el esperado actual. | a): el sistema no sabe cuánto hay contado de verdad, y la devolución por anulación ya puede dejarlo negativo. | a) (11) |

**Ya definidos por documentos aprobados** (no se preguntan):
- **Quién cierra:** quien abrió, un encargado o el dueño, contando a ciegas igual (H-04 b). Un empleado no cierra la caja de otro.
- **Desde afuera:** no se cierra ni se registran movimientos (CAJ-09); **sí** se agregan notas (ADR 003 punto 6, etapa 1).
- **Notas:** solo se agregan, solo encargado y dueño, a un cierre hecho (CAJ-08, PA-30). La nota de quien cierra (`closingNote`) ya estaba en el modelo aprobado (2.11).
- **Los movimientos a mano** los registran solo encargado y dueño, con motivo y descripción (CAJ-06, PA-29); los motivos y sus sentidos están en el `CHECK` aprobado (modelo 2.13).
- **Las cajas cerradas no se modifican** (D9) y la devolución de una venta de otro turno sale de la caja abierta (PA-17).
- **Carrito sin cobrar:** no se cierra desde la pantalla que lo tiene (regla 8 de ventas); lo controla la pantalla (10.2).

## 18. Decisiones técnicas del backend (etapa 4)

Huecos técnicos del contrato que se resolvieron al implementar (no son de negocio):

- **Lo contado en el cierre anterior (H-51 c):** el contrato no le puso nombre. Se agregó `previousClosing: { cashSessionId, shift, businessDate, closedAt, countedCash } | null` a `GET /current` y a `CashSessionDetail`. Solo para OWNER y MANAGER: en `/current` del EMPLOYEE la clave no viene. "Anterior" = la última caja cerrada que se abrió antes de la abierta (en `/current` sin caja abierta, la última cerrada).
- **Diferencia de apertura (decisión del dueño, 2026-11-26):** el sistema marca la apertura cuyo efectivo inicial no coincide con lo contado en el cierre anterior; la ven encargado y dueño (detalle y lista, `openingVsPreviousClose`), el empleado no. Se **guarda al abrir** (`cash_sessions.previous_cash_session_id` y `opening_difference`, `numeric(18,2)`) y no se calcula al vuelo, para poder filtrar y paginar en la base (`hasOpeningDifference`); es una foto fija, como el esperado. La apertura se audita con la diferencia si es distinta de 0.
- **Orden de bloqueo en el cierre:** el cierre toma solo la fila de la caja (`FOR UPDATE`), antes de leer nada más. Venta, anulación y movimiento la leen con `FOR SHARE`; ninguno espera algo que tenga el cierre, así que no hay ciclos. Los que llegan después del cierre ven la caja cerrada (`422 CASH_SESSION_REQUIRED`).
- **Orden de los controles del cierre:** `404`, luego `403` (empleado con caja ajena), luego `409`. Un empleado que reintenta cerrar la suya recibe el `409` con `details.closedBy`.
- **Notas:** se lee la caja con `FOR SHARE` (una caja cerrada nunca se reabre).
- **Aviso al arrancar (NF-18):** `warnStaleCashSessions` (log `warn` por cada caja abierta de un día anterior), llamado desde `server.ts`.
