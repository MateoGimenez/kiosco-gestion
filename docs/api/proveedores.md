# API — Proveedores, cuenta corriente, pagos y pedido sugerido

> Etapa 5, tarea 1. Requisitos: PRV-01 a PRV-06, CAJ-07, REP-07 (para reponer por proveedor), STK-01 (proveedor habitual); PA-04, PA-07, PA-08, PA-26; H-08, H-12; `requisitos.md` sección 3 (matriz y acceso desde afuera).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero), ADR 003 (puertas: pago con efectivo de la caja solo en el local, punto 6).
> Modelo: `Supplier`, `Product.defaultSupplierId`, `SupplierAccountEntry`, `CashMovement` (`docs/modelo-datos.md` 2.6, 2.7, 2.13, 2.20 y sección 4).
> Compras, adjuntos y anulación de compras: `docs/api/compras.md`. **H-54 a H-64 resueltos por el dueño (2026-11-26)**, aceptando todas las recomendaciones (`requisitos.md` 7.9, `relevamiento.md` "Etapa 5"); las que tocan este documento están en la sección 14.
> **Decisión ya aprobada (plan, sección 5, punto 5):** saldo inicial por proveedor al instalar y correcciones manuales con motivo, solo el dueño (secciones 9 y 10).

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
| `POST /api/suppliers/:id/opening-balance` | **Saldo inicial** (uno por proveedor) | `any` | **OWNER** |
| `POST /api/suppliers/:id/adjustments` | **Corrección** del saldo con motivo | `any` | **OWNER** |
| `GET /api/suppliers/:id/suggested-order` | **Pedido sugerido**: lista, texto y link de WhatsApp | `any` | OWNER, MANAGER |
| `GET /api/stock/restock?supplierId=` | "Para reponer" filtrado por proveedor (ruta de la etapa 2, se le agrega el filtro) | `any` | OWNER, MANAGER |

(*) **Pago con efectivo de la caja desde afuera:** la ruta es `access: 'any'` y **el servicio** rechaza `source = CASH_REGISTER` por la puerta remota con `403 LOCAL_ONLY` (auditado como `ACCESS_DENIED`, igual que `requireLocal`). Es lo que fija el ADR 003 punto 6: transferencia, efectivo de afuera y "otro" **sí** se pueden registrar desde afuera; solo el efectivo de la caja no. Vale también para el "pagar ahora" de una compra (`compras.md` 5). El efecto para el usuario es el mismo que `access: 'local'`, pero sin bloquear los otros tres orígenes.

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **EMPLOYEE → `403 FORBIDDEN` en todas** (matriz: "Proveedores, pedidos y pagos a proveedores" ❌; PRV-06). Rol antes que puerta.
- **Alta, edición y desactivación:** encargado y dueño (PRV-06: "solo encargado o dueño gestionan proveedores"). No es una pregunta abierta.
- **No hay `DELETE`:** los proveedores se desactivan (PRV-02); los movimientos de cuenta corriente no se editan ni se borran (se corrigen con un ajuste, sección 10).

## 2. Visibilidad por rol

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Proveedores (datos, saldo, cuenta corriente, pedido sugerido) | ❌ `403` | ✅ | ✅ | Matriz, PRV-06, REP-06 (deuda: encargado y dueño) |
| Registrar pagos | ❌ | ✅ (efectivo de la caja: solo local) | ✅ (ídem) | PRV-04, PRV-06, PA-01 |
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
| `SupplierPaymentSourceSchema` | `"CASH_REGISTER"` (efectivo de la caja) \| `"CASH_OUTSIDE_REGISTER"` (efectivo de afuera de la caja) \| `"BANK_TRANSFER"` (transferencia) \| `"OTHER"` (otro) — PA-08. |
| `SupplierEntryTypeSchema` | `"OPENING_BALANCE"` \| `"PURCHASE"` \| `"PURCHASE_VOID"` \| `"PAYMENT"` \| `"ADJUSTMENT"` (sección 7). |
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
  paymentSource: SupplierPaymentSource | null;   // solo PAYMENT
  reference: string | null;
  description: string | null;            // ADJUSTMENT: el motivo (obligatorio)
  cashMovement: { id: number; cashSessionId: number } | null;   // solo PAYMENT con CASH_REGISTER
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
| `PAYMENT` | Pago (sección 8) o "pagar ahora" de una compra | `−` | Solo si fue "pagar ahora" | Con `paymentSource`. Con `CASH_REGISTER` tiene su `CashMovement`. |
| `ADJUSTMENT` | Corrección con motivo (sección 10), solo dueño | `+` o `−` | — | `description` = el motivo (obligatorio). |

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

### 8.3 Reintentos: `clientRequestId` (decisión técnica, igual que las ventas)

Un pago repetido por un doble clic o un reintento con WiFi cortado bajaría la deuda dos veces (y, con efectivo de la caja, sacaría plata dos veces del arqueo). Como no se puede anular un pago, se usa el **mismo mecanismo de las ventas** (`ventas.md` 2.4): la pantalla genera un UUID por formulario (`newClientRequestId()` de `shared`), el servidor guarda `clientRequestId` (único) y la huella `requestHash` en el movimiento. Mismo id y mismo cuerpo y usuario → `200` con el mismo pago e `isReplay: true` (sin crear nada ni auditar); otro cuerpo u otro usuario → `409 PAYMENT_REQUEST_ID_REUSED` con `details: { entryId, createdAt }`. **Contra:** dos columnas más en la tabla (nulas en los movimientos que no son pagos sueltos).

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

Se usan también los existentes `VALIDATION_ERROR`, `FORBIDDEN`, `LOCAL_ONLY`, `NOT_FOUND`, `CASH_SESSION_REQUIRED`, `PRODUCT_NOT_FOUND`, `MISC_PRODUCT_LOCKED`.

Acciones de auditoría nuevas: `SUPPLIER_CREATE`, `SUPPLIER_UPDATE`, `PRODUCT_SUPPLIER_ASSIGN`, `SUPPLIER_OPENING_BALANCE`, `SUPPLIER_ACCOUNT_ADJUST` (`SUPPLIER_PAYMENT` ya estaba en el modelo 2.21). Todas en la misma transacción que la acción (README 8).

## 13. Notas para los demás agentes

- **base-datos:** ver `modelo-datos.md` 2.6, 2.7, 2.13 y 2.20 (cambios de la etapa 5 resumidos en `compras.md` 11): `Supplier` con nombre único sin mayúsculas, `phone` de 10 dígitos, `Weekday[]`; `Product.defaultSupplierId` con FK e índice y `CHECK` de "Varios"; `SupplierAccountEntry` con `OPENING_BALANCE`, `clientRequestId`/`requestHash`, sus `CHECK`s e índices únicos parciales; FK de `cash_movements.supplier_account_entry_id`. Seed: 2 o 3 proveedores de ejemplo (uno con WhatsApp y días de visita) y algunos productos con habitual.
- **backend:** esquemas y funciones de `shared` (`suppliers/`): `normalizeArPhone`, `formatArPhone`, `isValidCuit`, `suggestedOrderQuantity`, `buildSupplierOrderText`, `buildWhatsAppUrl`, con tests. Saldo siempre con `SUM` en SQL (nunca sumando en JS con `number`). El control de `CASH_REGISTER` desde afuera va en el servicio (paso 2 de 8.2) y lo usa también la compra. Lock del proveedor (8.2 paso 4) antes que la caja y que los productos. Un `ACCESS_DENIED` por servicio usa el mismo `writeAuditThrottled` que `requireLocal`.
- **frontend (`/impeccable`):** el teléfono muestra en vivo cómo queda (`normalizeArPhone` + `formatArPhone`) y el mensaje de 4; el pago ofrece los 4 orígenes con una explicación corta ("sale del cajón" / "no toca la caja") y oculta "efectivo de la caja" si `GET /api/auth/me` dice `REMOTE`; ante `422 PAYMENT_EXCEEDS_BALANCE` pide confirmar mostrando el saldo que quedaría; el pedido sugerido permite cambiar cantidades y recalcula texto y link con las funciones de `shared`; botones "Copiar" y "Abrir WhatsApp" (`target="_blank"`, `rel="noopener noreferrer"`). Saldo inicial y ajustes solo se muestran al dueño.
- **qa:** unitarios de 4 (tabla) y de 11.2 (tabla); integración: el saldo es la suma de los movimientos (con saldo inicial, compra, anulación, pagos y ajuste); un pago con transferencia no toca la caja; con efectivo de la caja crea la salida y entra en el esperado del cierre; `CASH_REGISTER` desde la puerta remota → `403 LOCAL_ONLY` (y transferencia desde la remota → `201`); sin caja → `422`; doble pago con el mismo `clientRequestId` → un solo movimiento; encargado con saldo inicial o ajuste → `403`; segundo saldo inicial → `409`; empleado → `403` en todo; el empleado no recibe `defaultSupplier` en productos; `balanceAfter` correcto con filtros y páginas.
- **seguridad:** el bloqueo remoto de `CASH_REGISTER` (también en "pagar ahora"), la auditoría de pagos, saldos iniciales y ajustes, que el empleado no vea nada de proveedores, y que el texto del pedido no lleve costos.

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
