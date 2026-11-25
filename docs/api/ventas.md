# API — Ventas, anulaciones y medios de pago

> Etapa 3, tarea 1. Requisitos: VEN-01 a VEN-15, CFG-01, CFG-04, CAJ-02, NF-06, NF-11, NF-12, NF-17; reglas 1 a 8 de ventas (`requisitos.md` 4.1); PA-02, PA-10, PA-12, PA-14 a PA-18, PA-20; H-02, H-03, H-06, H-09, H-10, H-11, H-13 (todas aprobadas).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero, redondeos, recargo, día de trabajo) y ADR 003 (puertas, `requireLocal`).
> Modelo: `PaymentMethod`, `Sale`, `SaleItem`, `SalePayment`, `StockMovement`, `CashMovement` (`docs/modelo-datos.md` 2.3, 2.8, 2.13 a 2.16 y sección 4). Cambios al modelo de esta etapa: sección 13.
> Caja (abrir, ver la abierta, listar): `docs/api/caja.md`.
> **H-33 a H-44 resueltos por el dueño (2026-11-25)**, aceptando todas las recomendaciones (opción a en todas): sección 12, `requisitos.md` 7.7 y `relevamiento.md` "Etapa 3". Ya están en este contrato.

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles |
|---|---|:---:|---|
| `GET /api/payment-methods` | Medios de pago con su recargo y orden | `any` | Todos |
| `PATCH /api/payment-methods/:id` | Recargo (solo crédito), activar/desactivar, orden | `any` | OWNER |
| `GET /api/products/search` | **Búsqueda del mostrador** (la de la etapa 2, sin cambios) | `any` | Todos |
| `GET /api/products/miscellaneous` | El producto "Varios" (acceso directo del mostrador) | `any` | Todos |
| `POST /api/sales` | **Cobrar** una venta | **`local`** | Todos (descuento: OWNER, MANAGER) |
| `GET /api/sales` | Listar ventas (por día de trabajo, caja, estado, vendedor) | `any` | OWNER, MANAGER |
| `GET /api/sales/:id` | Ver una venta | `any` | OWNER, MANAGER |
| `POST /api/sales/:id/void` | **Anular** una venta | **`local`** | OWNER, MANAGER |

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **Orden de registro en Express:** `/api/products/miscellaneous` y `/api/products/search` **antes** que `/api/products/:id`.
- **Rol antes que puerta** (ADR 003): un empleado que anula desde cualquier puerta recibe `403 FORBIDDEN`; un encargado que anula desde la remota, `403 LOCAL_ONLY` (auditado como `ACCESS_DENIED`).
- Ver ventas desde afuera **sí** se puede (es como un reporte, ADR 003 punto 6); cobrar y anular, no (VEN-15, H-02).

## 2. Decisiones técnicas del cobro

### 2.1 El servidor recalcula todo; la pantalla usa la misma función

- La pantalla manda **qué** se vende (producto + cantidad), el descuento pedido y **cómo** se paga. **Nunca** manda precios (salvo el de "Varios"), costos, subtotales, recargos ni totales: esos campos no existen en el request (→ `400`, esquemas estrictos).
- El servidor lee precios, costos, IVA y recargos **de la base**, dentro de la transacción, y calcula todo con **una sola función de `shared`**: `calculateSale` (sección 4.4). La pantalla usa **la misma** función para mostrar el total mientras se arma la venta (ADR 002 punto 1.4). Así lo que ve el cajero y lo que guarda el servidor salen de la misma cuenta.

### 2.2 Montos de los pagos: se mandan **sin** recargo (H-13)

**Decisión:** en cada pago, `amount` es **la parte del total con descuento que cubre ese medio, sin recargo**. Es exactamente `SalePayment.amount` del modelo (2.16). El monto **con** recargo (lo que se tipea en el posnet) lo calcula el servidor y lo devuelve como **`chargedAmount`**.

Ejemplo 2 de la regla 3: la pantalla manda efectivo `"4500"` y crédito `"4500"`; el servidor devuelve para el crédito `chargedAmount: "5000.00"`, que es lo que el cajero cobra en el posnet (H-13).

| | Mandar **sin** recargo (elegida) | Mandar **con** recargo (lo del posnet) |
|---|---|---|
| Control de la suma | Exacto y simple: `Σ amount = subtotal − descuento` (regla 2). | Hay que "desarmar" el recargo de cada pago para poder sumar. |
| Montos imposibles | **No existen**: cualquier `amount` entero da un recargo bien definido. | **Existen**: con el redondeo al peso, el monto con recargo salta de a $1 o $2, así que hay montos de posnet que ninguna venta puede dar (por ejemplo, sin descuento y con 10 %: `amount` 1.004 da $1.104 en el posnet y 1.005 da $1.106; ninguna venta da $1.105). La pantalla podría mandar uno y el servidor tendría que rechazarlo o "corregirlo". |
| Doble recargo | Imposible: el recargo lo suma solo el servidor. | Posible si alguna pantalla manda un monto que ya lo incluye y el servidor lo vuelve a aplicar. |
| Lo que tipea el cajero en el posnet | Lo muestra la pantalla con `calculateSale` (`chargedAmount`) antes de cobrar, y el servidor lo confirma en la respuesta. | Lo tipea el cajero; un error de tipeo pasa a la venta. |

**Contra:** si el cliente dice "pongo $5.000 con la tarjeta", la pantalla tiene que traducirlo a `amount` (la parte sin recargo). Es solo de la pantalla: ofrece el campo "monto en el posnet" y lo convierte con `creditAmountFromCharged` de `shared` (sección 4.4), que devuelve el `amount` cuyo `chargedAmount` es el más cercano; si no da exacto, muestra el monto real del posnet antes de cobrar.

### 2.3 `expectedTotal`: lo que se cobra es lo que el cajero vio

El request lleva **`expectedTotal`**: el total **con recargo** que la pantalla mostró (y con el que el cajero ya pudo haber pasado la tarjeta). El servidor **no lo usa para calcular**: solo lo **compara** con su propio total. Si no coinciden (cambió un precio, el % de recargo o un producto mientras el carrito estaba armado) → `409 SALE_TOTAL_CHANGED`, **no se guarda nada**, y `details` trae el desglose recalculado para que la pantalla actualice el carrito y el cajero confirme de nuevo (**H-33 a**).

**Por qué:** sin este control, el servidor podría guardar $5.500 con crédito mientras en el posnet se cobraron $5.000, y la diferencia aparecería recién en el arqueo. **Contra:** un clic más en el caso raro de que un precio cambie con el carrito armado.

### 2.4 `clientRequestId`: un doble clic no crea dos ventas

- La pantalla genera un **UUID v4** por carrito (`newClientRequestId()` de `shared`) y lo manda en el cuerpo del cobro.
  - **Se mantiene** mientras no llegue una respuesta `200`/`201`: si el pedido da error de red, se corta el WiFi o vence el tiempo de espera, el reintento lleva **el mismo** id.
  - **Se genera uno nuevo** solo después de un cobro exitoso (o al vaciar el carrito sin cobrar).
  - **Ojo:** `crypto.randomUUID()` del navegador **no existe** en páginas HTTP que no sean `localhost` (las tablets entran por `http://192.168.x.x`, ADR 003). `newClientRequestId()` arma el UUID v4 con `crypto.getRandomValues()`, que sí está disponible.
- El servidor guarda el id en `Sale.clientRequestId` (**único**) y una huella del pedido en `Sale.requestHash` (SHA-256 del cuerpo ya validado por Zod, serializado con las claves en el orden del esquema; nunca se devuelve).
- **Qué pasa si se repite:**

| Situación | Respuesta |
|---|---|
| Mismo id, mismo usuario, mismo cuerpo (doble clic, reintento) | **`200`** con la **misma venta** y `isReplay: true`. No se crea nada, no se mueve stock ni se audita de nuevo. Funciona aunque la caja ya se haya cerrado o la venta se haya anulado (se devuelve como está). |
| Mismo id con otro cuerpo u otro usuario | **`409 SALE_REQUEST_ID_REUSED`**, `details: { "saleId": 1024, "createdAt": "..." }`. Caso típico: se cortó la red, la venta **sí** se guardó, y el cajero agregó algo y volvió a cobrar. La pantalla avisa "Esa venta ya se había cobrado (venta #1024)". |
| Dos pedidos con el mismo id **a la vez** | El índice único hace esperar al segundo; cuando el primero termina, el segundo choca (`P2002`), deshace su transacción y responde como el primer caso (`200`, `isReplay: true`). Nunca hay dos ventas ni stock descontado dos veces. |

- **Pros:** cero tablas nuevas (dos columnas en `Sale`); a prueba de doble clic, reintentos y carreras; protege del caso "se cobró pero no me enteré". **Contra:** la pantalla tiene que cuidar cuándo renovar el id (regla de arriba). Se eligió el cuerpo y no el encabezado `Idempotency-Key` que mencionaba el README 7: así se valida con el mismo esquema Zod que el resto del pedido.

### 2.5 Vuelto (VEN-12)

- El vuelto **no se guarda** (VEN-12). La pantalla puede mandar **`cashTendered`** (lo que entregó el cliente en efectivo); el servidor controla que haya un pago en efectivo y que alcance, y devuelve `change = cashTendered − Σ amount en efectivo`.
- El `amount` en efectivo es **lo que queda en la caja** (la parte de la venta), nunca lo entregado: así el arqueo de la etapa 4 suma bien. Ningún medio puede pasarse del total: la suma de `amount` tiene que dar **exacto** (regla 2). **H-37 a:** un QR o una transferencia nunca exceden; si el cliente transfirió de más, se le devuelve por el mismo medio, fuera del sistema. **H-36 a:** `cashTendered` se acepta también en un pago mixto (por ejemplo, tarjeta + billetes con vuelto); el vuelto sale solo de la parte en efectivo.
- En un reintento (`isReplay`), `change` sale del `cashTendered` del pedido (que es el mismo, porque la huella coincide).

### 2.6 Stock y "Varios"

- El stock se descuenta en la misma transacción y **puede quedar negativo** (VEN-09, R2): no es un error. La respuesta trae **`stockWarnings`** con cada producto que quedó por debajo de 0. Se arma desde `StockMovement.stockAfter` guardado, así un reintento devuelve el mismo aviso. El aviso **antes** de cobrar lo da la pantalla con el `stockQuantity` de la búsqueda.
- **"Varios"** (PA-10, H-09) no mueve stock ni genera `StockMovement`; lleva el precio y la descripción que escribe el cajero, costo 0 y el IVA del producto "Varios" (H-32).

## 3. Visibilidad por rol

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Cobrar y ver la venta que acaba de cobrar (respuesta del `POST`) | ✅ `Sale` | ✅ `Sale` | ✅ `Sale` | VEN-13. **El mostrador nunca recibe costos**, ni el dueño (igual que la búsqueda, `productos-stock.md` 2.1). |
| Aplicar descuento | ❌ `403` | ✅ | ✅ | VEN-08, PA-16 |
| Lista y detalle de ventas | ❌ `403` | ✅ `Sale` | ✅ `SaleWithCost` | Matriz: "ver reportes de ventas"; **H-40 a** |
| Costos de la venta (`unitNetCost`, `unitCost`) y ganancia (`lineProfit`, `grossProfit`) | ❌ | ❌ | ✅ | Matriz: costos y ganancia solo dueño; PA-03 (el encargado ve costos solo en compras y precios) |
| Anular | ❌ `403` | ✅ | ✅ | VEN-11 |
| Medios de pago: ver | ✅ | ✅ | ✅ | Hacen falta para cobrar |
| Medios de pago: configurar | ❌ `403` | ❌ `403` | ✅ | CFG-01, CFG-04 (configuración: solo dueño) |

**Cómo se cumple H-40 a ("el empleado ve solo la venta que acaba de cobrar"):** **solo con la respuesta del `POST /api/sales`**; no hay ningún `GET` de ventas para el empleado (`GET /api/sales` y `GET /api/sales/:id` → `403`). Si la respuesta se pierde (se cortó el WiFi), la pantalla reintenta el `POST` con el **mismo** `clientRequestId` y recibe la misma venta (`200`, `isReplay: true`, 2.4): así nunca necesita "ir a buscarla". El `409 SALE_REQUEST_ID_REUSED` solo trae `saleId` y `createdAt` (ni importes ni pagos). De la caja, el empleado tampoco ve el efectivo inicial (`caja.md` 2.1). Un `GET` limitado ("mi última venta") se descartó: sería una ruta más para cuidar y permitiría recorrer ventas cambiando el id.

Cómo se garantiza (igual que la etapa 2, `productos-stock.md` 2.3): una función por recurso arma la respuesta según rol y ruta (`toSaleResponse(sale, role, 'pos' | 'backoffice')`); antes de responder pasa por `.parse()` del esquema del rol (respuesta no estricta: descarta claves de más). **Test obligatorio (qa):** con sesión de empleado y de encargado, ninguna respuesta de este documento contiene `unitNetCost`, `unitCost`, `lineProfit`, `grossProfit` (búsqueda recursiva), y la del `POST /api/sales` tampoco para el dueño.

## 4. Esquemas (van a Zod en `@kiosco/shared`, carpeta `sales/`)

Requests **estrictos** (campo desconocido → `400`); respuestas sin `strict` (README 3, `productos-stock.md` 2.3). `Money`, `Quantity`, `SignedQuantity` y `Percent` como en `productos-stock.md` 3.2.

### 4.1 Campos

| Esquema | Tipo y reglas |
|---|---|
| `PaymentMethodKindSchema` | `"CASH"` \| `"DEBIT_CARD"` \| `"CREDIT_CARD"` \| `"QR"` \| `"TRANSFER"` |
| `SaleStatusSchema` | `"COMPLETED"` \| `"VOIDED"` |
| `ClientRequestIdSchema` | string UUID (`z.uuid()`), se guarda en minúsculas. |
| `WholePesosInputSchema` | string `^\d{1,12}(\.0{1,2})?$` y **> 0**: pesos enteros (`"4500"`, `"4500.00"`; no `"4500.50"`). Lo cobrado es en pesos enteros (PA-20). |
| `PositiveQuantityInputSchema` | `QuantityInputSchema` y **> 0** (CHECK `quantity > 0` del modelo; no hay devoluciones parciales, R1). |
| `PositiveMoneyInputSchema` | `MoneyInputSchema` y **> 0**. |
| `SaleDiscountInputSchema` | unión por `type`: `{ type: "AMOUNT", value: PositiveMoney, reason?: string \| null }` \| `{ type: "PERCENT", value: Percent (> 0), reason?: string \| null }`. `reason`: `trim`, hasta 200 caracteres; `""` = sin motivo (PA-15: motivo opcional). |
| `VoidReasonSchema` | string con `trim`, 1 a 200 caracteres (VEN-11: motivo obligatorio). |

### 4.2 Requests

```ts
CreateSaleRequestSchema = {
  clientRequestId: ClientRequestId;           // 2.4
  items: SaleLineInput[];                     // 1 a 200 líneas
  discount?: SaleDiscountInput | null;        // solo OWNER y MANAGER (403 si lo manda un empleado)
  payments: SalePaymentInput[];               // 1 a 10 pagos (se puede repetir un medio, H-39 a)
  cashTendered?: Money | null;                // efectivo entregado, para el vuelto (2.5)
  expectedTotal: WholePesos;                  // total con recargo que mostró la pantalla (2.3)
}
SaleLineInput = {
  productId: number;                          // entero positivo
  quantity: PositiveQuantity;                 // UNIT: entera; KG: hasta 3 decimales (VEN-04)
  unitPrice?: PositiveMoney;                  // SOLO "Varios" (obligatorio ahí); en otro producto → 422
  customDescription?: string | null;          // SOLO "Varios", opcional (H-09): trim, hasta 120
}
SalePaymentInput = {
  paymentMethodId: number;
  amount: WholePesos;                         // SIN recargo (2.2)
}

VoidSaleRequestSchema = { reason: VoidReason }

SaleListQuerySchema = {
  page?; pageSize?;                           // README 5
  from?: string; to?: string;                 // YYYY-MM-DD, DÍA DE TRABAJO, ambos incluidos; from > to → 400
  cashSessionId?: number;
  status?: SaleStatus;
  userId?: number;                            // quién vendió
  sortOrder?: 'asc' | 'desc';                 // por createdAt; default 'desc' (la más nueva primero)
}

UpdatePaymentMethodRequestSchema = {          // al menos uno
  surchargePercent?: Percent;                 // 0 a 100 (tope técnico contra errores de tipeo)
  isActive?: boolean;
  sortOrder?: number;                         // entero 0 a 999
}
```

### 4.3 Respuestas

```ts
PaymentMethodSchema = {
  id; kind: PaymentMethodKind; name: string;
  surchargePercent: Percent;                  // "10.00" en crédito; "0.00" en el resto
  isActive: boolean; sortOrder: number; updatedAt: string;
}
PaymentMethodListResponseSchema = { items: PaymentMethod[] }   // sin paginar; orden sortOrder, id

SaleItemSchema = {
  id; productId; productName: string;         // nombre AL VENDER
  customDescription: string | null;           // solo "Varios"
  isMiscellaneous: boolean;
  saleUnit: SaleUnit;
  quantity: Quantity;
  unitPrice: Money;                           // congelado al vender
  vatRatePercent: Percent;                    // congelado al vender
  lineSubtotal: Money;                        // R-2(cantidad × precio), pesos enteros
  discountAmount: Money;                      // parte del descuento de la venta (D6), a centavos
  lineTotal: Money;                           // lineSubtotal − discountAmount
  lineNetTotal: Money;                        // lineTotal sin IVA (no es un costo)
}
SaleItemWithCostSchema = SaleItem & {         // solo dueño
  unitNetCost: Money; unitCost: Money;        // congelados al vender (0 en "Varios")
  lineProfit: Money | null;                   // lineNetTotal − cantidad × unitNetCost (R-1); null en "Varios" (H-09)
}

SalePaymentSchema = {
  id; paymentMethod: { id; kind: PaymentMethodKind; name: string };
  amount: Money;                              // parte de la venta, sin recargo (pesos enteros)
  surchargeBase: Money;                       // lo que valía esa parte antes del descuento (a centavos)
  surchargePercent: Percent;                  // congelado al vender
  surchargeAmount: Money;                     // pesos enteros
  chargedAmount: Money;                       // amount + surchargeAmount: LO QUE SE COBRA con ese medio (posnet, H-13)
}

SaleSchema = {
  id: number;                                 // también es el número de venta
  status: SaleStatus;
  businessDate: string;                       // día de trabajo (ADR 002 punto 7)
  createdAt: string;
  cashSession: { id; shift: Shift; businessDate: string };
  user: { id; fullName };                     // quién vendió
  subtotal: Money;
  discountAmount: Money;                      // "0.00" si no hubo
  discountPercent: Percent | null;            // si el descuento se pidió en %
  discountReason: string | null;
  amountDue: Money;                           // subtotal − descuento = Σ payments.amount
  surchargeAmount: Money;
  total: Money;                               // amountDue + surchargeAmount = lo cobrado
  items: SaleItem[];
  payments: SalePayment[];
  voidedAt: string | null; voidedBy: { id; fullName } | null; voidReason: string | null;
  voidRefund: { cashMovementId: number; cashSessionId: number; amount: Money } | null;
}
SaleWithCostSchema = Sale & {                 // solo dueño, solo en GET /api/sales/:id y en la anulación
  items: SaleItemWithCost[];
  grossProfit: Money;                         // Σ lineProfit sin "Varios"; sin recargo (PA-31)
}

StockWarningSchema = { productId; productName: string; saleUnit: SaleUnit; stockAfter: SignedQuantity }

CreateSaleResponseSchema = {
  sale: Sale;                                 // siempre SIN costos (mostrador)
  isReplay: boolean;                          // true = era un reintento (2.4)
  change: Money | null;                       // vuelto, si vino cashTendered (2.5)
  stockWarnings: StockWarning[];              // productos que quedaron con stock negativo (2.6)
}

VoidSaleResponseSchema = {
  sale: Sale | SaleWithCost;                  // ya anulada
  cashRefund: { cashMovementId; cashSessionId; amount: Money } | null;   // efectivo que sale de la caja abierta
  otherRefunds: { paymentMethod: { id; kind; name }; chargedAmount: Money }[];  // a devolver por fuera (posnet, MP)
}

SaleListItemSchema = {
  id; status; businessDate; createdAt;
  cashSession: { id; shift };
  user: { id; fullName };
  itemCount: number;
  hasMiscellaneous: boolean;
  subtotal: Money; discountAmount: Money; surchargeAmount: Money; total: Money;
  payments: { kind: PaymentMethodKind; name: string; chargedAmount: Money }[];
  voidedAt: string | null;
}
```

### 4.4 Funciones de `shared` para la venta (el mismo cálculo en pantalla y servidor)

Usan las de ADR 002 punto 9 (`lineSubtotal`, `discountFromPercent`, `allocateDiscount`, `creditSurcharge`, `netFromFinal`, `roundToPeso`). Nombres propuestos; el que las escribe puede ajustarlos avisando.

| Función | Qué hace |
|---|---|
| `calculateSale({ lines, discount, payments })` | `lines: { quantity, unitPrice, vatRatePercent }[]`, `discount: { type, value } \| null`, `payments: { amount, surchargePercent }[]`. Devuelve `{ lines: { lineSubtotal, discountAmount, lineTotal, lineNetTotal }[], subtotal, discountAmount, discountPercent, amountDue, payments: { amount, surchargeBase, surchargePercent, surchargeAmount, chargedAmount }[], paidAmount, remaining, surchargeAmount, total }`. Con pagos incompletos también funciona (`remaining = amountDue − paidAmount`): la pantalla lo usa mientras se carga el cobro. Si falla una regla devuelve un error con **el mismo `code` que la API** (`LINE_TOTAL_ZERO`, `DISCOUNT_TOO_HIGH`, `DISCOUNT_ROUNDS_TO_ZERO`), así pantalla y servidor muestran el mismo mensaje. |
| `creditAmountFromCharged(charged, subtotal, discount, percent)` | Inversa para la pantalla (2.2): el `amount` entero cuyo `chargedAmount` es el más cercano a `charged`. |
| `cashChange(cashTendered, cashAmount)` | Vuelto. |
| `newClientRequestId()` | UUID v4 con `crypto.getRandomValues()` (2.4). |
| `getBusinessDate(instant, cutoffMinutes, timeZone)` | Ya definida en el ADR 002; **todavía no está en el código**: se escribe en esta etapa (la usan la venta y la apertura de caja). |

## 5. Medios de pago (`PaymentMethod`)

**Seed (base-datos), uno por `kind` (`UNIQUE(kind)`):**

| `kind` | `name` | `surchargePercent` | `sortOrder` |
|---|---|---:|---:|
| `CASH` | Efectivo | 0.00 | 1 |
| `DEBIT_CARD` | Débito | 0.00 | 2 |
| `CREDIT_CARD` | Crédito | **10.00** | 3 |
| `QR` | QR Mercado Pago | 0.00 | 4 |
| `TRANSFER` | Transferencia | 0.00 | 5 |

- **El "efectivo" es el de `kind = CASH`** (no el nombre ni el id): es el único que cuenta para el vuelto (2.5), para la devolución en efectivo al anular (sección 7) y, en la etapa 4, para el efectivo esperado del arqueo (CAJ-04).
- El 10 % es el valor aproximado del relevamiento (R1); el % exacto se le pide al cliente en la instalación (plan, etapa 8). El orden es una sugerencia: el dueño lo cambia.
- No hay alta ni baja de medios por la API: los cinco son fijos (VEN-06). Tampoco se cambia el nombre (ningún requisito lo pide; se agrega si hace falta).

### 5.1 `GET /api/payment-methods` — Listar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos (la pantalla de cobro necesita los activos y su recargo).
- **Response 200:** `PaymentMethodListResponseSchema`, **todos** (activos y no), orden `sortOrder` y después `id`. La pantalla de cobro muestra solo los activos; la de configuración, todos.
- **Errores:** `401`. **Auditoría:** no.

### 5.2 `PATCH /api/payment-methods/:id` — Configurar

- **Sesión:** sí. **Acceso:** `any` (configuración desde afuera ✅, ADR 003 punto 6). **Roles:** OWNER (CFG-01, CFG-04).
- **Request:** `UpdatePaymentMethodRequestSchema`.
- **Reglas:**
  - **Recargo solo en crédito** (VEN-07: "débito y los demás medios, sin recargo"; CFG-01: "los demás medios en 0 %"). `surchargePercent` distinto de 0 en otro medio → `422 SURCHARGE_NOT_ALLOWED`. (La columna existe en todos los medios, así que si algún día se pide recargo en otro medio no hace falta migrar.)
  - Cambiar el recargo **no cambia ventas viejas**: cada pago congela su % (regla 4 de ventas, D5). Un carrito armado con el % anterior recibe `409 SALE_TOTAL_CHANGED` al cobrar (2.3).
  - **Desactivar** (CFG-04): deja de aparecer al cobrar; un cobro con un medio desactivado → `422 PAYMENT_METHOD_INACTIVE`. Las ventas viejas lo siguen mostrando. **El efectivo (`kind = CASH`) no se desactiva** (H-38 a): `{ "isActive": false }` en ese medio → `422 CASH_METHOD_LOCKED` y no se guarda nada del pedido. Los otros cuatro sí.
  - **Orden** (CFG-04): `sortOrder` no es único; empates por `id`. Para intercambiar dos, la pantalla manda dos `PATCH`.
- **Response 200:** `PaymentMethodSchema`.
- **Errores:** `400`, `403 FORBIDDEN`, `404 NOT_FOUND`, `422 SURCHARGE_NOT_ALLOWED`, `422 CASH_METHOD_LOCKED`.
- **Auditoría:** `PAYMENT_METHOD_UPDATE`, `entityType` `PaymentMethod`, `details: { kind, before, after }` solo con lo que cambió (NF-08: cambios de configuración). Si no cambió nada: `200` sin auditar.

## 6. `POST /api/sales` — Cobrar una venta

- **Sesión:** sí. **Acceso:** **`local`** (VEN-15, ADR 003): desde la remota → `403 LOCAL_ONLY` + `ACCESS_DENIED`. **Roles:** todos (VEN-13); `discount` solo OWNER y MANAGER.
- **Request:** `CreateSaleRequestSchema`.

### 6.1 Qué hace, en este orden

Todo en **una transacción** (NF-11): si algo falla, no queda nada (ni venta, ni stock, ni pagos).

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod. | `400 VALIDATION_ERROR` |
| 2 | Si viene `discount` y el usuario es EMPLOYEE. | `403 FORBIDDEN`, `details: { "fields": ["discount"] }` (como 2.4 de `productos-stock.md`) |
| 3 | **Reintento:** buscar una venta con ese `clientRequestId` (2.4). | `200` reintento, o `409 SALE_REQUEST_ID_REUSED` |
| 4 | Caja abierta, con `FOR SHARE` (`caja.md` 6). | `422 CASH_SESSION_REQUIRED` |
| 5 | Leer los productos de las líneas (una consulta). Que existan y estén activos. | `422 PRODUCT_NOT_FOUND` / `422 PRODUCT_INACTIVE` (H-34 a: no se vende; la pantalla marca la línea para sacarla), con `details: { "items": [ { "index": 2, "productId": 31 } ] }` |
| 6 | Por línea: producto `UNIT` con cantidad entera (excepción 400 de `productos-stock.md` 3.1); "Varios" con `unitPrice`; `unitPrice` o `customDescription` en un producto que no es "Varios". | `400` con `path: items.N.quantity`; `422 MISC_PRICE_REQUIRED`; `422 LINE_FIELD_NOT_ALLOWED` (`details.fields` con `items.N.unitPrice`) |
| 7 | Leer los medios de pago. Que existan y estén activos. | `422 PAYMENT_METHOD_NOT_FOUND` / `422 PAYMENT_METHOD_INACTIVE` (`details.payments` con los índices) |
| 8 | `calculateSale` con precios, IVA y recargos **de la base** (`unitPrice` de la pantalla solo en "Varios"). | `422 LINE_TOTAL_ZERO` (H-35 a), `422 DISCOUNT_TOO_HIGH` (H-10 b: el descuento tiene que ser **menor** que el subtotal; incluye el 100 %), `422 DISCOUNT_ROUNDS_TO_ZERO`, `422 SALE_AMOUNT_OUT_OF_RANGE` (no entra en `numeric(14,2)`) |
| 9 | Comparar `total` con `expectedTotal` (2.3). | `409 SALE_TOTAL_CHANGED` (desglose en `details`, 6.3) |
| 10 | `Σ amount = amountDue` (regla 2). | `422 PAYMENTS_TOTAL_MISMATCH`, `details: { "amountDue": "9000.00", "paidAmount": "8500.00" }` |
| 11 | `cashTendered`: tiene que haber al menos un pago `CASH` y alcanzar para la parte en efectivo. | `422 CASH_TENDERED_WITHOUT_CASH` / `422 CASH_TENDERED_TOO_LOW` |
| 12 | Crear `Sale` (`businessDate = getBusinessDate(ahora, corte, TZ)`, `clientRequestId`, `requestHash`), `SaleItem` (congelando nombre, precio, costo neto, costo final e IVA, D5) y `SalePayment` (congelando el %). | Choque de `clientRequestId` (`P2002`) → deshacer y responder como el paso 3 |
| 13 | Stock, por línea que **no** es "Varios", **en orden de `productId`** (evita bloqueos cruzados entre dos ventas): `UPDATE products SET stock_quantity = stock_quantity − q ... RETURNING stock_quantity` (como el ajuste de la etapa 2) y `StockMovement` `SALE` con `quantity` negativa, `stockAfter`, `unitNetCost` y `saleItemId`. Puede quedar negativo. | `422 STOCK_OUT_OF_RANGE` (el resultado no entra en la columna) |
| 14 | Si hubo descuento: auditar `DISCOUNT_APPLIED`. | — |

- El paso 9 va **antes** que el 10 a propósito: si cambió un precio, la suma de los pagos tampoco da, y el error útil es "cambió el total" (con el desglose nuevo), no "los pagos no suman". Si el total coincide pero la suma no, es un error de la pantalla.
- **No se bloquean las filas de productos para leer el precio:** se usa el precio vigente al momento de cobrar (la "foto" de la regla 4). El stock se actualiza con una sentencia atómica, así dos ventas del mismo producto a la vez nunca se pisan.
- Todas las cuentas con la clase `Decimal` de `shared`; nunca `number` (ADR 002).

### 6.2 Respuesta

- **`201`** (venta nueva) o **`200`** (reintento): `CreateSaleResponseSchema`. La pantalla trata los dos como éxito, renueva el `clientRequestId`, vacía el carrito, muestra el vuelto, el monto del posnet de cada pago (`chargedAmount`) y los avisos de stock.

### 6.3 Errores

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; campo desconocido (`unitCost`, `total`, `surchargeAmount`…); `amount` con centavos; cantidad 0; decimales en un producto `UNIT`; más de 200 líneas o 10 pagos. | `fields` (README 4) |
| `403` | `FORBIDDEN` | Empleado con descuento. | `{ "fields": ["discount"] }` |
| `403` | `LOCAL_ONLY` | Puerta remota. | — |
| `409` | `SALE_REQUEST_ID_REUSED` | 2.4. | `{ saleId, createdAt }` |
| `409` | `SALE_TOTAL_CHANGED` | El total del servidor no es `expectedTotal`. | `{ expectedTotal, total, subtotal, discountAmount, items: [{ index, productId, unitPrice, lineSubtotal }], payments: [{ index, paymentMethodId, surchargePercent, surchargeAmount, chargedAmount }] }` |
| `422` | `CASH_SESSION_REQUIRED` | No hay caja abierta (VEN-13, regla 8). | — |
| `422` | `PRODUCT_NOT_FOUND` / `PRODUCT_INACTIVE` | Paso 5. | `{ items: [{ index, productId }] }` |
| `422` | `MISC_PRICE_REQUIRED` | "Varios" sin `unitPrice`. | `{ fields: [{ path, message }] }` |
| `422` | `LINE_FIELD_NOT_ALLOWED` | `unitPrice` o `customDescription` en un producto común. **El precio que manda la pantalla nunca se usa** (plan: "precio mandado por la pantalla ignorado"): se rechaza para que el error se note. | `{ fields: [{ path, message }] }` |
| `422` | `LINE_TOTAL_ZERO` | Una línea da $0 (precio 0, "Varios" a $0 o un peso tan chico que redondea a $0). H-35 a. | `{ items: [{ index }] }` |
| `422` | `DISCOUNT_TOO_HIGH` | Descuento ≥ subtotal (H-10 b). | `{ subtotal, discountAmount }` |
| `422` | `DISCOUNT_ROUNDS_TO_ZERO` | El descuento en % redondea a $0. | — |
| `422` | `PAYMENT_METHOD_NOT_FOUND` / `PAYMENT_METHOD_INACTIVE` | Paso 7. | `{ payments: [{ index, paymentMethodId }] }` |
| `422` | `PAYMENTS_TOTAL_MISMATCH` | `Σ amount ≠ amountDue` (regla 2). | `{ amountDue, paidAmount }` |
| `422` | `CASH_TENDERED_WITHOUT_CASH` / `CASH_TENDERED_TOO_LOW` | Paso 11. | `{ cashAmount }` |
| `422` | `SALE_AMOUNT_OUT_OF_RANGE` / `STOCK_OUT_OF_RANGE` | Importes o stock que no entran en las columnas. | — |

### 6.4 Auditoría

- La venta **es** el registro (VEN-10: fecha y hora, usuario, caja, productos, cantidades, precios, descuento, recargo y medios); no se duplica en `AuditLog`.
- **Con descuento:** `DISCOUNT_APPLIED`, `entityType` `Sale`, `entityId` = id, `details: { subtotal, discountType, discountValue, discountAmount, reason }`, en la misma transacción.
- Rechazos `409`/`422`: solo al log del servidor. `403 LOCAL_ONLY`: `ACCESS_DENIED` (ADR 003 punto 8).

## 7. `POST /api/sales/:id/void` — Anular una venta

- **Sesión:** sí. **Acceso:** **`local`** (H-02 a): desde la remota → `403 LOCAL_ONLY` + `ACCESS_DENIED`. **Roles:** OWNER, MANAGER (VEN-11, matriz), desde su propia sesión (PA-16).
- **Request:** `VoidSaleRequestSchema` (motivo obligatorio, VEN-11).
- **Qué hace** (una transacción):
  1. Bloquea la venta (`SELECT ... FOR UPDATE`). Si ya está anulada → `409 SALE_ALREADY_VOIDED` (también si dos encargados anulan a la vez: el segundo espera y choca acá).
  2. **Caja abierta** (`FOR SHARE`, `caja.md` 6). Si no hay → `422 CASH_SESSION_REQUIRED` (H-03 a). Se pide **siempre**, también si la venta no tuvo efectivo (**H-41 a**).
  3. `Sale.status = VOIDED`, `voidedAt`, `voidedById`, `voidReason` (regla 6).
  4. **Stock:** por línea que no es "Varios", en orden de `productId`: suma la cantidad (`UPDATE ... RETURNING`) y crea `StockMovement` `SALE_VOID` (positivo). Vale también si el producto se desactivó después (H-31).
  5. **Efectivo:** si la venta tuvo pagos `CASH`, crea **un** `CashMovement` `OUT` / `SALE_VOID_REFUND` por `Σ chargedAmount` de esos pagos, con `saleId`, `description` = "Anulación de la venta #N", en la **caja abierta ahora** (PA-17). **La caja de la venta no cambia** si es otra (y si ya está cerrada, nunca se toca, D9).
  6. Los otros medios (débito, crédito, QR, transferencia) **no** generan movimiento: se devuelven por fuera (anulación en el posnet o en Mercado Pago). La respuesta los lista en `otherRefunds` para que el encargado sepa qué devolver.
  7. Audita.
- **Sin límite de antigüedad** (VEN-11, PA-17: "aunque sea de un turno ya cerrado"; **H-42 a**).
- El sistema **no controla** que haya efectivo suficiente en la caja para la devolución (no sabe cuánto hay contado; la diferencia aparece en el arqueo).
- **Response 200:** `VoidSaleResponseSchema` (`Sale` para MANAGER, `SaleWithCost` para OWNER).
- **Errores:** `400` (motivo vacío o muy largo), `403 FORBIDDEN` (empleado), `403 LOCAL_ONLY`, `404 NOT_FOUND`, `409 SALE_ALREADY_VOIDED`, `422 CASH_SESSION_REQUIRED`, `422 STOCK_OUT_OF_RANGE`.
- **Auditoría:** `SALE_VOID`, `entityType` `Sale`, `entityId` = id, `details: { reason, total, saleCashSessionId, cashRefund: { cashMovementId, cashSessionId, amount } | null, otherRefunds }`. Cubre también la salida de caja (NF-08 "salidas de caja"): no se escribe un `CASH_MOVEMENT_OUT` aparte.
- **Ejemplo** (paso 8 de "Cómo probarlo": la venta del ejemplo 2):

```json
{ "reason": "El cliente se arrepintió" }
```

```json
{
  "sale": { "id": 1024, "status": "VOIDED", "total": "9500.00", "...": "...",
            "voidedAt": "2026-11-26T14:20:00.000Z", "voidedBy": { "id": 4, "fullName": "Lucía Pérez" },
            "voidReason": "El cliente se arrepintió",
            "voidRefund": { "cashMovementId": 88, "cashSessionId": 7, "amount": "4500.00" } },
  "cashRefund": { "cashMovementId": 88, "cashSessionId": 7, "amount": "4500.00" },
  "otherRefunds": [ { "paymentMethod": { "id": 3, "kind": "CREDIT_CARD", "name": "Crédito" }, "chargedAmount": "5000.00" } ]
}
```

## 8. Listar y ver ventas

### 8.1 `GET /api/sales` — Listar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (EMPLOYEE → `403`, H-40 a).
- **Query:** `SaleListQuerySchema`. Paginada. Sin filtros = todas, la más nueva primero. La pantalla manda por defecto `from = to = currentBusinessDate` (`caja.md` 3).
- **Incluye anuladas** (con `status`), para poder anular y revisar; los **reportes** las excluyen (regla 1 de reportes, etapa 7).
- **Response 200:** `Paginated<SaleListItem>` (igual para los dos roles: no trae costos ni ganancia).
- **Rapidez:** índices `businessDate`, `cashSessionId`, `(userId, createdAt)` (modelo 2.14). Los medios de cada fila salen de una sola consulta agrupada (no una por venta).
- **Errores:** `400`, `403`. **Auditoría:** no.

### 8.2 `GET /api/sales/:id` — Ver una venta

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER.
- **Response 200:** `SaleWithCost` (OWNER) o `Sale` (MANAGER).
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.
- Ejemplo con costos: sección 10, ejemplo 5.

## 9. Búsqueda del mostrador

**Se reutiliza `GET /api/products/search` de la etapa 2 sin cambios** (`productos-stock.md` 6.1): un solo pedido resuelve código exacto (lector + Enter, VEN-01) o nombre (VEN-02), solo activos, siempre sin costo, con `stockQuantity` para el aviso de VEN-09 e `isInactiveBarcode` para decir "ese producto está desactivado". Cumple NF-12 (índice único del código; `ILIKE` sobre `f_unaccent(lower(name))`).

**Única ruta nueva: `GET /api/products/miscellaneous`**, para el atajo de teclado "Varios" (su nombre se puede cambiar, H-32, así que buscarlo por nombre no sirve).
- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos. **Response 200:** `ProductSaleItemSchema` del producto "Varios". **Errores:** `401`; `404` solo si el seed no lo creó. **Auditoría:** no.

Desde esta etapa, `StockMovementSchema.saleId` (`productos-stock.md` 3.2) deja de ser siempre `null`: en los movimientos `SALE` y `SALE_VOID` trae el id de la venta (por `saleItemId`).

## 10. Ejemplos numéricos

Recargo de crédito 10 %; IVA 21 % salvo que se diga otra cosa. Medios del seed: `1` Efectivo, `3` Crédito, `2` Débito. Todos son tests obligatorios de qa (unitarios con `calculateSale` e integración con `POST /api/sales`).

### Ejemplo 1 — Todo con crédito y descuento del 10 % → **$10.000** (regla 3, ej. 1)

Encargado. Líneas: producto A 1 × $6.000 (costo neto $3.500) y producto B 1 × $4.000 (costo neto $2.000).

| Concepto | Cálculo | Resultado |
|---|---|---:|
| Subtotal | 6.000 + 4.000 | 10.000 |
| Descuento 10 % | R-2(10.000 × 10 %) | 1.000 |
| Reparto del descuento | A: 1.000 × 6.000/10.000 = 600; B (última): 1.000 − 600 = 400 | 600 / 400 |
| `lineTotal` | A 5.400; B 3.600 | |
| `lineNetTotal` | A 5.400 ÷ 1,21 = 4.462,81; B 3.600 ÷ 1,21 = 2.975,21 | |
| Pago crédito `amount` | lo que manda la pantalla | **9.000** |
| `surchargeBase` | 9.000 × 10.000 ÷ 9.000 | 10.000,00 |
| Recargo | R-2(10.000 × 10 %) | 1.000 |
| `chargedAmount` (posnet) | 9.000 + 1.000 | **10.000** |
| `total` = `expectedTotal` | 9.000 + 1.000 | **10.000** |
| Ganancia (solo dueño, en `GET`) | A: 4.462,81 − 3.500 = 962,81; B: 2.975,21 − 2.000 = 975,21 | `grossProfit` 1.938,02 |

```json
{ "clientRequestId": "0b9f7c1e-2a44-4f0e-8d51-6c3a9e7b1f20",
  "items": [ { "productId": 31, "quantity": "1" }, { "productId": 44, "quantity": "1" } ],
  "discount": { "type": "PERCENT", "value": "10" },
  "payments": [ { "paymentMethodId": 3, "amount": "9000" } ],
  "expectedTotal": "10000" }
```

### Ejemplo 2 — Mixto: **$9.500**, con **$5.000** en el posnet (regla 3, ej. 2; "Cómo probarlo" paso 7)

Mismas líneas, descuento **$1.000** fijo; el cliente paga $4.500 en efectivo (entrega $5.000) y $4.500 con crédito.

| Pago | `amount` (pantalla) | `surchargeBase` | % | Recargo | `chargedAmount` |
|---|---:|---:|---:|---:|---:|
| Efectivo | 4.500 | 4.500 × 10.000 ÷ 9.000 = 5.000,00 | 0 | 0 | 4.500 |
| Crédito | 4.500 | 5.000,00 | 10 | 500 | **5.000** (posnet) |
| **Venta** | `amountDue` 9.000 | | | **500** | `total` **9.500** |

Vuelto: `cashTendered` 5.000 − 4.500 = **500**.

Request:

```json
{
  "clientRequestId": "3f6c1a52-8d0e-4b7a-9c35-2f1e6b0d9a41",
  "items": [ { "productId": 31, "quantity": "1" }, { "productId": 44, "quantity": "1" } ],
  "discount": { "type": "AMOUNT", "value": "1000", "reason": "Cliente habitual" },
  "payments": [ { "paymentMethodId": 1, "amount": "4500" }, { "paymentMethodId": 3, "amount": "4500" } ],
  "cashTendered": "5000",
  "expectedTotal": "9500"
}
```

Response `201`:

```json
{
  "sale": {
    "id": 1024, "status": "COMPLETED", "businessDate": "2026-11-26", "createdAt": "2026-11-26T13:45:02.120Z",
    "cashSession": { "id": 7, "shift": "MORNING", "businessDate": "2026-11-26" },
    "user": { "id": 4, "fullName": "Lucía Pérez" },
    "subtotal": "10000.00", "discountAmount": "1000.00", "discountPercent": null, "discountReason": "Cliente habitual",
    "amountDue": "9000.00", "surchargeAmount": "500.00", "total": "9500.00",
    "items": [
      { "id": 2101, "productId": 31, "productName": "Vino Malbec 750 ml", "customDescription": null, "isMiscellaneous": false,
        "saleUnit": "UNIT", "quantity": "1.000", "unitPrice": "6000.00", "vatRatePercent": "21.00",
        "lineSubtotal": "6000.00", "discountAmount": "600.00", "lineTotal": "5400.00", "lineNetTotal": "4462.81" },
      { "id": 2102, "productId": 44, "productName": "Fernet 450 ml", "customDescription": null, "isMiscellaneous": false,
        "saleUnit": "UNIT", "quantity": "1.000", "unitPrice": "4000.00", "vatRatePercent": "21.00",
        "lineSubtotal": "4000.00", "discountAmount": "400.00", "lineTotal": "3600.00", "lineNetTotal": "2975.21" }
    ],
    "payments": [
      { "id": 3301, "paymentMethod": { "id": 1, "kind": "CASH", "name": "Efectivo" },
        "amount": "4500.00", "surchargeBase": "5000.00", "surchargePercent": "0.00", "surchargeAmount": "0.00", "chargedAmount": "4500.00" },
      { "id": 3302, "paymentMethod": { "id": 3, "kind": "CREDIT_CARD", "name": "Crédito" },
        "amount": "4500.00", "surchargeBase": "5000.00", "surchargePercent": "10.00", "surchargeAmount": "500.00", "chargedAmount": "5000.00" }
    ],
    "voidedAt": null, "voidedBy": null, "voidReason": null, "voidRefund": null
  },
  "isReplay": false,
  "change": "500.00",
  "stockWarnings": []
}
```

Si la pantalla hubiera mandado el crédito **con** recargo (`"5000"`), la suma daría 9.500 ≠ 9.000 → `422 PAYMENTS_TOTAL_MISMATCH`: el error se nota en lugar de cobrar $500 de más. Al anular esta venta salen **$4.500** de la caja abierta (sección 7).

### Ejemplo 3 — Sin descuento, todo con crédito → **$8.800** (regla 3, ej. 3)

Líneas $5.000 + $3.000 = subtotal 8.000. Crédito `amount` **8.000** → `surchargeBase` 8.000,00 → recargo 800 → `chargedAmount` y `total` **8.800**. `lineNetTotal`: 4.132,23 y 2.479,34.

### Ejemplo 4 — Línea por peso + vuelto (VEN-04; "Cómo probarlo" pasos 2, 3 y 5)

Empleado. Queso por kg a $4.990 × **0,350 kg** y Coca-Cola 500 ml (`UNIT`) 2 × $1.450. Paga todo en efectivo y entrega $5.000.

| Línea | Cálculo | `lineSubtotal` | `lineNetTotal` |
|---|---|---:|---:|
| Queso | R-2(0,350 × 4.990 = 1.746,50) → $0,50 sube (H-06 a) | **1.747** | 1.443,80 |
| Coca-Cola | 2 × 1.450 | 2.900 | 2.396,69 |
| **Total** | sin descuento ni recargo | **4.647** | |

```json
{ "clientRequestId": "6a2d0f4b-91c3-4e8a-a7d2-5b0e3c9f8d16", "items": [ { "productId": 18, "quantity": "0.350" }, { "productId": 12, "quantity": "2" } ],
  "payments": [ { "paymentMethodId": 1, "amount": "4647" } ], "cashTendered": "5000", "expectedTotal": "4647" }
```

Respuesta: `change: "353.00"`. Si la Coca-Cola tenía stock 1, queda en −1 y la respuesta trae `stockWarnings: [ { "productId": 12, "productName": "Coca-Cola 500 ml", "saleUnit": "UNIT", "stockAfter": "-1.000" } ]` (VEN-09: avisa y deja vender). Mandar `"quantity": "2.5"` para la Coca-Cola → `400` (`path: items.1.quantity`).

### Ejemplo 5 — "Varios" + pago mitad y mitad (VEN-05, H-09; "Cómo probarlo" pasos 4 y 5)

"Varios" a **$700** ("Pila AA") y un alfajor de $1.210 (costo neto $700, el ejemplo de la regla 2 de reportes). Mitad en efectivo y mitad con crédito.

| Concepto | Resultado |
|---|---:|
| Subtotal | 700 + 1.210 = 1.910 |
| Efectivo `amount` | 955 |
| Crédito `amount` | 955 → recargo R-2(95,50) = **96** → posnet **1.051** |
| `total` | 1.910 + 96 = **2.006** |

```json
{ "clientRequestId": "c41e8b27-3d5f-4a96-b0e1-7f2c6d4a9e53",
  "items": [ { "productId": 1, "quantity": "1", "unitPrice": "700", "customDescription": "Pila AA" },
             { "productId": 52, "quantity": "1" } ],
  "payments": [ { "paymentMethodId": 1, "amount": "955" }, { "paymentMethodId": 3, "amount": "955" } ],
  "cashTendered": "1000", "expectedTotal": "2006" }
```

- "Varios" **no mueve stock** (no hay `StockMovement` para esa línea) y queda con costo 0 y el IVA del producto "Varios".
- Vuelto: 1.000 − 955 = **45**.
- `GET /api/sales/:id` como **dueño** (`SaleWithCost`): la línea "Varios" con `unitNetCost` "0.00", `lineNetTotal` "578.51" y **`lineProfit: null`** (no entra en la ganancia, H-09); el alfajor con `lineNetTotal` "1000.00" (1.210 ÷ 1,21) y `lineProfit` "300.00"; `grossProfit` **"300.00"** (sin recargo, PA-31). Como **encargado**, la misma venta sin `unitNetCost`, `unitCost`, `lineProfit` ni `grossProfit`.
- Mandar `unitPrice` en la línea del alfajor → `422 LINE_FIELD_NOT_ALLOWED`. Mandar "Varios" sin `unitPrice` → `422 MISC_PRICE_REQUIRED`.

### Ejemplo 6 — Reparto del descuento con centavo sobrante (D6)

Tres líneas de $1.000 (la del medio con IVA 10,5 %), descuento $1.000, todo con débito.

| Línea | `discountAmount` | `lineTotal` | `lineNetTotal` |
|---|---:|---:|---:|
| 1 (21 %) | 333,33 | 666,67 | 550,97 |
| 2 (10,5 %) | 333,33 | 666,67 | 603,32 |
| 3 (21 %, última) | 1.000 − 666,66 = **333,34** | 666,66 | 550,96 |
| **Suma** | **1.000,00** | **2.000,00** | |

Débito `amount` 2.000 → `surchargeBase` 3.000,00 (se guarda igual aunque el % sea 0), recargo 0, `total` 2.000.

## 11. Códigos de error y acciones de auditoría nuevos

Van a `ERROR_CODES` en `shared` (más los de `caja.md` 7).

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `SALE_REQUEST_ID_REUSED` | Esa venta ya se había cobrado (venta #N). Revisá antes de cobrar de nuevo. |
| 409 | `SALE_TOTAL_CHANGED` | El total cambió (precio o recargo actualizado). Revisá el nuevo total y cobrá de nuevo. |
| 409 | `SALE_ALREADY_VOIDED` | Esta venta ya está anulada. |
| 422 | `PRODUCT_NOT_FOUND` | Un producto de la venta no existe. |
| 422 | `PRODUCT_INACTIVE` | Un producto de la venta está desactivado. Sacalo para cobrar. |
| 422 | `MISC_PRICE_REQUIRED` | Escribí el precio de "Varios". |
| 422 | `LINE_FIELD_NOT_ALLOWED` | El precio y la descripción solo se escriben en "Varios". |
| 422 | `LINE_TOTAL_ZERO` | Una línea da $ 0. Revisá el precio o la cantidad. |
| 422 | `DISCOUNT_TOO_HIGH` | El descuento tiene que ser menor que el subtotal. |
| 422 | `DISCOUNT_ROUNDS_TO_ZERO` | El descuento es tan chico que da $ 0. |
| 422 | `PAYMENT_METHOD_NOT_FOUND` / `PAYMENT_METHOD_INACTIVE` | Ese medio de pago no existe / está desactivado. |
| 422 | `PAYMENTS_TOTAL_MISMATCH` | Los pagos tienen que sumar exactamente el total. |
| 422 | `CASH_TENDERED_WITHOUT_CASH` | Para calcular el vuelto tiene que haber un pago en efectivo. |
| 422 | `CASH_TENDERED_TOO_LOW` | Lo que entregó el cliente no alcanza para la parte en efectivo. |
| 422 | `SALE_AMOUNT_OUT_OF_RANGE` | El importe es demasiado grande. |
| 422 | `SURCHARGE_NOT_ALLOWED` | Solo el crédito lleva recargo. |
| 422 | `CASH_METHOD_LOCKED` | El efectivo no se puede desactivar. |

Ya existentes que se usan acá: `VALIDATION_ERROR`, `FORBIDDEN`, `LOCAL_ONLY`, `NOT_FOUND`, `STOCK_OUT_OF_RANGE`, `CASH_SESSION_REQUIRED` y `CASH_SESSION_ALREADY_OPEN` (`caja.md`).

Acciones de auditoría: `DISCOUNT_APPLIED`, `SALE_VOID`, `CASH_SESSION_OPEN` (ya en `modelo-datos.md` 2.21) y **`PAYMENT_METHOD_UPDATE`** (nueva). Todas en la misma transacción que la acción (README 8).

## 12. Decisiones del dueño (2026-11-25)

Eran preguntas pendientes (H-33 a H-44, `requisitos.md` 7.7); el dueño aceptó todas las recomendaciones (opción a en todas) y ya están en este contrato.

| H | Decisión | Cómo queda en el contrato | Dónde |
|---|---|---|---|
| H-33 | Si un precio o el % de recargo cambió con el carrito armado, **se frena** y el cajero confirma el total nuevo. | `expectedTotal` distinto → `409 SALE_TOTAL_CHANGED` con el desglose nuevo; no se guarda nada. | 2.3, 6.1 paso 9 |
| H-34 | Un producto desactivado con el carrito armado **no se vende**. | `422 PRODUCT_INACTIVE` con el índice de la línea. | 6.1 paso 5 |
| H-35 | **No hay líneas de $0** (precio 0, "Varios" a $0, peso que redondea a $0). | `422 LINE_TOTAL_ZERO` (también en `calculateSale`). | 6.1 paso 8, 6.3 |
| H-36 | **Vuelto también en pago mixto**, solo de la parte en efectivo. | `cashTendered` se acepta con otros medios; `change = cashTendered − Σ efectivo`. | 2.5, 6.1 paso 11 |
| H-37 | **QR y transferencia no exceden** el total; lo transferido de más se devuelve por fuera. | `Σ amount = amountDue` exacto (`422 PAYMENTS_TOTAL_MISMATCH`). | 2.5, 6.1 paso 10 |
| H-38 | Se desactivan **todos los medios menos el efectivo**. | `PATCH` con `isActive: false` en `CASH` → `422 CASH_METHOD_LOCKED`. | 5.2 |
| H-39 | Se puede usar **el mismo medio dos veces** (dos tarjetas). | `payments` admite medios repetidos (hasta 10 pagos). | 4.2 |
| H-40 | El empleado ve **solo la venta que acaba de cobrar** (ni lista de ventas ni efectivo inicial de la caja). | Solo la respuesta del `POST /api/sales` (y su reintento con el mismo `clientRequestId`); `GET /api/sales` y `/:id` → `403`; `CashSessionPublic` sin `openingCash`. | 3, 8, `caja.md` 2.1 |
| H-41 | **Anular siempre requiere caja abierta**, tenga o no efectivo. | `422 CASH_SESSION_REQUIRED`. | 7 paso 2 |
| H-42 | **Sin límite de antigüedad** para anular. | No hay control de fecha. | 7 |
| H-43 | **Solo límites técnicos**: 200 líneas y 10 pagos por venta, importes que entren en la base. | `400` por cantidad de líneas o pagos; `422 SALE_AMOUNT_OUT_OF_RANGE`. | 4.2, 6.3 |
| H-44 | El **turno se elige libremente** al abrir la caja. | El servidor no lo valida contra la hora ni contra otros turnos. | `caja.md` 4 |

**Ya estaban definidos por documentos aprobados** (no se preguntaron):
- **El empleado puede abrir la caja:** matriz de permisos ("Vender, abrir y cerrar su caja": ✅ empleado), CAJ-01 y el paso 1 de "Cómo probarlo".
- **Si no hay caja abierta, el empleado ve el formulario de apertura** en la pantalla de venta (puede abrir, ver arriba); sin caja no se cobra (VEN-13).
- **Cantidad 0 o negativa:** no (modelo: `CHECK quantity > 0`; no hay devoluciones parciales, R1).
- **Los medios de pago se pueden desactivar y ordenar** (CFG-04, aprobado); el efectivo no (H-38 a).
- **Recargo solo en crédito** (VEN-07, CFG-01).
- **Monto del posnet en pago mixto:** con recargo (H-13, aprobada).

## 13. Notas para los demás agentes

- **base-datos:** tablas `PaymentMethod`, `CashSession`, `CashMovement`, `Sale`, `SaleItem`, `SalePayment` completas, y las FK que faltaban en `stock_movements.sale_item_id`. Cambios al modelo de esta etapa (`modelo-datos.md` 2.3, 2.14, 2.16 y sección 4): `Sale.clientRequestId` (`uuid`, único) y `Sale.requestHash` (`char(64)`); `CHECK (discount_amount < subtotal)` (H-10 b) y `CHECK (subtotal > 0)`; en `payment_methods`, `CHECK (surcharge_percent BETWEEN 0 AND 100)` y `CHECK (kind = 'CREDIT_CARD' OR surcharge_percent = 0)`; índice único parcial `cash_sessions_single_open`; seed de medios de pago (sección 5).
- **backend:** esquemas en `@kiosco/shared` (`sales/`, `cash/`) con los nombres de la sección 4; `calculateSale`, `creditAmountFromCharged`, `cashChange`, `newClientRequestId` y `getBusinessDate` en `shared` con tests. Orden de pasos de 6.1 y 7 tal cual. Respuestas por rol como dice la sección 3. `StockMovement.saleId` en las respuestas de la etapa 2. bcrypt en un `worker_thread` (ADR 004).
- **frontend:** foco siempre en el buscador; Enter agrega (lector); "Varios" con atajo (`/api/products/miscellaneous`); el carrito y el cobro calculan con `calculateSale`; en crédito se muestra **"Cobrar $X en el posnet"** (`chargedAmount`); se manda `expectedTotal` = el total mostrado; `clientRequestId` según 2.4; ante `409 SALE_TOTAL_CHANGED` se actualiza el carrito con `details` y se pide confirmar; el descuento solo se muestra a encargado y dueño. Mensajes por `code`.
- **qa:** los 6 ejemplos de la sección 10; los tests del plan (etapa 3) con estos códigos: "precio mandado por la pantalla" → `422 LINE_FIELD_NOT_ALLOWED` y no se guarda nada; "mismo identificador dos veces" → una sola venta, la segunda respuesta `200` con `isReplay: true` (también con dos pedidos simultáneos) y `409 SALE_REQUEST_ID_REUSED` con otro cuerpo; `409 SALE_TOTAL_CHANGED` si cambia el precio entre armar y cobrar; anulación de una venta de una caja cerrada (cerrada a mano en la base) → la salida va a la caja abierta y la vieja no cambia; el test de visibilidad de la sección 3; un test por cada `CHECK` nuevo.
- **seguridad:** revisar en especial 2.2 a 2.4 (que ningún importe de la pantalla se use para calcular; `expectedTotal` solo se compara), el reintento con otro usuario, `requestHash` que no sale en ninguna respuesta, el orden rol → puerta en la anulación y la deuda de bcrypt (ADR 004).

## 14. Decisiones técnicas del backend (etapa 3)

Huecos técnicos que el contrato no cerraba; ninguno cambia una regla de negocio ni un campo de la API.

- **Bloqueo de productos: `FOR NO KEY UPDATE`, no `FOR UPDATE`.** Al insertar `sale_items`, la clave foránea toma `KEY SHARE` sobre cada producto; con `FOR UPDATE` dos ventas con los mismos productos en distinto orden se bloqueaban entre sí (`deadlock detected`, lo mostró el test de carreras). `FOR NO KEY UPDATE` no choca con `KEY SHARE`, y las filas se toman `ORDER BY id`. Lo usan el cobro y la anulación.
- **Huella (`requestHash`):** SHA-256 de un JSON con claves en orden fijo y los números normalizados (`"4500"` y `"4500.00"` son el mismo pedido; lo que falta se guarda como `null`). Incluye `expectedTotal` y `cashTendered`. El usuario no entra en la huella: se compara aparte (otro usuario con el mismo cuerpo también da `409`). El orden de controles es el de 6.1: `403` por descuento (paso 2) va **antes** que el reintento (paso 3).
- **Carrera del mismo `clientRequestId`:** el `P2002` de `sales.client_request_id` deshace la transacción; después se lee la venta ganadora y se responde `200 isReplay` (o `409` si el pedido era otro).
- **Orden de los `422` por línea (paso 6):** primero los `400` de cantidad entera, después `LINE_FIELD_NOT_ALLOWED` y por último `MISC_PRICE_REQUIRED`; cada uno junta todas las líneas con problema en `details.fields`.
- **"Varios" a $0:** el formato lo frena como `400` (`unitPrice` > 0, sección 4.1). `LINE_TOTAL_ZERO` cubre lo que formato no ve: precio 0 en la base, o un precio chico que redondea a $0 (por ejemplo `$0,30`).
- **Descuento en $ con centavos:** se redondea al peso (R-2, ADR 002 punto 6); si da $0, `DISCOUNT_ROUNDS_TO_ZERO`. En % se guarda `discountPercent` (2 decimales); en $ queda `null`.
- **Rangos:** `SALE_AMOUNT_OUT_OF_RANGE` si el subtotal, el total o el importe de una línea es de $ 1.000.000.000.000 o más (no entra en `numeric(14,2)`); un `numeric field overflow` del stock se traduce a `STOCK_OUT_OF_RANGE`.
- **Avisos de stock:** salen de `StockMovement.stockAfter`; si un producto está en dos líneas, vale el último movimiento (el stock final) y hay un solo aviso.
- **Zona horaria:** `getBusinessDate` usa `America/Argentina/Buenos_Aires` por defecto (el servidor todavía no lee `TZ` del `.env`; Argentina no tiene horario de verano). La hora de corte sale de `Setting`, en cada venta y cada apertura.
- **Transacciones:** el cobro usa un tiempo máximo de 20 s (una venta de 200 líneas hace unas 600 consultas); el límite por defecto de Prisma es 5 s.
- **Respuesta de la anulación:** `cashRefund`, `voidRefund` y `otherRefunds` se arman releyendo lo guardado, así lo que se informa es lo que quedó en la base.
- **bcrypt (ADR 004):** un `worker_thread` con `bcryptjs` sincrónico, cola de concurrencia 1 y 16 de espera. En el build, `tsdown` genera `dist/bcrypt.worker.mjs` al lado de `dist/server.mjs`. `startBcryptWorker()` y `closeBcryptWorker()` los llama `server.ts` (arranque y apagado). Medición con `npm run bench:login -w @kiosco/api` (16 logins fallidos en paralelo, costo 12): búsqueda por código p95 **3,4 ms** durante la avalancha (3,9 ms sin ella); los 16 logins tardan 4,2 s.
