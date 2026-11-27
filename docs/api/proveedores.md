# API — Proveedores, cuenta corriente, pagos y pedido sugerido

> Etapa 5, tarea 1. Requisitos: PRV-01 a PRV-06, CAJ-07, REP-07 (para reponer por proveedor), STK-01 (proveedor habitual); PA-04, PA-07, PA-08, PA-26; H-08, H-12; `requisitos.md` sección 3 (matriz y acceso desde afuera).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero), ADR 003 (puertas: pago con efectivo de la caja solo en el local, punto 6).
> Modelo: `Supplier`, `Product.defaultSupplierId`, `SupplierAccountEntry`, `CashMovement` (`docs/modelo-datos.md` 2.6, 2.7, 2.13, 2.20 y sección 4).
> Compras, adjuntos y anulación de compras: `docs/api/compras.md`. **H-54 a H-64 resueltos por el dueño (2026-11-26)**, aceptando todas las recomendaciones (`requisitos.md` 7.9, `relevamiento.md` "Etapa 5"); las que tocan este documento están en la sección 14.
> **Decisión ya aprobada (plan, sección 5, punto 5):** saldo inicial por proveedor al instalar y correcciones manuales con motivo, solo el dueño (secciones 9 y 10).
> **Cierre de la etapa 5 (2026-11-27):** el dueño decidió **H-65 a** (devolución de plata del proveedor en un solo paso: suma a la caja y baja el saldo a favor) y **H-66 a** (fotos en una compra anulada: se agregan y se borran). El contrato de la devolución es la **sección 15**; sus detalles **H-67 a H-71 están pendientes del dueño** (sección 16) y el contrato está escrito con la recomendación de cada uno (marcados con ⏳).

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles |
|---|---|:---:|---|
| `GET /api/suppliers` | Listar proveedores, con saldo | `any` | OWNER, MANAGER |
| `GET /api/suppliers/:id` | Ver un proveedor, con saldo | `any` | OWNER, MANAGER |
| `POST /api/suppliers` | Alta | `any` | OWNER, MANAGER |
| `PATCH /api/suppliers/:id` | Editar, desactivar, reactivar | `any` | OWNER, MANAGER |
| `POST /api/suppliers/:id/assign-products` | Asignarlo como **habitual** de varios productos a la vez | `any` | OWNER, MANAGER |
| `GET /api/suppliers/:id/account` | **Cuenta corriente:** movimientos y saldo | `any` | OWNER, MANAGER |
| `POST /api/suppliers/:id/payments` | **Registrar un pago** (4 orígenes) | `any` (*) | OWNER, MANAGER |
| `POST /api/suppliers/:id/refunds` | **Registrar una devolución del proveedor** (H-65; sección 15) | `any` (*) ⏳ H-67 | OWNER, MANAGER ⏳ H-70 |
| `POST /api/suppliers/:id/opening-balance` | **Saldo inicial** (uno por proveedor) | `any` | **OWNER** |
| `POST /api/suppliers/:id/adjustments` | **Corrección** del saldo con motivo | `any` | **OWNER** |
| `GET /api/suppliers/:id/suggested-order` | **Pedido sugerido**: lista, texto y link de WhatsApp | `any` | OWNER, MANAGER |
| `GET /api/stock/restock?supplierId=` | "Para reponer" filtrado por proveedor (ruta de la etapa 2, se le agrega el filtro) | `any` | OWNER, MANAGER |

(*) **Pago con efectivo de la caja desde afuera:** la ruta es `access: 'any'` y **el servicio** rechaza `source = CASH_REGISTER` por la puerta remota con `403 LOCAL_ONLY` (auditado como `ACCESS_DENIED`, igual que `requireLocal`). Es lo que fija el ADR 003 punto 6: transferencia, efectivo de afuera y "otro" **sí** se pueden registrar desde afuera; solo el efectivo de la caja no. Vale también para el "pagar ahora" de una compra (`compras.md` 5) y para la **devolución del proveedor** que entra a la caja (sección 15.2; CAJ-09: desde afuera no se registran movimientos de caja). El efecto para el usuario es el mismo que `access: 'local'`, pero sin bloquear los otros tres orígenes. ⏳ Si el dueño elige H-67 a) (la devolución solo entra a la caja), la ruta de devoluciones pasa a `access: 'local'` directamente.

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **EMPLOYEE → `403 FORBIDDEN` en todas** (matriz: "Proveedores, pedidos y pagos a proveedores" ❌; PRV-06). Rol antes que puerta.
- **Alta, edición y desactivación:** encargado y dueño (PRV-06: "solo encargado o dueño gestionan proveedores"). No es una pregunta abierta.
- **No hay `DELETE`:** los proveedores se desactivan (PRV-02); los movimientos de cuenta corriente no se editan ni se borran (se corrigen con un ajuste, sección 10).

## 2. Visibilidad por rol

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Proveedores (datos, saldo, cuenta corriente, pedido sugerido) | ❌ `403` | ✅ | ✅ | Matriz, PRV-06, REP-06 (deuda: encargado y dueño) |
| Registrar pagos | ❌ | ✅ (efectivo de la caja: solo local) | ✅ (ídem) | PRV-04, PRV-06, PA-01 |
| Registrar devoluciones del proveedor | ❌ | ✅ (a la caja: solo local) ⏳ H-70 | ✅ (ídem) | H-65 (PRV-07), PRV-06, CAJ-09 |
| Saldo inicial y correcciones | ❌ | ❌ `403` | ✅ | Decisión del dueño (plan 5, punto 5) |
| Proveedor habitual en la ficha del producto | ❌ (el campo no existe en `ProductPublic`) | ✅ | ✅ | Matriz ("proveedores" ❌ para el empleado) |
| Filtrar productos por proveedor | ❌ `403` (`details.fields`) | ✅ | ✅ | Ídem |

- La cuenta corriente **no muestra costos de productos**: son importes de facturas y pagos. El encargado la ve completa (REP-06).
- Igual que en las etapas anteriores, cada respuesta se arma con una función por rol y pasa por `parseResponse` del esquema (README 6). Test obligatorio de qa: con sesión de **empleado**, toda ruta de este documento da `403`, y ninguna respuesta de `GET /api/products*` trae la clave `defaultSupplier` (búsqueda recursiva).

## 3. Esquemas (van a Zod en `@kiosco/shared`, carpeta `suppliers/`)

Requests **estrictos** (campo desconocido → `400`); respuestas sin `strict` (README 3). `Money`, `MoneyInputSchema`, `PositiveMoneyInputSchema`, `DateOnlySchema`, `ClientRequestIdSchema` y `UserRef` como en `productos-stock.md` 3, `ventas.md` 4.1 y `caja.md` 2.

### 3.1 Campos

| Esquema | Tipo y reglas |
|---|---|
| `WeekdaySchema` | `"MON"` \| `"TUE"` \| `"WED"` \| `"THU"` \| `"FRI"` \| `"SAT"` \| `"SUN"` (modelo 2.22). |
| `VisitDaysSchema` | `Weekday[]`, sin repetidos (`400`), de 0 a 7. Se guarda y se devuelve ordenado de lunes a domingo. |
| `SupplierNameSchema` | string con `trim`, 1 a 80 caracteres. Único sin distinguir mayúsculas (`409 SUPPLIER_NAME_TAKEN`). |
| `ArPhoneInputSchema` | string con `trim`, hasta 30 caracteres, solo dígitos, espacios, `+`, `-`, `.`, `(` y `)`. Se **normaliza** a 10 dígitos (sección 4); si no se puede → `400`. `""` o `null` = sin teléfono. |
| `EmailInputSchema` | string con `trim`, formato de email (`z.email()`), hasta 120. `""` o `null` = sin email. |
| `CuitInputSchema` | string con `trim`; se aceptan `"20123456786"` o `"20-12345678-6"`; se guardan los **11 dígitos** sin guiones. Tiene que pasar el **dígito verificador** (módulo 11, función `isValidCuit` de `shared`): si no → `400` "El CUIT no es válido. Revisá los números." `""` o `null` = sin CUIT. |
| `SupplierNotesSchema` | string con `trim`, hasta 500. `""` = sin notas. |
| `SupplierPaymentSourceSchema` | `"CASH_REGISTER"` (efectivo de la caja) \| `"CASH_OUTSIDE_REGISTER"` (efectivo de afuera de la caja) \| `"BANK_TRANSFER"` (transferencia) \| `"OTHER"` (otro) — PA-08. En una **devolución** (sección 15) dice **por dónde entra** la plata (⏳ H-67). |
| `SupplierEntryTypeSchema` | `"OPENING_BALANCE"` \| `"PURCHASE"` \| `"PURCHASE_VOID"` \| `"PAYMENT"` \| `"REFUND"` \| `"ADJUSTMENT"` (sección 7). `REFUND` = devolución del proveedor (H-65, sección 15). |
| `SignedMoneyInputSchema` (nuevo, en `common`) | string `^-?\d{1,9}(\.\d{1,2})?$`, distinto de 0, con el mismo tope de 9 enteros que `MoneyInputSchema` (`MAX_MONEY_INTEGER_DIGITS`, mismo mensaje). Solo en saldo inicial y ajustes. |
| `PaymentReferenceSchema` | string con `trim`, hasta 100 (ej.: número de operación de la transferencia). `""` = sin referencia. |
| `EntryDescriptionSchema` | string con `trim`, hasta 200. |

### 3.2 Respuestas

```ts
SignedMoney = string                     // "-1500.00", "24200.00"

SupplierSchema = {
  id: number;
  name: string;
  phone: string | null;                  // 10 dígitos: área sin 0 + número sin 15 ("1123456789")
  whatsappPhone: string | null;          // "549" + phone: lo que va en wa.me (sección 4). null si no hay teléfono
  email: string | null;
  taxId: string | null;                  // CUIT, 11 dígitos sin guiones
  visitDays: Weekday[];                  // ordenados de lunes a domingo
  notes: string | null;
  isActive: boolean;
  balance: SignedMoney;                  // Σ amount de la cuenta corriente. + = le debemos; − = saldo a favor del kiosco
  hasOpeningBalance: boolean;            // ya tiene saldo inicial (sección 9)
  defaultProductCount: number;           // productos ACTIVOS que lo tienen como habitual
  createdAt: string; updatedAt: string;
}
SupplierListItemSchema = SupplierSchema // igual (sin paginar el detalle: no tiene listas adentro)

SupplierAccountEntrySchema = {
  id: number;
  supplierId: number;
  type: SupplierEntryType;
  amount: SignedMoney;                   // con signo: + suma deuda, − la baja (sección 7)
  entryDate: string;                     // YYYY-MM-DD
  balanceAfter: SignedMoney;             // saldo acumulado después de este movimiento (orden de la sección 7.2)
  purchase: { id: number; documentType: PurchaseDocumentType; documentNumber: string | null; status: PurchaseStatus } | null;
  paymentSource: SupplierPaymentSource | null;   // solo PAYMENT y REFUND
  reference: string | null;
  description: string | null;            // ADJUSTMENT: el motivo (obligatorio)
  cashMovement: { id: number; cashSessionId: number } | null;   // solo PAYMENT o REFUND con CASH_REGISTER
  user: UserRef;
  createdAt: string;
}

SupplierAccountResponseSchema = {
  supplier: { id: number; name: string; isActive: boolean };
  balance: SignedMoney;                  // saldo actual (de TODOS los movimientos, no solo de la página)
  items: SupplierAccountEntry[];         // paginado (README 5)
  page: number; pageSize: number; total: number;
}

SupplierPaymentResponseSchema = {
  entry: SupplierAccountEntry;           // el PAYMENT creado
  balance: SignedMoney;                  // saldo después del pago
  cashMovement: CashMovement | null;     // la salida de caja (caja.md 2), solo con CASH_REGISTER
  isReplay: boolean;                     // true = reintento con el mismo clientRequestId (8.3)
}

SupplierRefundResponseSchema = {         // devolución del proveedor (sección 15). Misma forma que el pago
  entry: SupplierAccountEntry;           // el REFUND creado (amount POSITIVO)
  balance: SignedMoney;                  // saldo después de la devolución
  cashMovement: CashMovement | null;     // el ingreso de caja IN / SUPPLIER_REFUND, solo con CASH_REGISTER
  isReplay: boolean;                     // true = reintento con el mismo clientRequestId (15.5)
}

SupplierEntryResponseSchema = {          // saldo inicial y ajustes
  entry: SupplierAccountEntry;
  balance: SignedMoney;
}

AssignProductsResponseSchema = {
  supplierId: number;
  products: { id: number; name: string; previousSupplier: { id: number; name: string } | null }[];
}

SuggestedOrderItemSchema = {
  productId: number; name: string; barcode: string | null; saleUnit: SaleUnit;
  stockQuantity: SignedQuantity;         // puede ser negativo (R2)
  minStock: Quantity;
  shortfall: Quantity;                   // max(0, mínimo − stock): igual que "Para reponer"
  suggestedQuantity: Quantity;           // max(mínimo − stock, 1) (PA-26, H-08 b)
  unitsPerPack: Quantity | null;         // informativo, para que el encargado redondee a bultos si quiere
}
SuggestedOrderResponseSchema = {
  supplier: { id: number; name: string; isActive: boolean; whatsappPhone: string | null };
  storeName: string;                     // Setting.storeName (CFG-05)
  items: SuggestedOrderItem[];
  isTruncated: boolean;                  // true si había más de 500 productos (11.1)
  text: string;                          // texto del pedido con las cantidades SUGERIDAS (11.3)
  whatsappUrl: string | null;            // https://wa.me/<whatsappPhone>?text=<text codificado>; null sin teléfono
}
```

### 3.3 Requests

```ts
SupplierListQuerySchema = {
  page?; pageSize?;                      // README 5
  search?: string;                       // trim, 1 a 80: nombre (sin mayúsculas ni acentos, como productos) o CUIT que EMPIEZA con eso
  isActive?: 'true' | 'false';           // sin filtro = todos (el frontend manda 'true' por defecto)
  hasBalance?: 'true' | 'false';         // 'true' = saldo ≠ 0; 'false' = saldo 0
  visitDay?: Weekday;                    // "quién viene hoy"
  sortBy?: 'name' | 'balance';           // default 'name'
  sortOrder?: 'asc' | 'desc';            // default 'asc' (con 'balance', el frontend manda 'desc': el que más debemos primero)
}

CreateSupplierRequestSchema = {
  name: SupplierName;
  phone?: ArPhoneInput | null;
  email?: EmailInput | null;
  taxId?: CuitInput | null;
  visitDays?: VisitDays;                 // default []
  notes?: SupplierNotes | null;
  confirmDuplicateTaxId?: boolean;       // H-58 b: confirma un CUIT que ya tiene otro proveedor
}
UpdateSupplierRequestSchema = {          // al menos uno
  name?; phone?; email?; taxId?; visitDays?; notes?;
  isActive?: boolean;                    // false = desactivar (PRV-02); true = reactivar (H-59)
  confirmDuplicateTaxId?: boolean;       // solo no cuenta como cambio
}

AssignProductsRequestSchema = {
  productIds: number[];                  // 1 a 200, enteros positivos, sin repetidos
}

SupplierAccountQuerySchema = {
  page?; pageSize?;
  from?: string; to?: string;            // YYYY-MM-DD sobre entryDate, ambos incluidos; from > to → 400
  type?: SupplierEntryType;
}

CreateSupplierPaymentRequestSchema = {
  clientRequestId: ClientRequestId;      // UUID por formulario, como en las ventas (8.3)
  amount: PositiveMoney;                 // > 0, lo que se pagó (se guarda NEGATIVO en la cuenta)
  source: SupplierPaymentSource;
  entryDate?: string | null;             // YYYY-MM-DD; default hoy (H-61). Con CASH_REGISTER, solo hoy
  reference?: PaymentReference | null;
  description?: EntryDescription | null;
  confirmOverpayment?: boolean;          // H-56 c: confirma un pago mayor que la deuda
}

CreateSupplierRefundRequestSchema = {    // devolución del proveedor (sección 15.3). ⏳ H-67 a H-70
  clientRequestId: ClientRequestId;      // UUID por formulario, como el pago (15.5)
  amount: PositiveMoney;                 // > 0, lo que devolvió el proveedor (se guarda POSITIVO en la cuenta)
  source: SupplierPaymentSource;         // por dónde entra la plata (⏳ H-67 b: los 4; con a), solo "CASH_REGISTER")
  entryDate?: string | null;             // YYYY-MM-DD; default hoy; no futura. Con CASH_REGISTER, solo hoy
  reference?: PaymentReference | null;   // ej.: número de la nota de crédito o de la transferencia
  description?: EntryDescription | null; // ej.: "Devuelve lo pagado de la compra #22 (anulada)"
  confirmExceedsCredit?: boolean;        // ⏳ H-68 b: confirma una devolución mayor que el saldo a favor
}
// NO acepta purchaseId (⏳ H-69 a: la devolución es suelta, como un pago suelto).

CreateOpeningBalanceRequestSchema = {    // solo OWNER
  amount: SignedMoney;                   // ≠ 0. + = el kiosco le debía; − = el proveedor le debía al kiosco (H-62)
  entryDate: string;                     // YYYY-MM-DD, no futura: la fecha a la que corresponde el saldo
  description?: EntryDescription | null; // ej.: "Deuda al instalar el sistema"
}

CreateAccountAdjustmentRequestSchema = { // solo OWNER
  amount: SignedMoney;                   // ≠ 0. + sube la deuda, − la baja
  reason: string;                        // trim, 1 a 200: obligatorio (decisión del dueño)
  entryDate?: string | null;             // default hoy; no futura
}
```

## 4. Teléfono y WhatsApp (decisión técnica)

El link de WhatsApp necesita el número en formato internacional **sin** `+`, espacios ni ceros: para un celular argentino, `549` + código de área sin el 0 + número sin el 15. Ej.: `https://wa.me/5491123456789`. Al cargar un teléfono la gente escribe cualquier forma ("011 15 2345-6789", "+54 9 11 2345 6789", "351-5551234").

**Decisión:** el sistema guarda el teléfono como los **10 dígitos nacionales** (área sin 0 + número sin 15) y arma `whatsappPhone = "549" + phone` al responder. La normalización es una sola función de `shared` (`normalizeArPhone`), que usan el formulario (para mostrar el resultado mientras se escribe) y el servidor:

1. Sacar espacios, `-`, `.`, `(`, `)` y `+`. Si queda algo que no es un dígito → `400`.
2. Si empieza con `00` → sacarlo (prefijo internacional marcado desde un fijo).
3. Si empieza con `54` y tiene 12 o 13 dígitos → sacar el `54`; si después empieza con `9` → sacarlo. (Ningún código de área argentino empieza con 5, así que un número nacional nunca se confunde.)
4. Si empieza con `0` → sacarlo.
5. Si quedan **exactamente 10 dígitos** → listo. Si no → `400` con el mensaje: "Escribí el código de área sin el 0 y el número sin el 15 (10 números en total). Ej.: 11 2345-6789 o 351 555-1234."

| Se escribe | Queda guardado (`phone`) | `whatsappPhone` |
|---|---|---|
| `11 2345-6789` | `1123456789` | `5491123456789` |
| `+54 9 11 2345-6789` | `1123456789` | `5491123456789` |
| `+54 11 2345 6789` | `1123456789` | `5491123456789` |
| `0351 555-1234` | `3515551234` | `5493515551234` |
| `011 15 2345-6789` | — → `400` (tiene el 15: no se puede saber con seguridad dónde termina el código de área) | — |
| `2345-6789` | — → `400` (falta el código de área) | — |

**Por qué así:** sacar el "15" exige saber cuántos dígitos tiene el código de área (2, 3 o 4), y eso requiere una tabla de todas las áreas del país. Pedir "sin el 15" y validar 10 dígitos es **determinístico** y el mensaje explica cómo escribirlo. **Contra:** solo sirve para números argentinos (los proveedores del kiosco lo son); un fijo también se guarda y el link de WhatsApp no va a funcionar con él (WhatsApp avisa "este número no está en WhatsApp"). La pantalla muestra el número formateado (`11 2345-6789`) con una función de `shared`.

## 5. ABM de proveedores

### 5.1 `GET /api/suppliers` — Listar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER.
- **Query:** `SupplierListQuerySchema`. Paginada. Orden por defecto: nombre (sin mayúsculas ni acentos, como `productos-stock.md` 1), empate por `id`.
- **Response 200:** `Paginated<SupplierListItem>`. El **saldo** sale de **una** consulta agrupada (`SUM(amount) GROUP BY supplier_id`), no una por proveedor. Es también la base del reporte de deuda (REP-06, etapa 7).
- Para el desplegable de la compra, el frontend pide `isActive=true&pageSize=200`.
- **Errores:** `400`, `403`. **Auditoría:** no.

### 5.2 `GET /api/suppliers/:id` — Ver

- **Roles:** OWNER, MANAGER. **Response 200:** `SupplierSchema`. Incluye desactivados.
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.

### 5.3 `POST /api/suppliers` — Alta (PRV-01)

- **Roles:** OWNER, MANAGER (PRV-06). **Request:** `CreateSupplierRequestSchema`.
- **Qué hace** (una transacción): valida formato (`400`), normaliza teléfono y CUIT; nombre libre (`409 SUPPLIER_NAME_TAKEN`, por el índice único `lower(name)`: se traduce el `P2002`, no se consulta antes); **CUIT repetido** (H-58 b): si otro proveedor (activo o no) ya tiene ese CUIT y no vino `confirmDuplicateTaxId: true` → `422 SUPPLIER_TAX_ID_DUPLICATE` con `details: { "supplierId": 3, "supplierName": "Distribuidora Sur" }`; con la confirmación se guarda. Crea con `isActive = true` y audita.
- **Response 201:** `SupplierSchema` (saldo `"0.00"`).
- **Errores:** `400`, `403`, `409 SUPPLIER_NAME_TAKEN`, `422 SUPPLIER_TAX_ID_DUPLICATE`.
- **Auditoría:** `SUPPLIER_CREATE`, `entityType` `Supplier`, `details: { after: { name, phone, email, taxId, visitDays, notes } }` (y `confirmedDuplicateTaxId: true` si se confirmó).
- **Ejemplo** (paso 1 de "Cómo probarlo"):

```json
{ "name": "Distribuidora Sur", "phone": "+54 9 11 2345-6789", "taxId": "30-71234567-1",
  "visitDays": ["TUE", "FRI"], "notes": "Preventista: Carlos. Pedido hasta las 10." }
```

```json
{
  "id": 3, "name": "Distribuidora Sur", "phone": "1123456789", "whatsappPhone": "5491123456789",
  "email": null, "taxId": "30712345671", "visitDays": ["TUE", "FRI"],
  "notes": "Preventista: Carlos. Pedido hasta las 10.", "isActive": true, "balance": "0.00",
  "hasOpeningBalance": false, "defaultProductCount": 0,
  "createdAt": "2026-11-27T13:00:00.000Z", "updatedAt": "2026-11-27T13:00:00.000Z"
}
```

(El CUIT del ejemplo es ilustrativo; qa usa CUITs que pasen el dígito verificador.)

### 5.4 `PATCH /api/suppliers/:id` — Editar, desactivar o reactivar

- **Roles:** OWNER, MANAGER. **Request:** `UpdateSupplierRequestSchema`.
- **Desactivar** (`isActive: false`, PRV-02): se permite **con saldo distinto de 0 y con productos que lo tienen como habitual** (H-59 a): el saldo y el historial quedan; los productos conservan su proveedor habitual. Un proveedor desactivado: **no** recibe compras nuevas (`422 SUPPLIER_INACTIVE`, `compras.md` 5) ni se asigna a productos (6); **sí** recibe pagos, saldo inicial y ajustes (para poder cancelar la deuda) y se puede ver su pedido sugerido.
- **Reactivar** (`isActive: true`): encargado y dueño (H-59 a, como H-26 para productos).
- Nombre y CUIT: mismas reglas que el alta (`409`, `422` con confirmación). Si no cambió nada: `200` sin auditar.
- **Response 200:** `SupplierSchema`.
- **Errores:** `400`, `403`, `404`, `409 SUPPLIER_NAME_TAKEN`, `422 SUPPLIER_TAX_ID_DUPLICATE`.
- **Auditoría:** `SUPPLIER_UPDATE`, `details: { before, after }` solo con lo que cambió (incluye desactivar y reactivar).

## 6. Proveedor habitual de los productos (PA-04)

**Uno por producto** (PA-04, STK-01). **Decisión (PA-04: "¿desde dónde?"): desde los dos lados**, con una sola columna (`Product.defaultSupplierId`):

| Desde | Cómo | Para qué |
|---|---|---|
| **La ficha del producto** | `defaultSupplierId` en `POST /api/products` y `PATCH /api/products/:id` (cambiar o quitar con `null`) | El caso normal: dar de alta un producto o cambiarle el proveedor. |
| **El proveedor** | `POST /api/suppliers/:id/assign-products` con una lista de productos | Al empezar ("asignarlo como habitual de algunos productos", paso 1 de "Cómo probarlo") sin abrir 40 fichas. |

**Pros:** las dos pantallas escriben el mismo campo; no hay tabla nueva. **Contra:** una ruta más. Quitar el habitual se hace solo desde la ficha (`null`), para no sumar otra ruta. Cambiar el habitual **no cambia** compras ni precios ya cargados.

### 6.1 Cambios en `docs/api/productos-stock.md` (solo se agregan campos)

| Dónde | Cambio |
|---|---|
| `CreateProductRequestSchema`, `UpdateProductRequestSchema` | **Nuevo** `defaultSupplierId?: number \| null` (OWNER, MANAGER). Tiene que existir (`422 SUPPLIER_NOT_FOUND`) y, si es un proveedor **nuevo** para el producto, estar activo (`422 SUPPLIER_INACTIVE`; dejar el que ya tenía aunque se haya desactivado no falla). En "Varios" → `422 MISC_PRODUCT_LOCKED` (H-32: solo nombre e IVA). Queda en `PRODUCT_CREATE` / `PRODUCT_UPDATE`. |
| Respuestas de productos | **Nuevo esquema `ProductBackofficeSchema`** = `ProductPublic` & `{ defaultSupplier: { id; name; isActive } \| null }`, para el **encargado**. `ProductWithCostSchema` (dueño) pasa a extender `ProductBackoffice` (suma el mismo campo). **`ProductPublic` (empleado) no cambia**: no tiene el campo. La tabla 2.2 queda: `GET /api/products`, `GET /api/products/:id` y `PATCH /api/products/:id` → EMPLOYEE `ProductPublic`, MANAGER `ProductBackoffice`, OWNER `ProductWithCost`. `ProductSaleItem` (mostrador) no cambia. |
| `ProductListQuerySchema` | **Nuevos** `supplierId?: number` y `withoutSupplier?: 'true'` (los que no tienen habitual, para completarlos). Si los manda un **empleado** → `403 FORBIDDEN` con `details: { "fields": ["supplierId"] }` (como 2.4). Mandar los dos juntos → `400`. |
| `GET /api/stock/restock` (8.3) | **Nuevo** filtro `supplierId?: number` (REP-07: "también por proveedor"). `StockListItemSchema` suma `defaultSupplier: { id; name } \| null` (las dos listas son de OWNER y MANAGER). |
| `StockMovementSchema.purchaseId` | Desde esta etapa trae el id de la compra en los movimientos `PURCHASE` y `PURCHASE_VOID` (por `purchaseItemId`). |
| Regla 11 de la sección 9 | Queda sin efecto: `defaultSupplierId` existe desde la etapa 5. |

### 6.2 `POST /api/suppliers/:id/assign-products` — Asignar varios productos

- **Roles:** OWNER, MANAGER. **Acceso:** `any`. **Request:** `AssignProductsRequestSchema`.
- **Qué hace** (una transacción): el proveedor tiene que existir (`404`) y estar activo (`422 SUPPLIER_INACTIVE`); todos los productos tienen que existir (`422 PRODUCT_NOT_FOUND`, `details: { "productIds": [..] }`) y ninguno puede ser "Varios" (`422 MISC_PRODUCT_LOCKED`). Los desactivados **sí** se asignan (es un dato, no una venta). Pone `defaultSupplierId = :id` en todos (reemplaza al habitual anterior, si tenía). No toca nada más del producto.
- **Response 200:** `AssignProductsResponseSchema`, con el habitual anterior de cada uno (para que la pantalla diga "Coca-Cola 500 ml estaba en Distribuidora Norte").
- **Errores:** `400` (lista vacía, más de 200, repetidos), `403`, `404`, `422 SUPPLIER_INACTIVE`, `422 PRODUCT_NOT_FOUND`, `422 MISC_PRODUCT_LOCKED`.
- **Auditoría:** **una** fila `PRODUCT_SUPPLIER_ASSIGN`, `entityType` `Supplier`, `entityId` = proveedor, `details: { products: [{ productId, previousSupplierId }] }` (solo los que cambiaron; si ninguno cambió, `200` sin auditar).

## 7. Cuenta corriente (PRV-03)

### 7.1 Movimientos y signos (modelo 2.20, D10)

**Saldo = Σ `amount` de todos los movimientos del proveedor.** Positivo = **le debemos**; negativo = **saldo a favor del kiosco**. El saldo no se guarda en ninguna columna: se calcula (siempre coincide con su historial).

| `type` | Lo crea | Signo de `amount` | `purchase` | Notas |
|---|---|:---:|:---:|---|
| `OPENING_BALANCE` | Saldo inicial (sección 9), solo dueño | `+` o `−` (H-62) | — | **Uno por proveedor** (índice único parcial). |
| `PURCHASE` | Cada compra (`compras.md` 5), por su `total` | `+` | ✅ | "Toda compra suma deuda" (PA-07). Uno por compra. |
| `PURCHASE_VOID` | Anulación de la compra, por el mismo `total` | `−` | ✅ | Uno por compra (PA-25). |
| `PAYMENT` | Pago (sección 8) o "pagar ahora" de una compra | `−` | Solo si fue "pagar ahora" | Con `paymentSource`. Con `CASH_REGISTER` tiene su `CashMovement` (`OUT` / `SUPPLIER_PAYMENT`). |
| `REFUND` | **Devolución del proveedor** (sección 15, H-65), encargado y dueño ⏳ H-70 | `+` | — (⏳ H-69 a) | **Baja el saldo a favor del kiosco** (el saldo es negativo y se acerca a 0). Con `paymentSource` (por dónde entró la plata) y siempre con `clientRequestId`. Con `CASH_REGISTER` tiene su `CashMovement` (`IN` / `SUPPLIER_REFUND`). |
| `ADJUSTMENT` | Corrección con motivo (sección 10), solo dueño | `+` o `−` | — | `description` = el motivo (obligatorio). |

Cómo se lee el signo de la devolución: el pago y la devolución son **espejo**. El pago saca plata del kiosco y baja lo que le debemos (`−`); la devolución trae plata al kiosco y baja lo que **él** nos debe, que en esta cuenta es un saldo negativo, así que el movimiento es `+`. Ejemplo: saldo −$ 15.000 (a favor del kiosco) + devolución $ 15.000 = **$ 0** (sección 15.11).

### 7.2 `GET /api/suppliers/:id/account` — Movimientos y saldo

- **Roles:** OWNER, MANAGER. **Acceso:** `any`. **Query:** `SupplierAccountQuerySchema`. Paginada.
- **Orden:** `entryDate` descendente y después `id` descendente (lo más nuevo arriba). `balanceAfter` es el saldo acumulado en **orden cronológico** (`entryDate`, `id` ascendentes) sobre **todos** los movimientos, aunque la página o el filtro muestren solo algunos: `SUM(amount) OVER (ORDER BY entry_date, id)`. Así el número de cada fila coincide con un estado de cuenta en papel.
- **Response 200:** `SupplierAccountResponseSchema`. `balance` es el saldo actual (igual al `balanceAfter` del movimiento más nuevo en orden cronológico).
- **Rapidez:** índice `(supplierId, entryDate)` del modelo; un proveedor tiene unos cientos de movimientos por año.
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.
- **Ejemplo** (pasos 2 a 4 de "Cómo probarlo"; la compra de $40.300 es el ejemplo C de `compras.md` 9, pago de $10.000 por transferencia y de $5.000 con efectivo de la caja):

```json
{
  "supplier": { "id": 3, "name": "Distribuidora Sur", "isActive": true },
  "balance": "25300.00",
  "items": [
    { "id": 12, "supplierId": 3, "type": "PAYMENT", "amount": "-5000.00", "entryDate": "2026-11-27",
      "balanceAfter": "25300.00", "purchase": null, "paymentSource": "CASH_REGISTER", "reference": null,
      "description": null, "cashMovement": { "id": 95, "cashSessionId": 9 },
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T15:10:00.000Z" },
    { "id": 11, "supplierId": 3, "type": "PAYMENT", "amount": "-10000.00", "entryDate": "2026-11-27",
      "balanceAfter": "30300.00", "purchase": null, "paymentSource": "BANK_TRANSFER", "reference": "Op. 778812",
      "description": null, "cashMovement": null,
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T15:05:00.000Z" },
    { "id": 10, "supplierId": 3, "type": "PURCHASE", "amount": "40300.00", "entryDate": "2026-11-27",
      "balanceAfter": "40300.00",
      "purchase": { "id": 22, "documentType": "INVOICE", "documentNumber": "0003-00012350", "status": "CONFIRMED" },
      "paymentSource": null, "reference": null, "description": null, "cashMovement": null,
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T14:50:00.000Z" }
  ],
  "page": 1, "pageSize": 50, "total": 3
}
```

## 8. `POST /api/suppliers/:id/payments` — Registrar un pago (PRV-04, CAJ-07)

- **Sesión:** sí. **Acceso:** `any`; **con `source = CASH_REGISTER` solo en el local** (`403 LOCAL_ONLY` desde la remota, ver (*) de la sección 1). **Roles:** OWNER, MANAGER.
- **Request:** `CreateSupplierPaymentRequestSchema`.

### 8.1 Los cuatro orígenes (PA-08)

| `source` | Qué es | ¿Toca la caja? | ¿Desde afuera? |
|---|---|:---:|:---:|
| `CASH_REGISTER` | Efectivo **de la caja** (del cajón) | ✅ **Salida automática** `OUT` / `SUPPLIER_PAYMENT` en la caja **abierta** (CAJ-07). Sin caja abierta → `422 CASH_SESSION_REQUIRED` (igual que H-47). Entra en el esperado del arqueo como cualquier salida (`caja.md` 9.1). | ❌ `403 LOCAL_ONLY` |
| `CASH_OUTSIDE_REGISTER` | Efectivo que no sale del cajón (por ejemplo, de la billetera del dueño) | ❌ | ✅ |
| `BANK_TRANSFER` | Transferencia | ❌ | ✅ |
| `OTHER` | Otro (cheque, Mercado Pago…); la descripción explica | ❌ | ✅ |

"Solo el efectivo de la caja afecta el arqueo" (PRV-04): los otros tres solo bajan la deuda.

### 8.2 Qué hace, en este orden (una transacción)

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod. | `400 VALIDATION_ERROR` |
| 2 | Si `source = CASH_REGISTER` y el pedido viene por la puerta remota → rechazar y auditar `ACCESS_DENIED` (con el límite de 1 por minuto, ADR 003 punto 8). | `403 LOCAL_ONLY` |
| 3 | **Reintento:** buscar un `PAYMENT` con ese `clientRequestId` (8.3). | `200` con `isReplay: true`, o `409 PAYMENT_REQUEST_ID_REUSED` |
| 4 | Bloquear el proveedor: `SELECT ... FROM suppliers WHERE id = :id FOR NO KEY UPDATE` (serializa todo lo que cambia su saldo: pagos, compras, anulaciones, ajustes). | `404 NOT_FOUND` |
| 5 | **Fecha** (H-61 a): `entryDate` = la mandada o **hoy** (fecha calendario de Buenos Aires). Futura → rechazar. Con `CASH_REGISTER`, si viene y no es hoy → rechazar (la plata sale de la caja abierta hoy). | `422 DATE_IN_FUTURE` / `422 PAYMENT_DATE_MUST_BE_TODAY` |
| 6 | Con `CASH_REGISTER`: caja abierta con `FOR SHARE` (`caja.md` 6). | `422 CASH_SESSION_REQUIRED` |
| 7 | **Pago mayor que la deuda** (H-56 c): `saldo actual − amount < 0` y no vino `confirmOverpayment: true` → rechazar sin guardar. Con la confirmación, se guarda y el saldo queda a favor del kiosco. | `422 PAYMENT_EXCEEDS_BALANCE`, `details: { "balance": "25300.00", "amount": "30000.00", "balanceAfter": "-4700.00" }` |
| 8 | Crear `SupplierAccountEntry` `PAYMENT` con `amount = −amount`, `paymentSource`, `entryDate`, `reference`, `description`, `clientRequestId`, `requestHash`, `userId`. | — |
| 9 | Con `CASH_REGISTER`: crear `CashMovement` `OUT` / `SUPPLIER_PAYMENT` por `amount`, en la caja abierta, con `supplierAccountEntryId` y `description` = "Pago a proveedor: <nombre>" (o la descripción del pago si vino). | — |
| 10 | Auditar `SUPPLIER_PAYMENT`. | — |

- **No se controla que haya efectivo suficiente** en la caja (como la devolución por anulación y H-53): la diferencia aparece en el arqueo.
- Los pagos **no se editan ni se anulan**: un error se corrige con un **ajuste** del dueño (sección 10). Si el pago fue con efectivo de la caja, además, la plata se devuelve al cajón con un ingreso a mano `OTHER` (`caja.md` 11). Esto es lo que dicen los documentos aprobados (no hay requisito de anular pagos); si hiciera falta, es una pregunta nueva.
- **No confundir con la devolución del proveedor** (sección 15): la devolución es plata que el proveedor **de verdad** le devuelve al kiosco (por ejemplo, después de anular una compra pagada); el ajuste + ingreso `OTHER` es para corregir un pago **mal cargado** en el sistema.

### 8.3 Reintentos: `clientRequestId` (decisión técnica, igual que las ventas)

Un pago repetido por un doble clic o un reintento con WiFi cortado bajaría la deuda dos veces (y, con efectivo de la caja, sacaría plata dos veces del arqueo). Como no se puede anular un pago, se usa el **mismo mecanismo de las ventas** (`ventas.md` 2.4): la pantalla genera un UUID por formulario (`newClientRequestId()` de `shared`), el servidor guarda `clientRequestId` (único) y la huella `requestHash` en el movimiento. Mismo id y mismo cuerpo y usuario → `200` con el mismo pago e `isReplay: true` (sin crear nada ni auditar); otro cuerpo u otro usuario → `409 PAYMENT_REQUEST_ID_REUSED` con `details: { entryId, createdAt }`. **Contra:** dos columnas más en la tabla (nulas en los movimientos que no son pagos sueltos ni devoluciones).

- **Desde el cierre de la etapa 5** la columna `clientRequestId` también la usan las **devoluciones** (sección 15.5). El reintento de un pago tiene que exigir además `type = 'PAYMENT'` (un id que ya usó una devolución → `409 PAYMENT_REQUEST_ID_REUSED`), y la huella del pago y la de la devolución llevan un campo `kind` distinto (`"PAYMENT"` / `"REFUND"`), así nunca coinciden.

- **Response 201** (nuevo) o **200** (reintento): `SupplierPaymentResponseSchema`.
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; `amount` 0 o negativo; campo desconocido. |
| `403` | `FORBIDDEN` | Empleado. |
| `403` | `LOCAL_ONLY` | `CASH_REGISTER` desde la puerta remota. |
| `404` | `NOT_FOUND` | El proveedor no existe. |
| `409` | `PAYMENT_REQUEST_ID_REUSED` | 8.3. |
| `422` | `DATE_IN_FUTURE` / `PAYMENT_DATE_MUST_BE_TODAY` | Paso 5. |
| `422` | `CASH_SESSION_REQUIRED` | `CASH_REGISTER` sin caja abierta. |
| `422` | `PAYMENT_EXCEEDS_BALANCE` | Paso 7, sin confirmar. |

- **Auditoría:** `SUPPLIER_PAYMENT`, `entityType` `Supplier`, `entityId` = proveedor, `details: { entryId, amount, source, entryDate, reference, purchaseId: null, cashMovementId, cashSessionId, balanceBefore, balanceAfter, confirmedOverpayment }`. **Cubre también la salida de caja** (NF-08 "salidas de caja"): no se escribe un `CASH_MOVEMENT_OUT` aparte (igual que `SALE_VOID`).
- **Ejemplo** (paso 4 de "Cómo probarlo", con efectivo de la caja):

```json
{ "clientRequestId": "6f1d2b9e-3c4a-4f7e-9d21-0a5b8c7e1f22", "amount": "5000", "source": "CASH_REGISTER" }
```

```json
{
  "entry": { "id": 12, "supplierId": 3, "type": "PAYMENT", "amount": "-5000.00", "entryDate": "2026-11-27",
             "balanceAfter": "25300.00", "purchase": null, "paymentSource": "CASH_REGISTER", "reference": null,
             "description": null, "cashMovement": { "id": 95, "cashSessionId": 9 },
             "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T15:10:00.000Z" },
  "balance": "25300.00",
  "cashMovement": { "id": 95, "cashSessionId": 9, "direction": "OUT", "reason": "SUPPLIER_PAYMENT",
                    "description": "Pago a proveedor: Distribuidora Sur", "amount": "5000.00",
                    "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T15:10:00.000Z",
                    "sale": null, "supplierAccountEntryId": 12, "supplier": { "id": 3, "name": "Distribuidora Sur" } },
  "isReplay": false
}
```

El mismo pago con `"source": "BANK_TRANSFER"` devuelve `cashMovement: null` y no aparece en la caja.

**Cambio en `caja.md` (solo agrega un campo):** `CashMovementSchema` suma `supplier: { id; name } | null` (en `SUPPLIER_PAYMENT`, el proveedor del pago), para que el detalle de la caja diga a quién se pagó. `supplierAccountEntryId` deja de ser siempre `null`. `SUPPLIER_PAYMENT` sigue sin poder cargarse a mano (`caja.md` 11.2).

## 9. `POST /api/suppliers/:id/opening-balance` — Saldo inicial

Decisión aprobada (plan 5, punto 5): **un movimiento de saldo inicial por proveedor al instalar**. Es lo que el kiosco ya le debía (o lo que el proveedor le debía) cuando se empieza a usar el sistema.

- **Roles:** **OWNER** (H-62 a, y la decisión del plan 5 punto 5). **Acceso:** `any` (no mueve la caja).
- **Request:** `CreateOpeningBalanceRequestSchema`. `amount` con signo y ≠ 0 (H-62 a: los dos signos). `entryDate` no futura (`422 DATE_IN_FUTURE`): la fecha a la que corresponde el saldo (ej.: el día de la instalación).
- **Uno por proveedor:** el índice único parcial `(supplier_id) WHERE type = 'OPENING_BALANCE'` lo garantiza; un segundo → `409 OPENING_BALANCE_EXISTS` (se traduce el `P2002`). Si se cargó mal, se corrige con un **ajuste** (sección 10), no se reemplaza.
- Se puede cargar aunque el proveedor ya tenga otros movimientos (por ejemplo, si se dio de alta y se le cargó una compra antes de pasar la deuda vieja); `balanceAfter` lo ordena por su `entryDate`.
- Bloquea el proveedor como el pago (8.2 paso 4). Proveedor desactivado: se permite (H-59).
- **Response 201:** `SupplierEntryResponseSchema`.
- **Errores:** `400`, `403 FORBIDDEN` (encargado o empleado), `404`, `409 OPENING_BALANCE_EXISTS`, `422 DATE_IN_FUTURE`.
- **Auditoría:** `SUPPLIER_OPENING_BALANCE`, `entityType` `Supplier`, `details: { entryId, amount, entryDate, description }`.

## 10. `POST /api/suppliers/:id/adjustments` — Corrección con motivo

Decisión aprobada: **correcciones manuales con motivo, solo el dueño** (`ADJUSTMENT` del modelo). Sirven para corregir un saldo inicial mal cargado, un pago cargado dos veces, una nota de crédito del proveedor, un redondeo, etc.

- **Roles:** **OWNER**. **Acceso:** `any` (no mueve la caja; si el error también movió efectivo de la caja, eso se corrige aparte en la caja, en el local).
- **Request:** `CreateAccountAdjustmentRequestSchema`. `reason` obligatorio (1 a 200): se guarda en `description` (`CHECK` del modelo). `amount` con signo, ≠ 0. `entryDate` default hoy, no futura.
- No hay control de "pago mayor que la deuda": el dueño está corrigiendo la realidad; el saldo puede quedar con cualquier signo.
- Bloquea el proveedor (8.2 paso 4). Proveedor desactivado: se permite.
- **Response 201:** `SupplierEntryResponseSchema`.
- **Errores:** `400` (sin motivo, `amount` 0), `403 FORBIDDEN`, `404`, `422 DATE_IN_FUTURE`.
- **Auditoría:** `SUPPLIER_ACCOUNT_ADJUST`, `entityType` `Supplier`, `details: { entryId, amount, reason, entryDate, balanceBefore, balanceAfter }`.
- **Ejemplo:** `{ "amount": "-1500", "reason": "Nota de crédito 0003-00000456 por mercadería vencida" }`.

## 11. `GET /api/suppliers/:id/suggested-order` — Pedido sugerido (PRV-05, PA-26, H-08, H-12)

### 11.1 Qué lista

- **Roles:** OWNER, MANAGER. **Acceso:** `any` (abrir WhatsApp necesita internet, NF-02; armar la lista, no).
- Productos con `defaultSupplierId = :id`, **activos**, que no son "Varios", con **`stockQuantity <= minStock`** (PA-26, STK-06), **también con mínimo 0** (H-30: con stock 0 o negativo aparecen). Es la misma condición que "Para reponer" (`productos-stock.md` 8.3) filtrada por proveedor.
- Orden: nombre (como el resto de las listas). Sin paginar: un proveedor tiene decenas de productos. Tope técnico de 500 (`isTruncated: true` si había más; en la práctica no pasa).
- Proveedor desactivado: se puede pedir igual (solo lectura).
- **No se guarda nada** (H-12 a, aprobada; D15): no hay tabla de pedidos ni auditoría. Si el proveedor no tiene productos para reponer: `items: []`, `text` con el encabezado solo y `whatsappUrl` igual (la pantalla muestra "No hay nada para reponer de este proveedor" y deshabilita los botones).

### 11.2 Cantidad sugerida

`suggestedQuantity = max(minStock − stockQuantity, 1)`: **lo que falta para llegar al mínimo** (PA-26) y **al menos 1** cuando el stock es igual al mínimo (H-08 b, aprobada). Función `suggestedOrderQuantity(stock, min)` de `shared`. El "al menos 1" no se aplica en "Para reponer" (ahí `shortfall` puede ser 0), solo en el pedido.

| Caso | Stock | Mínimo | `shortfall` | `suggestedQuantity` |
|---|---:|---:|---:|---:|
| Por debajo del mínimo (test del plan) | 3 | 10 | 7 | **7** |
| Stock igual al mínimo (H-08 b, test del plan) | 10 | 10 | 0 | **1** |
| Stock negativo (test del plan; R2) | −2 | 10 | 12 | **12** |
| Mínimo 0 y stock 0 (H-30) | 0 | 0 | 0 | **1** |
| Mínimo 0 y stock negativo | −3 | 0 | 3 | **3** |
| Por peso (KG) | 0,750 kg | 2 kg | 1,250 | **1,250** (kg, 3 decimales) |
| Por peso, igual al mínimo | 2 kg | 2 kg | 0 | **1,000** (el "al menos 1" de H-08 vale también en kg) |
| Stock 11, mínimo 10 | 11 | 10 | — | **no aparece** (stock > mínimo) |

**La cantidad se puede cambiar** (PRV-05, PA-26): la cambia la pantalla, no el servidor. Una línea con 0 queda **fuera** del texto. No se agregan productos que no estén en la lista (PRV-05 habla de "los productos con stock ≤ mínimo").

### 11.3 Texto y link de WhatsApp

Dos funciones de `shared` arman el texto y el link; el servidor las usa para la respuesta (con las cantidades sugeridas) y la pantalla las vuelve a usar cada vez que el usuario cambia una cantidad (así "Copiar" y "Abrir WhatsApp" siempre llevan lo que se ve):

| Función | Qué hace |
|---|---|
| `buildSupplierOrderText({ storeName, supplierName, lines: { name, saleUnit, quantity }[] })` | Arma el texto (formato abajo). Omite las líneas con cantidad 0. Cantidades en es-AR: por unidad sin decimales; por peso con hasta 3 decimales sin ceros de más y "kg". |
| `buildWhatsAppUrl(whatsappPhone, text)` | `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}`. Si `whatsappPhone` es `null` → `null` (la pantalla muestra solo "Copiar" y "Cargá el teléfono del proveedor para enviarlo por WhatsApp"). |

Formato del texto (sin datos de precios ni costos):

```
Hola, Distribuidora Sur. Pedido de Kiosco La Esquina:
- 7 x Coca-Cola 500 ml
- 1 x Alfajor Jorgito
- 12 x Agua mineral 1,5 l
- 1,25 kg x Queso de máquina
Gracias.
```

- Link de ese ejemplo (con `whatsappPhone` `5491123456789`): `https://wa.me/5491123456789?text=Hola%2C%20Distribuidora%20Sur.%20Pedido%20de%20Kiosco%20La%20Esquina%3A%0A-%207%20x%20Coca-Cola%20500%20ml%0A...` (los saltos de línea van como `%0A`).
- El link solo abre WhatsApp con el texto escrito; **el usuario lo envía** desde su teléfono. El sistema no manda mensajes ni usa ninguna API.
- Un texto muy largo (cientos de líneas) puede no entrar en el link en algunos navegadores; "Copiar" funciona siempre. La pantalla lo avisa si el link pasa de ~4.000 caracteres.
- **Response 200:** `SuggestedOrderResponseSchema`.
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.
- **Ejemplo** (paso 5 de "Cómo probarlo"):

```json
{
  "supplier": { "id": 3, "name": "Distribuidora Sur", "isActive": true, "whatsappPhone": "5491123456789" },
  "storeName": "Kiosco La Esquina",
  "items": [
    { "productId": 12, "name": "Coca-Cola 500 ml", "barcode": "7790895000997", "saleUnit": "UNIT",
      "stockQuantity": "3.000", "minStock": "10.000", "shortfall": "7.000", "suggestedQuantity": "7.000",
      "unitsPerPack": "12.000" },
    { "productId": 30, "name": "Alfajor Jorgito", "barcode": null, "saleUnit": "UNIT",
      "stockQuantity": "10.000", "minStock": "10.000", "shortfall": "0.000", "suggestedQuantity": "1.000",
      "unitsPerPack": null }
  ],
  "isTruncated": false,
  "text": "Hola, Distribuidora Sur. Pedido de Kiosco La Esquina:\n- 7 x Coca-Cola 500 ml\n- 1 x Alfajor Jorgito\nGracias.",
  "whatsappUrl": "https://wa.me/5491123456789?text=Hola%2C%20Distribuidora%20Sur.%20Pedido%20de%20Kiosco%20La%20Esquina%3A%0A-%207%20x%20Coca-Cola%20500%20ml%0A-%201%20x%20Alfajor%20Jorgito%0AGracias."
}
```

## 12. Códigos de error y acciones de auditoría nuevos

Van a `ERROR_CODES` en `shared` (junto con los de `compras.md` 10).

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `SUPPLIER_NAME_TAKEN` | Ya existe un proveedor con ese nombre. |
| 422 | `SUPPLIER_TAX_ID_DUPLICATE` | Otro proveedor ya tiene ese CUIT. Confirmá si es correcto. (H-58) |
| 422 | `SUPPLIER_NOT_FOUND` | El proveedor no existe. (Cuando viene en el cuerpo; en la ruta es `404`.) |
| 422 | `SUPPLIER_INACTIVE` | El proveedor está desactivado. |
| 409 | `PAYMENT_REQUEST_ID_REUSED` | Ese pago ya se había registrado. Revisá la cuenta corriente antes de cargarlo de nuevo. |
| 422 | `PAYMENT_EXCEEDS_BALANCE` | El pago es mayor que lo que se le debe: el proveedor quedaría con saldo a favor del kiosco. Confirmá para guardarlo. (H-56) |
| 422 | `PAYMENT_DATE_MUST_BE_TODAY` | Un pago con efectivo de la caja es de hoy. |
| 422 | `DATE_IN_FUTURE` | La fecha no puede ser posterior a hoy. |
| 409 | `OPENING_BALANCE_EXISTS` | Este proveedor ya tiene saldo inicial. Para corregirlo, cargá un ajuste. |
| 409 | `REFUND_REQUEST_ID_REUSED` | Esa devolución ya se había registrado. Revisá la cuenta corriente antes de cargarla de nuevo. (Sección 15.5) |
| 422 | `REFUND_EXCEEDS_CREDIT` | La devolución es mayor que el saldo a favor del kiosco: después le deberías plata al proveedor. Confirmá para guardarla. (Sección 15.4 paso 7; ⏳ H-68 b) |
| 422 | `REFUND_DATE_MUST_BE_TODAY` | Una devolución en efectivo que entra a la caja es de hoy. (Sección 15.4 paso 5) |

Se usan también los existentes `VALIDATION_ERROR`, `FORBIDDEN`, `LOCAL_ONLY`, `NOT_FOUND`, `CASH_SESSION_REQUIRED`, `PRODUCT_NOT_FOUND`, `MISC_PRODUCT_LOCKED`, `DATE_IN_FUTURE`.

Acciones de auditoría nuevas: `SUPPLIER_CREATE`, `SUPPLIER_UPDATE`, `PRODUCT_SUPPLIER_ASSIGN`, `SUPPLIER_OPENING_BALANCE`, `SUPPLIER_ACCOUNT_ADJUST` y, desde el cierre de la etapa 5, **`SUPPLIER_REFUND`** (sección 15.6; cubre también el ingreso de caja, como `SUPPLIER_PAYMENT` cubre la salida). `SUPPLIER_PAYMENT` ya estaba en el modelo 2.21. Todas en la misma transacción que la acción (README 8).

## 13. Notas para los demás agentes

- **base-datos:** ver `modelo-datos.md` 2.6, 2.7, 2.13 y 2.20 (cambios de la etapa 5 resumidos en `compras.md` 11): `Supplier` con nombre único sin mayúsculas, `phone` de 10 dígitos, `Weekday[]`; `Product.defaultSupplierId` con FK e índice y `CHECK` de "Varios"; `SupplierAccountEntry` con `OPENING_BALANCE`, `clientRequestId`/`requestHash`, sus `CHECK`s e índices únicos parciales; FK de `cash_movements.supplier_account_entry_id`. Seed: 2 o 3 proveedores de ejemplo (uno con WhatsApp y días de visita) y algunos productos con habitual.
- **backend:** esquemas y funciones de `shared` (`suppliers/`): `normalizeArPhone`, `formatArPhone`, `isValidCuit`, `suggestedOrderQuantity`, `buildSupplierOrderText`, `buildWhatsAppUrl`, con tests. Saldo siempre con `SUM` en SQL (nunca sumando en JS con `number`). El control de `CASH_REGISTER` desde afuera va en el servicio (paso 2 de 8.2) y lo usa también la compra. Lock del proveedor (8.2 paso 4) antes que la caja y que los productos. Un `ACCESS_DENIED` por servicio usa el mismo `writeAuditThrottled` que `requireLocal`.
- **frontend (`/impeccable`):** el teléfono muestra en vivo cómo queda (`normalizeArPhone` + `formatArPhone`) y el mensaje de 4; el pago ofrece los 4 orígenes con una explicación corta ("sale del cajón" / "no toca la caja") y oculta "efectivo de la caja" si `GET /api/auth/me` dice `REMOTE`; ante `422 PAYMENT_EXCEEDS_BALANCE` pide confirmar mostrando el saldo que quedaría; el pedido sugerido permite cambiar cantidades y recalcula texto y link con las funciones de `shared`; botones "Copiar" y "Abrir WhatsApp" (`target="_blank"`, `rel="noopener noreferrer"`). Saldo inicial y ajustes solo se muestran al dueño.
- **qa:** unitarios de 4 (tabla) y de 11.2 (tabla); integración: el saldo es la suma de los movimientos (con saldo inicial, compra, anulación, pagos y ajuste); un pago con transferencia no toca la caja; con efectivo de la caja crea la salida y entra en el esperado del cierre; `CASH_REGISTER` desde la puerta remota → `403 LOCAL_ONLY` (y transferencia desde la remota → `201`); sin caja → `422`; doble pago con el mismo `clientRequestId` → un solo movimiento; encargado con saldo inicial o ajuste → `403`; segundo saldo inicial → `409`; empleado → `403` en todo; el empleado no recibe `defaultSupplier` en productos; `balanceAfter` correcto con filtros y páginas.
- **seguridad:** el bloqueo remoto de `CASH_REGISTER` (también en "pagar ahora" y en la devolución del proveedor), la auditoría de pagos, devoluciones, saldos iniciales y ajustes, que el empleado no vea nada de proveedores, y que el texto del pedido no lleve costos.
- **Devolución del proveedor (cierre de la etapa 5):** las notas para cada agente están en la sección 15 (15.7 base-datos, 15.8 shared y backend, 15.9 frontend, 15.10 qa).

## 14. Decisiones del dueño (2026-11-26)

Las preguntas de la etapa 5 (H-54 a H-64, `compras.md` 12 y `requisitos.md` 7.9) se resolvieron aceptando todas las recomendaciones. Las que tocan este documento:

| H | Decisión | Dónde |
|---|---|---|
| H-56 | Un pago **puede superar la deuda**, con confirmación explícita (`confirmOverpayment`; si no, `422 PAYMENT_EXCEEDS_BALANCE`). | 8.2 paso 7 |
| H-58 | **Dos proveedores pueden tener el mismo CUIT**, con confirmación (`confirmDuplicateTaxId`; si no, `422 SUPPLIER_TAX_ID_DUPLICATE`). | 5.3, 5.4 |
| H-59 | Un proveedor **se desactiva aunque tenga saldo o productos**; los conserva; no recibe compras nuevas ni se asigna a productos, sí pagos, saldo inicial y ajustes; lo reactivan encargado y dueño. | 5.4, 6.2, 9, 10 |
| H-61 | Fechas pasadas sí, futuras no (por defecto hoy); el pago con efectivo de la caja es siempre de hoy. | 8.2 paso 5, 9, 10 |
| H-62 | El **saldo inicial** lo carga **solo el dueño**, positivo o negativo; uno por proveedor. | 9 |

Ya estaba aprobado (plan, sección 5 punto 5): saldo inicial al instalar y correcciones con motivo, solo el dueño.

### 14.1 Decisiones del dueño (2026-11-27, cierre de la etapa 5)

| H | Decisión | Dónde |
|---|---|---|
| H-65 | **Devolución de plata del proveedor** (por ejemplo, después de anular una compra pagada): **a)** un movimiento "Devolución del proveedor" que, **en un solo paso, suma a la caja y baja el saldo a favor del kiosco** en la cuenta corriente. Descartadas: b) dos pasos a mano (ajuste del dueño + ingreso "Otro" en la caja); c) no registrarlo. | 15 |
| H-66 | **Fotos en una compra anulada:** **a)** se pueden **agregar y borrar** (son documentación, por ejemplo la nota de crédito del proveedor). Ya funcionaba así. | `compras.md` 7, 8.1 y 8.4 |

Los detalles de la devolución que no decidió (H-67 a H-71) están en la sección 16, **pendientes**.

## 15. `POST /api/suppliers/:id/refunds` — Devolución del proveedor (H-65, PRV-07)

> **Decidido por el dueño (H-65 a, 2026-11-27):** la plata que el proveedor le devuelve al kiosco se registra con **un solo movimiento** que suma a la caja y baja el saldo a favor.
> **Pendiente de aprobación:** H-67 a H-71 (sección 16). Este contrato está escrito con **la recomendación de cada una**; lo marcado con ⏳ cambia si el dueño elige otra opción (la sección 16 dice qué cambia).

### 15.1 Qué es y por qué un tipo nuevo (decisión técnica)

Es la **contracara del pago** (sección 8): el pago saca plata y baja la deuda (`PAYMENT`, `−`); la devolución trae plata y baja el saldo a favor del kiosco (`REFUND`, `+`, 7.1). El caso típico es el ejemplo G de `compras.md`: se anula una compra que ya estaba pagada, el proveedor queda debiéndole $ 15.000 al kiosco y un día los devuelve en efectivo.

| Opción | Pros | Contras |
|---|---|---|
| **Tipo nuevo `REFUND` + motivo de caja nuevo `SUPPLIER_REFUND` (elegida)** | Un paso; la caja y la cuenta corriente **siempre coinciden** (cada ingreso `SUPPLIER_REFUND` tiene su movimiento de cuenta, como `SUPPLIER_PAYMENT`, `caja.md` 11.2); el arqueo cuadra solo; el estado de cuenta dice "Devolución del proveedor". | Dos valores de enum nuevos y cinco `CHECK`s a reescribir (tres de la cuenta, dos de la caja) (15.7). |
| Reusar `ADJUSTMENT` | Sin enum nuevo en la cuenta. | Es solo del dueño, no toca la caja y es "corregir un error", no "entró plata": habría que hacer el ingreso de caja aparte (es la opción b descartada por el dueño). |
| `PAYMENT` con monto positivo | Sin tipo nuevo. | Rompe el `CHECK` del pago (`amount < 0`) y mezcla dos sentidos en un tipo: confunde el estado de cuenta y el reporte de deuda (REP-06). |

### 15.2 Ruta, acceso y roles

- **Sesión:** sí. Lleva `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **Acceso:** `any`; **con `source = CASH_REGISTER`, solo en el local** → desde la puerta remota `403 LOCAL_ONLY`, auditado como `ACCESS_DENIED` con el límite de 1 por minuto (mismo control y misma función que el pago, sección 1 (*); CAJ-09 y ADR 003 punto 6: desde afuera no se registran movimientos de caja). ⏳ **H-67:** con a) (solo a la caja), la ruta se declara `access: 'local'` y listo.
- **Roles:** OWNER y MANAGER (⏳ **H-70 a**, como los pagos, PRV-06). EMPLOYEE → `403 FORBIDDEN` (matriz: proveedores ❌). **Rol antes que puerta.**
- **Proveedor desactivado:** se permite (⏳ **H-70 a**, como los pagos, H-59: sirve para dejar la cuenta en 0).
- **No hay rutas para editar, anular ni borrar** una devolución (⏳ **H-71 a**, igual que los pagos, 8.2): una devolución mal cargada se corrige con un **ajuste** del dueño (sección 10) y, si entró a la caja, con una **salida a mano** `OTHER` en la caja abierta (`caja.md` 11).

### 15.3 Request

`CreateSupplierRefundRequestSchema` (sección 3.3, estricto: campo desconocido → `400`).

| Campo | Regla |
|---|---|
| `clientRequestId` | UUID generado por el formulario (`newClientRequestId()` de `shared`). Obligatorio (15.5). |
| `amount` | `PositiveMoneyInputSchema`: string, > 0, hasta 2 decimales, tope de 9 enteros. **Nunca número de JSON.** Se guarda **positivo** en la cuenta y en la caja. |
| `source` | `SupplierPaymentSourceSchema` (⏳ **H-67 b**: los 4 orígenes). Con H-67 a), el esquema solo acepta `"CASH_REGISTER"` (otro → `400`). |
| `entryDate` | `YYYY-MM-DD`, opcional; default **hoy** (fecha calendario de Buenos Aires). No futura. Con `CASH_REGISTER`, **solo hoy** (la plata entra a la caja abierta hoy). Para los otros orígenes, cualquier fecha pasada (⏳ H-67 b, como H-61 para los pagos). |
| `reference` | `PaymentReferenceSchema` (hasta 100): número de nota de crédito, de transferencia, etc. |
| `description` | `EntryDescriptionSchema` (hasta 200). Ej.: "Devuelve lo pagado de la compra #22 (anulada)". |
| `confirmExceedsCredit` | Opcional. ⏳ **H-68 b**: confirma una devolución mayor que el saldo a favor (15.4 paso 7). |

**No acepta `purchaseId`** (⏳ **H-69 a**: la devolución es suelta; si viene → `400`). El saldo a favor puede salir de varias cosas (una o varias compras anuladas, un pago de más con H-56, un saldo inicial negativo), y lo que importa es el saldo. La pantalla puede precargar la descripción con el número de compra.

Ejemplo (sigue al ejemplo G de `compras.md`):

```json
{ "clientRequestId": "0c9e7a51-2b3d-4c8e-a6f1-7d2e9b4c1a03", "amount": "15000", "source": "CASH_REGISTER",
  "description": "Devuelve lo pagado de la compra #22 (anulada)" }
```

### 15.4 Qué hace, en este orden (una transacción)

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod (`:id` entero positivo y el cuerpo, 15.3). | `400 VALIDATION_ERROR` |
| 2 | Si `source = CASH_REGISTER` y el pedido viene por la puerta remota → rechazar y auditar `ACCESS_DENIED` (límite de 1 por minuto, ADR 003 punto 8). **Antes** de leer nada de la base. | `403 LOCAL_ONLY` |
| 3 | **Reintento:** buscar un movimiento con ese `clientRequestId` (15.5). | `200` con `isReplay: true`, o `409 REFUND_REQUEST_ID_REUSED` |
| 4 | Bloquear el proveedor: `SELECT ... FROM suppliers WHERE id = :id FOR NO KEY UPDATE` (8.2 paso 4: serializa todo lo que cambia su saldo). Desactivado: se permite (⏳ H-70 a). | `404 NOT_FOUND` |
| 5 | **Fecha:** `entryDate` = la mandada o hoy. Futura → rechazar. Con `CASH_REGISTER`, si viene y no es hoy → rechazar. | `422 DATE_IN_FUTURE` / `422 REFUND_DATE_MUST_BE_TODAY` |
| 6 | Con `CASH_REGISTER`: caja abierta con `FOR SHARE` (`caja.md` 6). Sin caja abierta → rechazar (H-47 a: sin caja abierta no hay movimientos de caja). | `422 CASH_SESSION_REQUIRED` |
| 7 | **Devolución mayor que el saldo a favor** (⏳ H-68 b): con `checkSupplierRefund({ balance, amount })` de `shared` (15.8): `credit = max(0, −saldo)`; si `amount > credit` y no vino `confirmExceedsCredit: true` → rechazar sin guardar. Incluye el caso de **saldo 0 o con deuda** (`credit = 0`). Con la confirmación se guarda y el saldo queda en `saldo + amount`. | `422 REFUND_EXCEEDS_CREDIT`, `details: { "balance": "-15000.00", "credit": "15000.00", "amount": "20000.00", "balanceAfter": "5000.00" }` |
| 8 | Crear `SupplierAccountEntry` `REFUND` con `amount = +amount`, `paymentSource = source`, `entryDate`, `reference`, `description`, `clientRequestId`, `requestHash`, `userId`, `purchaseId = null`. | Choque de `clientRequestId` (`P2002`, dos pedidos a la vez) → deshacer y responder como el paso 3 |
| 9 | Con `CASH_REGISTER`: crear `CashMovement` **`IN` / `SUPPLIER_REFUND`** por `amount`, en la caja abierta, con `supplierAccountEntryId` = el `REFUND` y `description` = "Devolución del proveedor: <nombre>" (o la descripción de la devolución si vino). | — |
| 10 | Auditar `SUPPLIER_REFUND` (15.6). | — |

- **Orden de bloqueos:** proveedor → caja (`FOR SHARE`), el mismo del pago y de la compra (`compras.md` 5.2). El cierre de caja espera a la devolución en curso o la devolución ve la caja cerrada (`422`), nunca queda un ingreso en una caja cerrada (`caja.md` 6).
- **Saldo siempre con `SUM` en SQL** (8, nota para backend), nunca sumando en JS con `number`.
- **El esperado del arqueo sube solo:** el ingreso entra en `cashIn` como cualquier `IN` (`caja.md` 9.1). No hace falta tocar el cálculo.

### 15.5 Reintentos: `clientRequestId` (decisión técnica, igual que el pago)

Una devolución repetida por un doble clic o un WiFi cortado bajaría dos veces el saldo a favor y, con efectivo, sumaría dos veces la plata al esperado (aparecería un faltante falso en el arqueo). Como no se anula (⏳ H-71 a), se usa el mismo mecanismo que el pago (8.3), **en la misma columna** `clientRequestId` (única en toda la tabla):

- Mismo id, `type = 'REFUND'`, mismo proveedor, mismo cuerpo (huella `requestHash` con `kind: "REFUND"` y los números normalizados) y mismo usuario → `200` con la **misma** devolución e `isReplay: true`, sin crear ni auditar nada.
- Cualquier otra cosa (otro cuerpo, otro usuario, otro proveedor, o un id que ya usó un **pago**) → `409 REFUND_REQUEST_ID_REUSED` con `details: { entryId, createdAt }`.
- `confirmExceedsCredit` **no** entra en la huella (como `confirmOverpayment`): el primer intento sin confirmar da `422` y no guarda nada; el segundo, con la confirmación y el mismo id, crea la devolución.
- La pantalla genera el id al abrir el formulario y lo renueva solo después de un `201`/`200`.

### 15.6 Respuesta, errores y auditoría

- **Response 201** (nueva) o **200** (reintento): `SupplierRefundResponseSchema` (3.2).
- **Errores:**

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; `amount` 0, negativo, con más de 2 decimales o como número de JSON; `source` inválido (con H-67 a, distinto de `CASH_REGISTER`); campo desconocido (`purchaseId`, `type`…). | `fields` |
| `403` | `FORBIDDEN` | Empleado (⏳ H-70: con b), también el encargado). | — |
| `403` | `LOCAL_ONLY` | `CASH_REGISTER` desde la puerta remota. | — |
| `404` | `NOT_FOUND` | El proveedor no existe. | — |
| `409` | `REFUND_REQUEST_ID_REUSED` | 15.5. | `{ entryId, createdAt }` |
| `422` | `DATE_IN_FUTURE` / `REFUND_DATE_MUST_BE_TODAY` | Paso 5. | — |
| `422` | `CASH_SESSION_REQUIRED` | `CASH_REGISTER` sin caja abierta. | — |
| `422` | `REFUND_EXCEEDS_CREDIT` | Paso 7, sin confirmar (⏳ H-68: con a), no se puede confirmar: siempre `422`). | `{ balance, credit, amount, balanceAfter }` |

- **Auditoría:** `SUPPLIER_REFUND`, `entityType` `Supplier`, `entityId` = proveedor, `details: { entryId, amount, source, entryDate, reference, description, cashMovementId, cashSessionId, balanceBefore, balanceAfter, confirmedExceedsCredit }`. **Cubre también el ingreso de caja** (NF-08): no se escribe un `CASH_MOVEMENT_IN` aparte (igual que `SUPPLIER_PAYMENT` con la salida). Con `channel` `REMOTE` si se registró desde afuera (solo orígenes que no tocan la caja).
- **Ejemplo de respuesta** (el pedido de 15.3; números en 15.11):

```json
{
  "entry": { "id": 14, "supplierId": 3, "type": "REFUND", "amount": "15000.00", "entryDate": "2026-11-27",
             "balanceAfter": "0.00", "purchase": null, "paymentSource": "CASH_REGISTER", "reference": null,
             "description": "Devuelve lo pagado de la compra #22 (anulada)",
             "cashMovement": { "id": 96, "cashSessionId": 9 },
             "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T16:30:00.000Z" },
  "balance": "0.00",
  "cashMovement": { "id": 96, "cashSessionId": 9, "direction": "IN", "reason": "SUPPLIER_REFUND",
                    "description": "Devuelve lo pagado de la compra #22 (anulada)", "amount": "15000.00",
                    "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T16:30:00.000Z",
                    "sale": null, "supplierAccountEntryId": 14, "supplier": { "id": 3, "name": "Distribuidora Sur" } },
  "isReplay": false
}
```

La misma devolución con `"source": "BANK_TRANSFER"` (⏳ H-67 b) devuelve `cashMovement: null`, `entry.cashMovement: null` y no aparece en la caja.

### 15.7 Cambios de esquema y migración (para `base-datos`)

**Prisma (`schema.prisma`):**

| Dónde | Cambio |
|---|---|
| `enum SupplierEntryType` | **Agregar** `REFUND` (comentario: "Devolución del proveedor: + baja el saldo a favor del kiosco (H-65)"). |
| `enum CashMovementReason` | **Agregar** `SUPPLIER_REFUND` (comentario: "Ingreso por devolución del proveedor; lo crea solo `POST /api/suppliers/:id/refunds` (H-65)"). |
| `SupplierAccountEntry` | Solo comentarios: `paymentSource` "en pagos y devoluciones"; `clientRequestId` "en pagos sueltos y devoluciones". Sin columnas nuevas. |
| `CashMovement` | Solo comentario: `supplierAccountEntryId` "si es un pago a proveedor **o una devolución del proveedor**". Sin columnas ni índices nuevos (el `UNIQUE(supplier_account_entry_id)` ya garantiza un solo ingreso por devolución). |

**Dos migraciones** (decisión técnica): PostgreSQL no deja **usar** un valor de enum recién agregado dentro de la misma transacción en que se agregó (error `55P04`, "unsafe use of new value"), y los `CHECK` nuevos lo nombran. Por eso:

1. `..._supplier_refund_enums` (la genera Prisma): `ALTER TYPE "supplier_entry_type" ADD VALUE 'REFUND';` y `ALTER TYPE "cash_movement_reason" ADD VALUE 'SUPPLIER_REFUND';`.
2. `..._supplier_refund_checks` (**a mano**): reemplazar cinco `CHECK`s (tres de `supplier_account_entries` y dos de `cash_movements`) (`DROP CONSTRAINT` + `ADD CONSTRAINT` con el **mismo nombre**):

```sql
-- ---- supplier_account_entries ---------------------------------------------
-- Signo por tipo: la devolución SUMA (baja el saldo a favor), siempre con origen y sin compra (⏳ H-69 a).
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_amount_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_amount_check" CHECK (
  "amount" <> 0
  AND CASE "type"
    WHEN 'PURCHASE'      THEN "amount" > 0 AND "purchase_id" IS NOT NULL
    WHEN 'PURCHASE_VOID' THEN "amount" < 0 AND "purchase_id" IS NOT NULL
    WHEN 'PAYMENT'       THEN "amount" < 0 AND "payment_source" IS NOT NULL
    WHEN 'REFUND'        THEN "amount" > 0 AND "payment_source" IS NOT NULL AND "purchase_id" IS NULL
    ELSE "purchase_id" IS NULL  -- OPENING_BALANCE y ADJUSTMENT no se vinculan a una compra
  END
);
-- El origen de la plata solo existe en pagos y devoluciones.
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_payment_source_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_payment_source_check"
  CHECK ("payment_source" IS NULL OR "type" IN ('PAYMENT', 'REFUND'));
-- Idempotencia: pagos sueltos y devoluciones; la devolución SIEMPRE lleva su id (solo la crea la ruta 15).
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_request_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_request_check" CHECK (
  ("client_request_id" IS NULL OR "type" IN ('PAYMENT', 'REFUND'))
  AND (("client_request_id" IS NULL) = ("request_hash" IS NULL))
  AND ("type" <> 'REFUND' OR "client_request_id" IS NOT NULL)
);

-- ---- cash_movements ---------------------------------------------------------
-- Sentido de cada motivo (PA-29 + H-65): la devolución del proveedor es un INGRESO vinculado a la cuenta corriente.
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_reason_direction_check";
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reason_direction_check" CHECK (
  ("reason" <> 'SUPPLIER_PAYMENT' OR ("direction" = 'OUT' AND "supplier_account_entry_id" IS NOT NULL))
  AND ("reason" <> 'SUPPLIER_REFUND' OR ("direction" = 'IN' AND "supplier_account_entry_id" IS NOT NULL))
  AND ("reason" <> 'SALE_VOID_REFUND' OR ("direction" = 'OUT' AND "sale_id" IS NOT NULL))
  AND ("reason" NOT IN ('OWNER_WITHDRAWAL', 'EXPENSE') OR "direction" = 'OUT')
  AND ("reason" <> 'CASH_CONTRIBUTION' OR "direction" = 'IN')
);
-- El vínculo con la cuenta corriente solo va con sus dos motivos.
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_supplier_link_check";
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_supplier_link_check"
  CHECK ("supplier_account_entry_id" IS NULL OR "reason" IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND'));
```

- ⏳ **Si H-67 = a)** (solo a la caja): sumar al `CASE` de `REFUND` `AND "payment_source" = 'CASH_REGISTER'`.
- **Lo que un `CHECK` no puede mirar** (otra tabla): que un `SUPPLIER_REFUND` apunte a un `REFUND` (y un `SUPPLIER_PAYMENT` a un `PAYMENT`), con el **mismo monto**, y que todo `REFUND` con `CASH_REGISTER` tenga su ingreso de caja. Lo garantiza el backend (misma transacción) y un test de integración (15.10). Sin trigger, igual que el pago.
- **Datos:** no hace falta migrar nada (todavía no hay datos reales). Un test por cada `CHECK` nuevo o cambiado (R8 del plan). Seed: no cambia.

### 15.8 `@kiosco/shared` y backend

**`shared`:**

| Dónde | Cambio |
|---|---|
| `enums.ts` | `SUPPLIER_ENTRY_TYPES` suma `'REFUND'`; `CASH_MOVEMENT_REASONS` suma `'SUPPLIER_REFUND'`. `MANUAL_CASH_REASON_DIRECTIONS` **no cambia** (es la lista de los que se cargan a mano: por eso `SUPPLIER_REFUND` a mano da `400` solo). |
| `suppliers/schemas.ts` | `CreateSupplierRefundRequestSchema` (`.strict()`, 15.3) y `SupplierRefundResponseSchema` (3.2). Los tipos `CreateSupplierRefundRequest` / `SupplierRefundResponse` con `z.infer`. |
| `suppliers/refund.ts` (nuevo) | `checkSupplierRefund({ balance, amount }) → { credit: Money, balanceAfter: SignedMoney, exceedsCredit: boolean }`, con `Decimal`: `credit = max(0, −balance)`, `balanceAfter = balance + amount`, `exceedsCredit = amount > credit`. La usan la pantalla (resumen en vivo y aviso antes de mandar) y el servidor (paso 7). Con tests (15.10). |
| `errors.ts` | `REFUND_REQUEST_ID_REUSED`, `REFUND_EXCEEDS_CREDIT`, `REFUND_DATE_MUST_BE_TODAY` (sección 12). |

**backend:**

- Ruta en el módulo de proveedores, `access: 'any'` (⏳ H-67), roles OWNER y MANAGER (⏳ H-70). Pasos de 15.4 en ese orden.
- **Reusar** lo del pago: el control remoto de `CASH_REGISTER` (misma función, mismo `writeAuditThrottled`), `lockSupplier`, la lectura de la caja abierta con `FOR SHARE`, la fecha de hoy, `supplierBalance` y el armado de la respuesta (`paymentResponse` sirve para los dos: la forma es la misma). Conviene un `createRefund` al lado de `createPayment`, no meter la devolución dentro del pago con un `if`.
- Huella `hashRefund` con `kind: 'REFUND'` (15.5); el reintento del **pago** pasa a exigir también `type = 'PAYMENT'` (8.3).
- `cash.mapper.ts`: `supplier` sale de `supplierAccountEntry.supplier` para `SUPPLIER_PAYMENT` **y** `SUPPLIER_REFUND` (ya funciona así; solo cambia el comentario).
- Cuenta corriente (`GET /:id/account`): sin cambios de lógica; el filtro `type=REFUND` funciona con el enum nuevo.

### 15.9 Qué tiene que mostrar la pantalla (para `frontend`, con `/impeccable`)

- **Etiquetas:** `REFUND` → "Devolución del proveedor" (cuenta corriente); `SUPPLIER_REFUND` → "Devolución del proveedor" (caja). Agregarlas en `lib/purchases/labels.ts` y `lib/cash/labels.ts`.
- **Detalle del proveedor:** si el saldo es **negativo**, destacar "Saldo a favor del kiosco: $ 15.000" y un botón **Registrar devolución** junto a "Registrar un pago". Con saldo 0 o con deuda el botón queda en un lugar secundario (⏳ H-68 b: se puede, con confirmación; con a), no se muestra). Solo encargado y dueño (⏳ H-70).
- **Formulario "Registrar devolución":**
  - **Monto**, precargado con el saldo a favor (si hay), editable.
  - **"¿Cómo te devolvió la plata?"** con los orígenes y una explicación corta: "Efectivo que entra a la caja (suma al arqueo)", "Efectivo que no va a la caja", "Transferencia", "Otro" (⏳ H-67 b). Si `GET /api/auth/me` dice `REMOTE`, **no** se ofrece "Efectivo que entra a la caja" (como en el pago).
  - **Fecha**, solo si el origen no es la caja (con la caja es hoy). **Referencia** y **descripción** opcionales.
  - **Resumen en vivo** con `checkSupplierRefund` (nunca `Number`): "Saldo a favor: $ 15.000 → después: $ 0". Si el monto supera el saldo a favor, aviso antes de mandar: "Es más que lo que te debe: después le vas a deber $ 5.000".
  - Ante `422 REFUND_EXCEEDS_CREDIT`: diálogo de confirmación con `details.balanceAfter` y reenvío con `confirmExceedsCredit: true` y **el mismo** `clientRequestId`.
  - Ante `422 CASH_SESSION_REQUIRED`: "No hay ninguna caja abierta. Abrí la caja o elegí otro origen." Mensajes por `code`.
  - Al terminar: "Devolución registrada. Saldo: $ 0" y, si fue a la caja, "Entraron $ 15.000 a la caja abierta".
- **Cuenta corriente:** la fila "Devolución del proveedor" con el monto **en positivo** (`+ $ 15.000`), el origen y, si entró a la caja, link al detalle de esa caja. El filtro por tipo incluye "Devolución del proveedor".
- **Compra anulada que tenía pagos** (`PurchaseDetailPage`): debajo del aviso de anulación, "Esta compra tenía pagos. Si el proveedor te devuelve la plata, registrala en su cuenta corriente" con un link a **Registrar devolución** del proveedor (con la descripción precargada "Devuelve lo pagado de la compra #N (anulada)"). También en el mensaje que aparece justo después de anular, si el saldo quedó negativo.
- **Detalle de la caja:** el ingreso se ve como "Devolución del proveedor — Distribuidora Sur" (campo `supplier`) entre los ingresos.
- **Movimientos a mano de la caja:** "Devolución del proveedor" **no** aparece entre los motivos (se carga desde el proveedor).
- **Fotos de una compra anulada (H-66 a):** "Agregar foto" y "Borrar" siguen disponibles en una compra anulada (ya es así; no ocultarlos).

### 15.10 Casos de test (para `qa`)

**Unitarios (`shared`):**

| `checkSupplierRefund` | `balance` | `amount` | `credit` | `balanceAfter` | `exceedsCredit` |
|---|---:|---:|---:|---:|:---:|
| Devuelve todo (ejemplo H) | −15.000,00 | 15.000,00 | 15.000,00 | 0,00 | no |
| Devuelve una parte | −15.000,00 | 10.000,00 | 15.000,00 | −5.000,00 | no |
| Devuelve de más | −15.000,00 | 20.000,00 | 15.000,00 | 5.000,00 | **sí** |
| Saldo 0 | 0,00 | 100,00 | 0,00 | 100,00 | **sí** |
| Con deuda (compra corregida ya cargada) | 25.300,00 | 15.000,00 | 0,00 | 40.300,00 | **sí** |
| Centavos | −0,01 | 0,01 | 0,01 | 0,00 | no |

- `CreateSupplierRefundRequestSchema`: `amount` `"0"`, `"-5"`, `"1.234"`, número de JSON → error; `purchaseId` o cualquier campo desconocido → error; sin `clientRequestId` → error.
- `ManualCashMovementReasonSchema` / `CreateCashMovementRequestSchema` rechazan `SUPPLIER_REFUND` (se suma al test que ya rechaza `SALE_VOID_REFUND` y `SUPPLIER_PAYMENT`).

**Integración (API + base):**
- **Ejemplo H completo** (15.11): compra de $ 40.300, pago de $ 10.000 por transferencia y $ 5.000 con efectivo de la caja, anular → saldo −15.000; devolución de $ 15.000 con `CASH_REGISTER` → `201`, saldo **0**, `REFUND +15.000` con `cashMovement`, ingreso `IN` / `SUPPLIER_REFUND` de $ 15.000 en la caja abierta con `supplierAccountEntryId` y `supplier`; el `summary.expectedCash` de la caja sube $ 15.000 y el cierre lo incluye.
- Desde la puerta remota con `CASH_REGISTER` → `403 LOCAL_ONLY`, auditoría `ACCESS_DENIED`, **nada** guardado (ni movimiento de cuenta ni de caja). Con `BANK_TRANSFER` desde la remota → `201` y la caja no cambia (⏳ H-67 b).
- Sin caja abierta con `CASH_REGISTER` → `422 CASH_SESSION_REQUIRED`, nada guardado. `entryDate` de ayer con `CASH_REGISTER` → `422 REFUND_DATE_MUST_BE_TODAY`; mañana con cualquier origen → `422 DATE_IN_FUTURE`.
- Mayor que el saldo a favor sin confirmar → `422 REFUND_EXCEEDS_CREDIT` con `details` correctos y nada guardado; con `confirmExceedsCredit: true` y el mismo id → `201` (⏳ H-68 b). Con saldo 0 → `422` y con confirmación `201`.
- **Reintento:** dos veces el mismo pedido → `201` y `200` con `isReplay: true`, **un** movimiento de cuenta y **un** ingreso de caja, una sola auditoría. Mismo id con otro monto → `409 REFUND_REQUEST_ID_REUSED`. El id de un **pago** usado en una devolución → `409 REFUND_REQUEST_ID_REUSED`; el id de una devolución usado en un pago → `409 PAYMENT_REQUEST_ID_REUSED`. Dos pedidos iguales **a la vez** → uno `201` y otro `200`.
- Roles: empleado → `403` (desde cualquier puerta); encargado → `201` (⏳ H-70 a); proveedor desactivado → `201`; proveedor inexistente → `404`.
- Auditoría `SUPPLIER_REFUND` con `balanceBefore`/`balanceAfter`, `cashMovementId` y `cashSessionId`; **no** hay `CASH_MOVEMENT_IN` aparte.
- `POST /api/cash-movements` con `reason: "SUPPLIER_REFUND"` → `400`. No hay rutas de edición ni borrado de devoluciones (`PATCH`/`DELETE` → `404`).
- **Coherencia entre tablas:** después de la suite, todo `cash_movements` con `SUPPLIER_REFUND` apunta a un `REFUND` con el mismo monto y `CASH_REGISTER`, y todo `REFUND` con `CASH_REGISTER` tiene exactamente un ingreso.
- **Concurrencia:** una devolución en efectivo y un cierre a la vez → la devolución queda en la caja y en el esperado, o recibe `422`; nunca un ingreso en una caja cerrada.
- **`CHECK`s (base, uno por cada uno):** `REFUND` con monto negativo, sin `payment_source`, con `purchase_id` o sin `client_request_id` → falla; `SUPPLIER_REFUND` como `OUT` o sin `supplier_account_entry_id` → falla; un `OTHER` con `supplier_account_entry_id` → falla; `payment_source` en un `ADJUSTMENT` → falla; un `REFUND` válido y un `SUPPLIER_REFUND` válido → pasan.
- **Visibilidad:** con sesión de empleado, la ruta da `403` (se suma al test "toda ruta de este documento → `403`").

**e2e (Playwright):** con caja abierta, cargar una compra con "pagar ahora" en efectivo de la caja, anularla, ver en el proveedor "Saldo a favor del kiosco", tocar **Registrar devolución** (monto precargado, "Efectivo que entra a la caja"), guardar, ver el saldo en $ 0, la fila "Devolución del proveedor" en la cuenta corriente y el ingreso en el detalle de la caja abierta con el esperado actualizado.

### 15.11 Ejemplo numérico (ejemplo H, sigue al ejemplo G de `compras.md` 9)

Punto de partida (ejemplos F y G): compra #22 de $ 40.300; pagos de $ 10.000 por transferencia y $ 5.000 con efectivo de la caja #9; la compra se anula → saldo **−$ 15.000** (a favor del kiosco).

| Paso | Movimiento de cuenta | Saldo | Caja abierta #9 |
|---|---|---:|---|
| Compra #22 | `PURCHASE +40.300` | 40.300 | — |
| Pago por transferencia | `PAYMENT −10.000` | 30.300 | — |
| Pago con efectivo de la caja | `PAYMENT −5.000` | 25.300 | `OUT` / `SUPPLIER_PAYMENT` 5.000 |
| Anulación de la compra (ejemplo G) | `PURCHASE_VOID −40.300` | **−15.000** | — (la salida queda, H-55 a) |
| **Devolución de $ 15.000 en efectivo a la caja** | **`REFUND +15.000`** | **0** | **`IN` / `SUPPLIER_REFUND` 15.000** |

- **Arqueo:** si la caja #9 abrió con $ 5.000 y no tuvo ventas en efectivo ni otros movimientos, el esperado queda 5.000 − 5.000 + 15.000 = **$ 15.000**: $ 10.000 más que al abrir, porque salieron 5.000 (el pago) y entraron 15.000 (la devolución); esos $ 10.000 de más son lo que se había pagado por transferencia y el proveedor devolvió en efectivo. Si en cambio el proveedor devuelve $ 5.000 en efectivo y $ 10.000 por transferencia (⏳ H-67 b), son **dos** devoluciones: `REFUND +5.000` con `CASH_REGISTER` (esperado 5.000) y `REFUND +10.000` con `BANK_TRANSFER` (la caja no cambia); saldo **0** igual.
- **Devolución parcial:** devuelve $ 10.000 → `REFUND +10.000`, saldo **−$ 5.000** (sigue a favor del kiosco).
- **Devolución después de cargar la compra corregida** (⏳ H-68 b): si antes de la devolución se carga la compra corregida de $ 40.300, el saldo es **+$ 25.300** (no hay saldo a favor, `credit` 0). Una devolución de $ 15.000 da `422 REFUND_EXCEEDS_CREDIT` con `details: { "balance": "25300.00", "credit": "0.00", "amount": "15000.00", "balanceAfter": "40300.00" }`; con la confirmación queda **$ 40.300**: el proveedor devolvió lo pagado y el kiosco le debe la compra corregida entera, que es lo correcto.

Estado de cuenta resultante (`GET /api/suppliers/3/account`, primera página):

```json
{
  "supplier": { "id": 3, "name": "Distribuidora Sur", "isActive": true },
  "balance": "0.00",
  "items": [
    { "id": 14, "supplierId": 3, "type": "REFUND", "amount": "15000.00", "entryDate": "2026-11-27",
      "balanceAfter": "0.00", "purchase": null, "paymentSource": "CASH_REGISTER", "reference": null,
      "description": "Devuelve lo pagado de la compra #22 (anulada)", "cashMovement": { "id": 96, "cashSessionId": 9 },
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T16:30:00.000Z" },
    { "id": 13, "supplierId": 3, "type": "PURCHASE_VOID", "amount": "-40300.00", "entryDate": "2026-11-27",
      "balanceAfter": "-15000.00",
      "purchase": { "id": 22, "documentType": "INVOICE", "documentNumber": "0003-00012350", "status": "VOIDED" },
      "paymentSource": null, "reference": null, "description": null, "cashMovement": null,
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T16:00:00.000Z" }
  ],
  "page": 1, "pageSize": 2, "total": 5
}
```

## 16. Frenar y preguntar (H-67 a H-71) — pendientes del dueño

No están en `requisitos.md` ni en `relevamiento.md`: el dueño eligió **cómo** registrar la devolución (H-65 a) pero no estos detalles. Cada uno tiene opciones y la recomendación del arquitecto; **decide el dueño**. La última columna dice cómo está escrito este contrato mientras tanto (la recomendación) y qué cambia con otra opción. También están en `requisitos.md` 7.9.

| H | Pregunta | Opciones | Recomendación | Mientras tanto (y qué cambia) |
|---|---|---|---|---|
| H-67 | **¿Por dónde puede entrar la devolución?** ¿Solo efectivo a la caja, o también transferencia, efectivo que no va a la caja u otro (sin tocar la caja)? | a) Solo efectivo que entra a la caja (siempre desde el local, con caja abierta, de hoy). b) Los mismos 4 orígenes que un pago: con "efectivo de la caja" suma a la caja (solo local, de hoy); con los otros solo baja el saldo a favor, se puede cargar desde afuera y con fecha pasada (como H-61). c) a), y las otras formas las carga el dueño como ajuste. | **b)**: un proveedor que devuelve por transferencia es igual de real, y con a) o c) el encargado no la podría registrar (el ajuste es solo del dueño). | b) (15.2, 15.3). Con a): ruta `access: 'local'`, `source` solo `CASH_REGISTER` y un `CHECK` más (15.7). |
| H-68 | **¿Se puede devolver más que el saldo a favor**, o con el saldo en 0 o con deuda? | a) No: solo hasta el saldo a favor (`422` sin confirmación posible; con saldo 0 no se puede). b) Sí, con confirmación explícita mostrando el saldo que quedaría (como el pago de más, H-56). c) Sí, sin control. | **b)**: frena un cero de más y permite un caso real: si la compra corregida ya se cargó, el saldo a favor desaparece pero el proveedor igual devuelve lo pagado (15.11). | b) (15.4 paso 7). Con a): `confirmExceedsCredit` sale del esquema. Con c): sin paso 7. |
| H-69 | **¿La devolución se vincula a una compra anulada** o es suelta? | a) Suelta, como un pago suelto: baja el saldo; la descripción puede decir "compra #22". b) Se puede elegir (opcional) una compra **anulada** del mismo proveedor; se ve en el detalle de esa compra. c) Siempre de una compra anulada, y como mucho lo que se pagó de esa compra. | **a)**: el saldo a favor puede venir de varias cosas (varias anulaciones, un pago de más, un saldo inicial negativo) y lo que hay que cuadrar es el saldo; b) se puede agregar después sin romper nada. | a) (15.3). Con b): `purchaseId?` en el request, el `CHECK` de `REFUND` admite `purchase_id` y la compra muestra sus devoluciones. |
| H-70 | **¿Quién la registra?** ¿Y con un proveedor desactivado? | a) Encargado y dueño, también con el proveedor desactivado (como los pagos, PRV-06 y H-59). b) Solo el dueño (como los ajustes). c) a), pero no con el proveedor desactivado. | **a)**: es plata que entra con su registro automático, igual que un pago; el encargado ya registra pagos y movimientos de caja, y desactivar un proveedor no debería impedir cerrar su cuenta. | a) (15.2). Con b): roles OWNER solamente (`403` al encargado). |
| H-71 | **¿Cómo se corrige una devolución mal cargada?** | a) Como los pagos: no se anula ni se edita; el dueño carga un ajuste en la cuenta y, si entró a la caja, se registra una salida "Otro" en la caja abierta. b) Una ruta nueva "Anular devolución" (encargado y dueño, desde el local) que revierte la cuenta y saca la plata de la caja abierta. | **a)**: es la misma regla aprobada para los pagos (no se anulan), sin rutas nuevas; es un caso raro. | a) (15.2). Con b): ruta, estado de anulación y `CHECK`s nuevos (otra vuelta de contrato). |

**Ya definidos por documentos aprobados** (no se preguntan):
- **Cómo se registra:** un solo movimiento que suma a la caja y baja el saldo a favor (H-65 a).
- **Con efectivo de la caja:** solo desde el local (CAJ-09, ADR 003 punto 6), con una caja abierta (H-47 a: sin caja abierta no hay movimientos de caja), siempre en la caja **abierta** (D9: una caja cerrada no se modifica).
- **El empleado no accede** a proveedores ni a pagos (matriz, PRV-06).
- **Fotos en compras anuladas:** se agregan y se borran (H-66 a).
- **Decisión técnica (no de negocio):** el motivo de caja `SUPPLIER_REFUND` **no se carga a mano** desde los movimientos de caja (`400`), por la misma razón que `SUPPLIER_PAYMENT` (`caja.md` 11.2): si no, la caja diría "devolvió X" sin que baje el saldo de X.
