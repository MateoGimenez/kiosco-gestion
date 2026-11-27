# API — Compras, adjuntos y anulación de compras

> Etapa 5, tarea 1. Requisitos: COM-01 a COM-05, COM-07 a COM-10, PRV-04 ("pagar ahora"), CAJ-07; PA-03, PA-05, PA-06, PA-07, PA-08, PA-13 (reemplaza PA-24), PA-25; H-07, H-16 y H-17 (aprobadas).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero y redondeos), ADR 003 (puertas; subidas `multipart`, punto 5) y **ADR 005** (adjuntos).
> Modelo: `Purchase`, `PurchaseItem`, `PurchaseAttachment`, `SupplierAccountEntry`, `StockMovement`, `PriceChange`, `CashMovement` (`docs/modelo-datos.md` 2.8, 2.9, 2.13, 2.17 a 2.20 y sección 4). Cambios al modelo de esta etapa: sección 11.
> Proveedores, cuenta corriente, pagos y pedido sugerido: `docs/api/proveedores.md`.
> **Fuera de la etapa 5 (R3 del plan):** el aviso de cambio de costo con precio sugerido (COM-06) llegó en la etapa 6 (nota de abajo y sección 5.4).
> **H-54 a H-64 resueltos por el dueño (2026-11-26)**, aceptando todas las recomendaciones: sección 12, `requisitos.md` 7.9 y `relevamiento.md` "Etapa 5". Ya están en este contrato.
> **Cierre de la etapa 5 (2026-11-27):** H-65 a (devolución de plata del proveedor en un paso, `proveedores.md` 15) y H-66 a (fotos en una compra anulada: se agregan y se borran). Sección 12.1.
> **Etapa 6 (solo agrega, COM-06):** `CostChange` suma el **precio sugerido** y los datos para decidir el precio (3.3 y `precios.md` 8.1), `PurchaseSchema` suma `costChanges` (detalle de la compra, 6.2) y hay una ruta nueva para **guardar los precios elegidos después de la compra**: `POST /api/purchases/:id/price-updates` (`precios.md` 8.2). La compra en sí (5.2) **no cambia**: sigue sin tocar precios. ⏳ H-76 (cuándo se decide el precio) está pendiente del dueño (`precios.md` 12).

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles |
|---|---|:---:|---|
| `POST /api/purchases` | **Cargar una compra** (stock, último costo, deuda y "pagar ahora") | `any` (*) | OWNER, MANAGER |
| `GET /api/purchases` | Listar compras | `any` | OWNER, MANAGER |
| `GET /api/purchases/:id` | Ver una compra (líneas, adjuntos, pagos) | `any` | OWNER, MANAGER |
| `POST /api/purchases/:id/void` | **Anular** una compra | `any` | OWNER, MANAGER |
| `POST /api/purchases/:id/attachments` | **Subir un adjunto** (`multipart/form-data`) | `any` | OWNER, MANAGER |
| `GET /api/purchases/:id/attachments/:attachmentId` | Ver o descargar un adjunto (el archivo) | `any` | OWNER, MANAGER |
| `DELETE /api/purchases/:id/attachments/:attachmentId` | **Borrar** un adjunto (H-54 b) | `any` | OWNER, MANAGER |
| `POST /api/purchases/:id/price-updates` | **Etapa 6:** guardar los precios elegidos para los productos cuyo costo cambió (COM-06; `precios.md` 8.2) | `any` | OWNER, MANAGER |

(*) Con "pagar ahora" **con efectivo de la caja** (`payNow.source = CASH_REGISTER`), el servicio rechaza la puerta remota con `403 LOCAL_ONLY` (ADR 003 punto 6: "vale también para el pagar ahora de una compra"). Cargar la compra sin pago, o pagando con otro origen, **sí** se puede desde afuera (ADR 003: "compras ✅").

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1), **también la subida**.
- **EMPLOYEE → `403 FORBIDDEN` en todas** (matriz: "Cargar compras" ❌; COM-10). Rol antes que puerta.
- Borrar un adjunto: encargado y dueño, con auditoría (H-54 b, 8.4). Es la **única** ruta `DELETE` de la API (excepción al README 2: un archivo no tiene "desactivar").

## 2. Visibilidad por rol

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Compras (lista, detalle, carga, anulación) **con costos** | ❌ `403` | ✅ | ✅ | COM-10, PA-03: "el encargado ve los costos en esta pantalla" |
| Adjuntos (subir, ver, descargar, borrar) | ❌ `403` | ✅ | ✅ | COM-07, plan etapa 5 ("se sirven solo a encargado y dueño") |
| `costChanges` (costo anterior y nuevo; desde la etapa 6, también **precio sugerido**, margen y margen real) | ❌ | ✅ | ✅ | PA-03 (pantallas de compras y de precios); nota PA-03 del plan, etapa 6: confirmado, es de encargado y dueño como el costo |

- Encargado y dueño reciben **el mismo esquema** en todas las rutas de compras (no hay ganancia ni stock valorizado acá: solo costos de compra, que el encargado ve, PA-03).
- El costo cargado en una compra **no** aparece en ninguna ruta que pueda pedir un empleado: el stock que sube se ve en `ProductPublic.stockQuantity`, sin costo; el historial de stock es de encargado y dueño (`productos-stock.md` 2.1). Test obligatorio de qa: con sesión de empleado, toda ruta de este documento → `403` (también `GET` del archivo adjunto).
- Las respuestas se arman campo por campo y pasan por `parseResponse` (README 6). **`storedFileName` y la ruta del disco nunca salen en ninguna respuesta.**

## 3. Esquemas (van a Zod en `@kiosco/shared`, carpeta `purchases/`)

Requests **estrictos**; respuestas sin `strict`. Campos comunes como en `productos-stock.md` 3.1, `ventas.md` 4.1 y `proveedores.md` 3.1.

### 3.1 Campos

| Esquema | Tipo y reglas |
|---|---|
| `PurchaseDocumentTypeSchema` | `"INVOICE"` (factura) \| `"DELIVERY_NOTE"` (remito) \| `"OTHER"` (otro). |
| `PurchaseStatusSchema` | `"CONFIRMED"` \| `"VOIDED"`. |
| `PurchaseQuantityModeSchema` | `"UNIT"` (por unidad o por kg, según el producto) \| `"PACK"` (por bulto) — PA-06. |
| `DocumentNumberSchema` | string con `trim`, 1 a 30 (ej.: `"0003-00012345"`). `""` o `null` = sin número (COM-01: opcional). |
| `PackCountInputSchema` | Cantidad de bultos: entero ≥ 1 (`^[1-9]\d{0,5}$`, hasta 999.999). Un bulto se cuenta entero; si llega medio bulto, esa mercadería se carga por unidad. |
| `PositiveQuantityInputSchema` | Como en ventas: hasta 3 decimales y > 0. En un producto `UNIT`, entera (`400`, `productos-stock.md` 3.1). |
| `PurchaseNotesSchema` | string con `trim`, hasta 500. |
| `VoidReasonSchema` | El de ventas: `trim`, 1 a 200 (motivo obligatorio). |

### 3.2 Requests

```ts
PurchaseLineInput =                         // unión discriminada por quantityMode
  | { productId: number;
      quantityMode: 'UNIT';
      quantity: PositiveQuantity;           // unidades (UNIT: entera) o kg (KG: hasta 3 decimales)
      unitNetCost: Money;                   // costo NETO de una unidad o de un kg (≥ 0; 0: H-63)
      vatRatePercent: VatRate; }            // IVA de la factura para esta línea (sugerido desde el producto; 0 si no discrimina)
  | { productId: number;
      quantityMode: 'PACK';
      packCount: PackCount;                 // bultos, entero ≥ 1
      unitsPerPack: PositiveQuantity;       // sugerido desde Product.unitsPerPack, editable (PA-06). UNIT: entero
      packNetCost: Money;                   // costo NETO de UN bulto (≥ 0; 0: H-63)
      vatRatePercent: VatRate; }

PayNowInput = {                             // "pagar ahora" (COM-05, PA-07)
  source: SupplierPaymentSource;            // los 4 orígenes (proveedores.md 8.1)
  amount: PositiveMoney;                    // > 0; la pantalla lo precarga con el total, se puede pagar una parte
  reference?: PaymentReference | null;
}

CreatePurchaseRequestSchema = {
  clientRequestId: ClientRequestId;         // UUID por formulario (5.3), como en las ventas
  supplierId: number;
  documentType: PurchaseDocumentType;
  documentNumber?: DocumentNumber | null;   // opcional (COM-01)
  documentDate: string;                     // YYYY-MM-DD: fecha del comprobante (H-61: no futura)
  items: PurchaseLineInput[];               // 1 a 200 líneas
  otherChargesAmount?: Money;               // "otros cargos" (H-16 a): percepciones, flete. Default "0"
  notes?: PurchaseNotes | null;             // ej.: qué son los otros cargos
  payNow?: PayNowInput | null;              // null = solo deuda
  confirmDuplicateDocument?: boolean;       // confirma un comprobante ya cargado (5.2 paso 6)
  confirmOverpayment?: boolean;             // confirma un "pagar ahora" mayor que la deuda (H-56)
}
// NO acepta: precios de venta, costo final (unitCost), totales, quantity en una línea PACK,
// packCount en una línea UNIT (→ 400). El servidor calcula todo (README 7).

PurchaseListQuerySchema = {
  page?; pageSize?;                         // README 5
  from?: string; to?: string;               // YYYY-MM-DD sobre documentDate, ambos incluidos; from > to → 400
  supplierId?: number;
  status?: PurchaseStatus;
  documentNumber?: string;                  // trim, exacto
  sortOrder?: 'asc' | 'desc';               // por documentDate y después id; default 'desc'
}

VoidPurchaseRequestSchema = { reason: VoidReason }
```

### 3.3 Respuestas

```ts
PurchaseItemSchema = {
  id: number;
  productId: number; productName: string;   // nombre ACTUAL del producto
  saleUnit: SaleUnit;
  quantityMode: PurchaseQuantityMode;
  packCount: Quantity | null;               // solo PACK
  unitsPerPack: Quantity | null;            // solo PACK (lo usado EN ESTA compra)
  packNetCost: Money | null;                // solo PACK
  quantity: Quantity;                       // en unidades de venta (o kg): lo que sumó al stock
  unitNetCost: Money;                       // costo neto por unidad (en PACK, calculado: 4.1)
  vatRatePercent: Percent;
  unitCost: Money;                          // costo final por unidad (neto + IVA de la línea)
  lineNetTotal: Money;
  lineTotal: Money;                         // informativo (4.2)
  previousNetCostPrice: Money;              // costo del producto ANTES de esta compra
  previousCostPrice: Money;
}

VatBreakdownSchema = { vatRatePercent: Percent; netAmount: Money; vatAmount: Money }   // una fila por alícuota

PurchaseAttachmentSchema = {
  id: number; purchaseId: number;
  originalFileName: string;                 // solo para mostrar (8.1)
  mimeType: 'image/jpeg' | 'image/png' | 'application/pdf';
  sizeBytes: number;
  uploadedBy: UserRef;
  createdAt: string;
  url: string;                              // "/api/purchases/21/attachments/7" (8.2)
}

PurchasePayNowSchema = {                    // pagos hechos con "pagar ahora" (SupplierAccountEntry PAYMENT con purchaseId)
  entryId: number; amount: Money;           // positivo: lo pagado
  source: SupplierPaymentSource; reference: string | null; entryDate: string;
  cashMovement: { id: number; cashSessionId: number } | null;
}

PurchaseSchema = {
  id: number;                               // también es el número de compra
  status: PurchaseStatus;
  supplier: { id: number; name: string };
  documentType: PurchaseDocumentType;
  documentNumber: string | null;
  documentDate: string;
  netTotal: Money;                          // Σ lineNetTotal
  vatTotal: Money;                          // Σ vatBreakdown.vatAmount (4.2)
  vatBreakdown: VatBreakdown[];             // orden: alícuota descendente
  otherChargesAmount: Money;
  total: Money;                             // netTotal + vatTotal + otherChargesAmount: lo que se le debe
  notes: string | null;
  user: UserRef;                            // quién la cargó
  createdAt: string;
  voidedAt: string | null; voidedBy: UserRef | null; voidReason: string | null;
  items: PurchaseItem[];                    // en el orden en que se cargaron
  attachments: PurchaseAttachment[];        // del más viejo al más nuevo
  payNowPayments: PurchasePayNow[];         // [] si no se pagó en el acto
  costChanges: CostChange[];                // etapa 6: los productos cuyo costo cambió con esta compra (precios.md 8.1)
}

CostChangeSchema = {                        // aviso de cambio de costo (5.4)
  productId: number; productName: string;
  previousNetCostPrice: Money; newNetCostPrice: Money;
  previousCostPrice: Money; newCostPrice: Money;
  netCostChangePercent: SignedPercent | null;   // (nuevo − anterior) ÷ anterior × 100, a 2 decimales; null si el anterior era 0
  salePrice: Money;                         // precio de venta AL MOMENTO DE LA COMPRA (la compra no lo cambia)
  // Etapa 6 (COM-06), solo se agregan. Detalle y reglas: precios.md 8.1.
  vatRatePercent: Percent;                  // IVA de venta del producto (hoy)
  effectiveMarginPercent: Percent; marginSource: MarginSource;
  priceRoundingStep: Money;
  suggestedPrice: Money | null;             // con el costo nuevo, margen e IVA de hoy, hacia arriba al paso; null si costo 0
  currentSalePrice: Money;                  // precio de venta hoy
  realMarginPercent: SignedPercent | null;  // del precio de hoy con el costo nuevo
  isBelowCost: boolean;                     // el precio de hoy queda a pérdida con el costo nuevo
  matchesSuggestedPrice: boolean;
  canUpdatePrice: boolean;                  // se puede usar POST /api/purchases/:id/price-updates
  cannotUpdateReason: 'PURCHASE_VOIDED' | 'COST_CHANGED_SINCE' | null;
  priceUpdate: { priceChangeId; previousSalePrice: Money; salePrice: Money; user: UserRef; createdAt } | null;
}

CreatePurchaseResponseSchema = {
  purchase: Purchase;
  isReplay: boolean;                        // true = reintento con el mismo clientRequestId (5.3)
  costChanges: CostChange[];                // productos cuyo costo cambió con esta compra (5.4)
  supplierBalance: SignedMoney;             // saldo del proveedor después de la compra (y del pago)
}

PurchaseListItemSchema = {
  id; status; supplier: { id; name };
  documentType; documentNumber: string | null; documentDate: string;
  netTotal: Money; vatTotal: Money; otherChargesAmount: Money; total: Money;
  paidNowAmount: Money;                     // Σ de "pagar ahora" ("0.00" si no hubo)
  itemCount: number; attachmentCount: number;
  user: UserRef; createdAt: string; voidedAt: string | null;
}

VoidPurchaseResponseSchema = {
  purchase: Purchase;                       // ya anulada
  stockWarnings: StockWarning[];            // productos que quedaron con stock negativo (el de ventas.md 4.3)
  supplierBalance: SignedMoney;
}
```

`SignedPercent` = string con 2 decimales y `-` si baja.

## 4. Cálculo de la compra (una sola función de `shared`)

`calculatePurchase({ lines, otherChargesAmount })` hace todas las cuentas de este punto. La usa la **pantalla** (para mostrar el total mientras se carga y compararlo con la factura) y el **servidor** (que recalcula y guarda su resultado, README 7). Usa `roundToCents` (R-1) y `finalFromNet` del ADR 002; nunca `number`.

### 4.1 Cada línea

| Campo | Por unidad (`UNIT`) | Por bulto (`PACK`) |
|---|---|---|
| `quantity` (unidades de venta o kg) | la cargada | `packCount × unitsPerPack` (exacto) |
| `unitNetCost` | el cargado | **`R-1(packNetCost ÷ unitsPerPack)`** (al centavo, mitad hacia arriba) |
| `lineNetTotal` | `R-1(quantity × unitNetCost)` | **`packCount × packNetCost`** (exacto: es lo que dice la factura) |
| `unitCost` (costo final por unidad) | `finalFromNet(unitNetCost, IVA)` = `R-1(unitNetCost × (1 + IVA/100))` | ídem, desde el `unitNetCost` ya redondeado |
| `lineTotal` (informativo) | `finalFromNet(lineNetTotal, IVA)` | ídem |

**Redondeo del costo unitario (decisión):** el costo por unidad se guarda **al centavo** (R-1), porque es la columna `Decimal(14,2)` del producto y de la línea (modelo 1.1). **El total de la línea no sale del costo unitario redondeado:** en `PACK` es `bultos × costo del bulto`, exacto. Así:
- **La deuda coincide con la factura** (salvo lo de 4.2): el redondeo del costo unitario **nunca** cambia lo que se le debe al proveedor.
- La diferencia queda solo en el costo por unidad: como mucho **$ 0,005 por unidad** (medio centavo). En el ejemplo A, 24 × $ 833,33 = $ 19.999,92 contra $ 20.000 de la factura: 8 centavos en toda la compra, que solo afectan al stock valorizado y a la ganancia estimada (unas milésimas por unidad vendida).
- `unitCost` se calcula desde el `unitNetCost` **ya redondeado**, con la misma función que el costo cargado a mano (`productos-stock.md` 7.1). Así `Product.costPrice` siempre es `finalFromNet(netCostPrice, IVA de la última compra)`, venga de donde venga.

### 4.2 Totales de la compra y cómo cuadra con la factura

```
netTotal           = Σ lineNetTotal
vatBreakdown       = por cada alícuota: netAmount = Σ lineNetTotal de esa alícuota
                                        vatAmount = R-1(netAmount × alícuota / 100)
vatTotal           = Σ vatAmount
otherChargesAmount = lo cargado (H-16 a): percepciones de IVA o IIBB, flete
total              = netTotal + vatTotal + otherChargesAmount      → es la deuda (PA-07)
```

**El IVA se calcula por alícuota sobre la suma de los netos, no línea por línea** (decisión). Es como lo calcula una factura A ("IVA 21 %: $ X" sobre el subtotal gravado a esa alícuota). Si se sumara el IVA redondeado de cada línea, el total podría diferir de la factura en algún centavo (ejemplo D). `lineTotal` de cada línea queda solo como dato informativo; por eso `Σ lineTotal` puede no ser exactamente `netTotal + vatTotal` (se muestra la tabla `vatBreakdown`, no la suma de las líneas). **Contra:** el modelo decía "suma del IVA de las líneas"; se ajustó (sección 11).

- **Lo que la pantalla tiene que mostrar** para comparar con el papel: neto, IVA por alícuota, otros cargos y total, con centavos (`$ 1.234,56`, ADR 002 punto 8). Si el total no coincide, casi siempre es un costo mal tipeado.
- **"Otros cargos" no van al costo** de ningún producto (H-16 a): solo suman a la deuda. No tienen IVA propio.
- **Remitos sin IVA o facturas C** (monotributista): se carga IVA 0 % en las líneas; `unitCost = unitNetCost`.

### 4.3 Qué cambia en cada producto al guardar (COM-04, PA-05, H-07)

| Dato del producto | Qué pasa |
|---|---|
| `stockQuantity` | `+ quantity` de cada línea, con su `StockMovement` `PURCHASE` (STK regla 4). |
| `netCostPrice` y `costPrice` | Pasan a ser el **último costo pagado** (PA-05): `unitNetCost` y `unitCost` de la línea. Si el producto está en **dos líneas** (H-64 a), queda el de la **última línea con costo > 0** en el orden cargado. Una línea con **costo 0** (H-63 a) **no** cambia el costo. |
| `unitsPerPack` | Si la línea es `PACK` y sus unidades por bulto son distintas de las del producto, queda **la última usada** (H-07 a, aprobada). Las líneas `UNIT` no lo tocan. |
| `salePrice`, `marginPercent` | **No cambian al guardar la compra** (R3). Desde la etapa 6 el precio se elige **después**, producto por producto, con `POST /api/purchases/:id/price-updates` (COM-06, `precios.md` 8.2); el margen nunca. El precio guardado nunca cambia solo (D7). |
| `vatRatePercent` (IVA de **venta**) | **No cambia:** el IVA de la línea es el de la factura de compra; el del producto es el de venta (STK-10). |
| `defaultSupplierId` | **No cambia** (H-60 a): la pantalla avisa si el producto tiene otro proveedor habitual. |

## 5. `POST /api/purchases` — Cargar una compra

- **Sesión:** sí. **Acceso:** `any`; con `payNow.source = CASH_REGISTER`, solo en el local (sección 1). **Roles:** OWNER, MANAGER (COM-10).
- **Request:** `CreatePurchaseRequestSchema`. Los adjuntos **no** van en este pedido: se suben después, uno por pedido (sección 8). Así la carga es JSON simple y la foto pesada no frena ni pone en riesgo la compra.

### 5.1 Ejemplo de request (paso 2 de "Cómo probarlo": una línea por bulto y otra por unidad)

```json
{
  "clientRequestId": "b3e2f0a4-5d6c-4e8f-9a1b-2c3d4e5f6a7b",
  "supplierId": 3, "documentType": "INVOICE", "documentNumber": "0003-00012345", "documentDate": "2026-11-27",
  "items": [
    { "productId": 12, "quantityMode": "PACK", "packCount": "2", "unitsPerPack": "12", "packNetCost": "10000", "vatRatePercent": "21" },
    { "productId": 30, "quantityMode": "UNIT", "quantity": "20", "unitNetCost": "450", "vatRatePercent": "21" }
  ],
  "otherChargesAmount": "0",
  "payNow": null
}
```

### 5.2 Qué hace, en este orden (una transacción, tiempo máximo 20 s como el cobro)

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod (incluye 1 a 200 líneas y la forma de cada línea según `quantityMode`). | `400 VALIDATION_ERROR` |
| 2 | Si `payNow.source = CASH_REGISTER` y el pedido viene por la puerta remota → rechazar y auditar `ACCESS_DENIED` (límite de 1 por minuto). | `403 LOCAL_ONLY` |
| 3 | **Reintento:** buscar una compra con ese `clientRequestId` (5.3). | `200` con `isReplay: true`, o `409 PURCHASE_REQUEST_ID_REUSED` |
| 4 | Bloquear el proveedor (`FOR NO KEY UPDATE`, `proveedores.md` 8.2 paso 4). Que exista y esté activo (H-59). | `422 SUPPLIER_NOT_FOUND` / `422 SUPPLIER_INACTIVE` |
| 5 | `documentDate` no puede ser posterior a hoy (fecha calendario de Buenos Aires; H-61 a). | `422 DATE_IN_FUTURE` |
| 6 | **Comprobante repetido** (modelo 2.17: "para avisar"): si ya hay una compra **confirmada** del mismo proveedor, con el mismo `documentType` y el mismo `documentNumber` (no nulo), y no vino `confirmDuplicateDocument: true`. | `422 DUPLICATE_DOCUMENT`, `details: { "purchaseId": 18, "documentDate": "2026-11-20", "total": "24200.00" }` |
| 7 | Si `payNow.source = CASH_REGISTER`: caja abierta con `FOR SHARE` (`caja.md` 6). | `422 CASH_SESSION_REQUIRED` (no se guarda **nada**, tampoco la compra) |
| 8 | Leer y **bloquear** los productos de las líneas (`FOR NO KEY UPDATE`, `ORDER BY id`, como el cobro: `ventas.md` 14). Que existan, estén **activos** (H-57 a: la pantalla ofrece reactivarlo) y no sean "Varios" (no lleva stock). Producto `UNIT`: `quantity` y `unitsPerPack` enteros. | `422 PRODUCT_NOT_FOUND` / `422 PRODUCT_INACTIVE` / `422 MISC_PRODUCT_NO_STOCK`, con `details: { "items": [ { "index": 1, "productId": 30 } ] }`; `400` con `path: items.N.quantity` o `items.N.unitsPerPack` |
| 9 | `calculatePurchase` (sección 4). `total = 0` → rechazar (H-63). Un importe que no entra en `numeric(14,2)`. | `422 PURCHASE_TOTAL_ZERO`; `422 PURCHASE_AMOUNT_OUT_OF_RANGE` |
| 10 | Con `payNow`: si `saldo actual + total − payNow.amount < 0` y no vino `confirmOverpayment: true` (H-56 c). | `422 PAYMENT_EXCEEDS_BALANCE`, `details: { balance, amount, balanceAfter }` (`balance` ya incluye esta compra) |
| 11 | Crear `Purchase` (`status = CONFIRMED`, totales, `clientRequestId`, `requestHash`, `userId`) y sus `PurchaseItem` (con `previousNetCostPrice` / `previousCostPrice` = el costo del producto antes de la compra). | Choque de `clientRequestId` (`P2002`) → deshacer y responder como el paso 3 |
| 12 | Por cada línea, en el orden cargado: `UPDATE products SET stock_quantity = stock_quantity + q [, net_cost_price, cost_price] [, units_per_pack] ... RETURNING stock_quantity` (4.3) y `StockMovement` `PURCHASE` (`quantity` positiva, `stockAfter`, `unitNetCost` de la línea, `purchaseItemId`). | `422 STOCK_OUT_OF_RANGE` |
| 13 | Por cada producto cuyo costo neto o final **cambió**: **un** `PriceChange` `source = PURCHASE`, `purchaseId`, costo anterior y nuevo; precio y margen **iguales** antes y después (la compra no cambia precios; el precio elegido después crea **otra** fila `PURCHASE`, `precios.md` 8.2). Si el costo quedó igual, no se crea. | — |
| 14 | `SupplierAccountEntry` `PURCHASE` por `+total`, `entryDate = documentDate`, `purchaseId` (PA-07: **toda** compra suma deuda, también la que se paga en el acto). | — |
| 15 | Con `payNow`: `SupplierAccountEntry` `PAYMENT` por `−amount`, `purchaseId`, `paymentSource`, `entryDate` = hoy; con `CASH_REGISTER`, además `CashMovement` `OUT` / `SUPPLIER_PAYMENT` en la caja abierta, `description` = "Pago a proveedor: <nombre> (compra #N)". | — |
| 16 | Auditar `PURCHASE_CREATE` y, si hubo pago, `SUPPLIER_PAYMENT` (con `purchaseId`). | — |

- **Orden de bloqueos** (para no trabarse con ventas, pagos y cierres): proveedor → caja (`FOR SHARE`) → productos por `id`. Es el mismo orden caja → productos del cobro, y el cierre solo bloquea la caja.
- "Pagar ahora" es **opcional y parcial**: se puede pagar una parte (la deuda queda por la diferencia) o más que la compra si había deuda anterior (el control es sobre el saldo, paso 10).

### 5.3 Reintentos: `clientRequestId`

Igual que el cobro (`ventas.md` 2.4) y el pago (`proveedores.md` 8.3): una compra repetida por un doble clic o un WiFi cortado **duplicaría el stock y la deuda** (y, con "pagar ahora" en efectivo, sacaría plata dos veces de la caja). Mismo id + mismo cuerpo + mismo usuario → `200` con la **misma** compra, `isReplay: true`, sin crear ni auditar nada (también si después se anuló: se devuelve como está). Otro cuerpo u otro usuario → `409 PURCHASE_REQUEST_ID_REUSED` con `details: { purchaseId, createdAt }`. La pantalla genera el id al abrir el formulario y lo renueva solo después de un `201`/`200`.

### 5.4 Aviso de cambio de costo con precio sugerido (COM-06)

- **Response 201** (nueva) o **200** (reintento): `CreatePurchaseResponseSchema`.
- **`costChanges`** trae cada producto cuyo costo cambió: costo neto y final anterior y nuevo, el % de cambio del neto, el precio de venta al momento de la compra (que la compra **no** tocó) y, **desde la etapa 6**, el **precio sugerido** con el costo nuevo, el margen que se usa, el margen real del precio actual, si queda a pérdida y si todavía se puede decidir el precio (`precios.md` 8.1).
- Con eso la pantalla muestra, al terminar, "Cambió el costo de N productos" y, por producto, **usar el sugerido, escribir otro precio o dejarlo como estaba** (COM-06). Lo elegido se guarda con **`POST /api/purchases/:id/price-updates`** (`precios.md` 8.2), que crea un `PriceChange` `PURCHASE` por precio cambiado. Si se cierra el aviso sin elegir, el precio queda como estaba y se puede decidir después desde el detalle de la compra (⏳ H-76 a).
- **Por qué después y no en el mismo pedido** (decisión técnica): la compra siempre se guarda (es un hecho); el sugerido sale del costo que dejó la compra guardada; el reintento de la compra no cambia. Detalle en `precios.md` 8.
- `costChanges` se arma siempre igual (también en un reintento y en `GET /api/purchases/:id`): desde la **primera** fila `PriceChange` de cada producto en esta compra (la del costo); `salePrice` es su precio de venta de ese momento; el sugerido se calcula **ahora** con el costo que dejó la compra (`precios.md` 8.1).

### 5.5 Ejemplo de respuesta (ejemplo A de la sección 9, sin la línea por unidad)

```json
{
  "purchase": {
    "id": 21, "status": "CONFIRMED", "supplier": { "id": 3, "name": "Distribuidora Sur" },
    "documentType": "INVOICE", "documentNumber": "0003-00012345", "documentDate": "2026-11-27",
    "netTotal": "20000.00", "vatTotal": "4200.00",
    "vatBreakdown": [ { "vatRatePercent": "21.00", "netAmount": "20000.00", "vatAmount": "4200.00" } ],
    "otherChargesAmount": "0.00", "total": "24200.00", "notes": null,
    "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-27T14:50:00.000Z",
    "voidedAt": null, "voidedBy": null, "voidReason": null,
    "items": [
      { "id": 40, "productId": 12, "productName": "Coca-Cola 500 ml", "saleUnit": "UNIT", "quantityMode": "PACK",
        "packCount": "2.000", "unitsPerPack": "12.000", "packNetCost": "10000.00", "quantity": "24.000",
        "unitNetCost": "833.33", "vatRatePercent": "21.00", "unitCost": "1008.33",
        "lineNetTotal": "20000.00", "lineTotal": "24200.00",
        "previousNetCostPrice": "780.00", "previousCostPrice": "943.80" }
    ],
    "attachments": [],
    "payNowPayments": []
  },
  "isReplay": false,
  "costChanges": [
    { "productId": 12, "productName": "Coca-Cola 500 ml",
      "previousNetCostPrice": "780.00", "newNetCostPrice": "833.33",
      "previousCostPrice": "943.80", "newCostPrice": "1008.33",
      "netCostChangePercent": "6.84", "salePrice": "1450.00",
      "vatRatePercent": "21.00", "effectiveMarginPercent": "50.00", "marginSource": "SUBCATEGORY",
      "priceRoundingStep": "10.00", "suggestedPrice": "1520.00", "currentSalePrice": "1450.00",
      "realMarginPercent": "43.80", "isBelowCost": false, "matchesSuggestedPrice": false,
      "canUpdatePrice": true, "cannotUpdateReason": null, "priceUpdate": null }
  ],
  "supplierBalance": "24200.00"
}
```

(833,33 − 780) ÷ 780 × 100 = 6,837 → **6,84 %**. Etapa 6, con margen 50 % (subcategoría): sugerido R-3(833,33 × 1,50 × 1,21) = R-3(1.512,49) = **$ 1.520**; margen real de $ 1.450 con el costo nuevo = **43,80 %** (`precios.md` 10, ejemplo 4). El objeto `purchase` de la respuesta también trae `costChanges` (igual a este) desde la etapa 6.

### 5.6 Errores

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; más de 200 líneas; `packCount` no entero; decimales en un producto `UNIT`; campo de otra modalidad (`quantity` en `PACK`); campo desconocido (`unitCost`, `total`, `salePrice`…). | `fields` |
| `403` | `FORBIDDEN` | Empleado. | — |
| `403` | `LOCAL_ONLY` | "Pagar ahora" con efectivo de la caja desde la remota. | — |
| `409` | `PURCHASE_REQUEST_ID_REUSED` | 5.3. | `{ purchaseId, createdAt }` |
| `422` | `SUPPLIER_NOT_FOUND` / `SUPPLIER_INACTIVE` | Paso 4. | — |
| `422` | `DATE_IN_FUTURE` | Paso 5. | — |
| `422` | `DUPLICATE_DOCUMENT` | Paso 6, sin confirmar. | `{ purchaseId, documentDate, total }` |
| `422` | `CASH_SESSION_REQUIRED` | Paso 7. | — |
| `422` | `PRODUCT_NOT_FOUND` / `PRODUCT_INACTIVE` / `MISC_PRODUCT_NO_STOCK` | Paso 8. | `{ items: [{ index, productId }] }` |
| `422` | `PURCHASE_TOTAL_ZERO` | Paso 9 (H-63). | — |
| `422` | `PURCHASE_AMOUNT_OUT_OF_RANGE` | Paso 9: un importe que no entra en la base. | — |
| `422` | `PAYMENT_EXCEEDS_BALANCE` | Paso 10, sin confirmar. | `{ balance, amount, balanceAfter }` |
| `422` | `STOCK_OUT_OF_RANGE` | Paso 12. | — |

### 5.7 Auditoría

- `PURCHASE_CREATE`, `entityType` `Purchase`, `entityId` = id, `details: { supplierId, documentType, documentNumber, documentDate, netTotal, vatTotal, otherChargesAmount, total, itemCount, costChanges: [{ productId, previousNetCostPrice, newNetCostPrice }], unitsPerPackChanges: [{ productId, before, after }], confirmedDuplicateDocument }`. La compra y sus líneas son el registro completo; la auditoría guarda el resumen y, sobre todo, **qué costos cambiaron** (NF-08: cambios de precios y costos). El historial por producto queda en `PriceChange`.
- Con "pagar ahora": además `SUPPLIER_PAYMENT` como en `proveedores.md` 8 (con `purchaseId`), que cubre la salida de caja.

## 6. Listar y ver compras

### 6.1 `GET /api/purchases` — Listar

- **Roles:** OWNER, MANAGER. **Query:** `PurchaseListQuerySchema`. Paginada. Sin filtros: todas, la de fecha más nueva primero. **Incluye anuladas** (con `status`).
- **Response 200:** `Paginated<PurchaseListItem>`. `paidNowAmount`, `itemCount` y `attachmentCount` salen de consultas agrupadas (no una por compra).
- La pantalla de carga puede usar `supplierId` + `documentNumber` para avisar **antes** de guardar que el comprobante ya existe (el servidor igual lo controla, 5.2 paso 6).
- **Errores:** `400`, `403`. **Auditoría:** no.

### 6.2 `GET /api/purchases/:id` — Ver

- **Roles:** OWNER, MANAGER. **Response 200:** `PurchaseSchema` (con líneas, adjuntos, pagos de "pagar ahora" y, desde la etapa 6, `costChanges` con el precio sugerido: `precios.md` 8.1).
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.

## 7. `POST /api/purchases/:id/void` — Anular una compra (COM-09, PA-25)

Una compra mal cargada **no se edita**: se anula y se carga de nuevo.

- **Sesión:** sí. **Acceso:** `any` (H-55 i: las compras se manejan desde afuera, ADR 003; la anulación no toca la caja). **Roles:** OWNER, MANAGER (COM-09).
- **Request:** `VoidPurchaseRequestSchema` (motivo obligatorio).
- **Qué hace** (una transacción):
  1. Bloquear la compra (`SELECT ... FOR UPDATE`). No existe → `404`. Ya anulada → `409 PURCHASE_ALREADY_VOIDED` (también si dos personas anulan a la vez: la segunda espera y choca acá).
  2. Bloquear el proveedor (`FOR NO KEY UPDATE`) y los productos de las líneas (`FOR NO KEY UPDATE`, `ORDER BY id`).
  3. `Purchase.status = VOIDED`, `voidedAt`, `voidedById`, `voidReason`.
  4. **Stock:** por cada línea, `stock_quantity − quantity` (`UPDATE ... RETURNING`) y `StockMovement` `PURCHASE_VOID` con `quantity` negativa, `stockAfter`, `unitNetCost` de la línea y `purchaseItemId`. **Puede quedar negativo** (R2: por ejemplo, si ya se vendió parte): no es un error, la respuesta lo avisa en `stockWarnings`. Vale aunque el producto se haya desactivado después (H-31).
  5. **Deuda:** `SupplierAccountEntry` `PURCHASE_VOID` por `−total`, `purchaseId`, `entryDate` = hoy (el índice único parcial impide una segunda).
  6. **Costos, precios y unidades por bulto NO se revierten** (COM-09, PA-25): siguen siendo los que dejó la compra. Si estaban mal, se corrigen en Precios o con la compra cargada de nuevo. No se crea `PriceChange`.
  7. **Pagos** (de "pagar ahora" o sueltos): **no cambian** (H-55 a). El saldo puede quedar a favor del kiosco hasta que se cargue la compra corregida. Si se pagó con efectivo de la caja, esa salida queda como está (la caja no se toca, D9). **Si el proveedor devuelve la plata**, se registra aparte, desde su cuenta corriente, con la **devolución del proveedor** (H-65 a, `proveedores.md` 15): en un solo paso suma a la caja abierta (si es efectivo que entra al cajón) y baja el saldo a favor. La anulación **no** la crea sola (H-55 a: los pagos no se revierten solos) y la devolución no se vincula a la compra (H-69 a: es suelta; la compra se menciona en la descripción).
  8. Auditar.
- **Adjuntos:** quedan con la compra anulada (sirven de respaldo). **Se pueden agregar y borrar** igual que en una compra confirmada (**H-66 a**, decisión del dueño 2026-11-27): son documentación, por ejemplo la nota de crédito del proveedor (8.1 paso 1 y 8.4 paso 1).
- **Response 200:** `VoidPurchaseResponseSchema`.
- **Errores:** `400` (motivo vacío o largo), `403`, `404`, `409 PURCHASE_ALREADY_VOIDED`, `422 STOCK_OUT_OF_RANGE`.
- **Auditoría:** `PURCHASE_VOID` (ya en el modelo 2.21), `entityType` `Purchase`, `details: { reason, supplierId, total, items: [{ productId, quantity, stockAfter }], balanceBefore, balanceAfter, payNowEntryIds }`.
- **Ejemplo** (paso 6 de "Cómo probarlo"): `{ "reason": "Cargué mal las cantidades" }` → la compra queda `VOIDED`, el stock de cada producto baja lo que había sumado la compra, el saldo baja el total de la compra y el costo de los productos queda como lo dejó la compra (números en el ejemplo G de la sección 9).

## 8. Adjuntos (COM-07; ADR 005)

JPG, PNG o PDF, **hasta `UPLOAD_MAX_MB` (10 MB)** cada uno, verificando el **tipo real** del archivo, guardados en disco (`UPLOADS_DIR`) con **nombre aleatorio**. Una compra puede tener **varios** (tope técnico: **10 por compra**). Detalle técnico y alternativas en el **ADR 005**.

### 8.1 `POST /api/purchases/:id/attachments` — Subir un adjunto

- **Sesión:** sí. **Acceso:** `any` (subir una foto no mueve plata ni stock). **Roles:** OWNER, MANAGER.
- **Tope de 10 por compra:** cuentan solo los adjuntos **no borrados** (8.4).
- **Cuerpo:** `multipart/form-data` con **una sola parte**, de nombre `file` (es la primera ruta `body: 'multipart'`, ADR 003 punto 5). Otro `Content-Type` → `415 UNSUPPORTED_MEDIA_TYPE`. Partes de más, otro nombre de campo o sin archivo → `400 VALIDATION_ERROR` (`path: file`). Lleva `X-Kiosco: 1` y `Origin` como cualquier pedido que cambia datos; **no** se fija `Content-Type` a mano (lo arma el navegador con el `boundary`).
- **El cuerpo se lee recién después de** sesión, rol y existencia de la compra (nadie sin permiso puede hacer subir 10 MB al servidor). Se lee en memoria con tope `UPLOAD_MAX_MB`: si el archivo lo supera, se corta la lectura en ese momento.
- **Qué hace:**
  1. La compra tiene que existir (`404`). Anulada: se permite (H-66 a).
  2. **Tamaño:** más de `UPLOAD_MAX_MB` → `400 ATTACHMENT_TOO_LARGE` (`details: { "maxMb": 10 }`). Vacío (0 bytes) → `400 ATTACHMENT_TYPE_NOT_ALLOWED`.
  3. **Tipo real por los primeros bytes** ("magic bytes"), **sin** creerle a la extensión ni al tipo que manda el navegador:

| Tipo | Empieza con | `mimeType` guardado | Extensión guardada |
|---|---|---|---|
| JPG | `FF D8 FF` | `image/jpeg` | `.jpg` |
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `image/png` | `.png` |
| PDF | `25 50 44 46 2D` (`%PDF-`) | `application/pdf` | `.pdf` |

     Cualquier otra cosa (HEIC, WEBP, GIF, ZIP, un `.exe` renombrado a `.jpg`, un HTML) → `400 ATTACHMENT_TYPE_NOT_ALLOWED` (`details: { "allowed": ["JPG", "PNG", "PDF"] }`). Función `detectAttachmentType(bytes)` del backend (son tres comparaciones; no hace falta una librería).
  4. **Nombre en disco:** 16 bytes aleatorios (`crypto.randomBytes`) en hexadecimal + la extensión **del tipo detectado**: `9f3c...e1.jpg` (32 caracteres + extensión). El nombre original **nunca** se usa para armar una ruta.
  5. Escribir en `UPLOADS_DIR` con nombre temporal (`<nombre>.tmp`, abierto con `wx`: falla si ya existe), forzar a disco y **renombrar** al nombre final (igual que las copias de seguridad, NF-04 / NF-18: un corte de luz nunca deja un adjunto a medias con nombre válido).
  6. En una transacción: bloquear la compra (`FOR UPDATE`, así dos subidas a la vez cuentan bien), controlar el tope de **10 adjuntos** (`422 ATTACHMENT_LIMIT_REACHED`), crear `PurchaseAttachment` y auditar. **Si la transacción falla, se borra el archivo** recién escrito.
- **Nombre original** (`originalFileName`): solo para mostrar. Se guarda sin carpetas (lo que va después de la última `/` o `\`), sin caracteres de control ni de formato Unicode (categorías Cc y Cf, incluidos los bidi U+202A a U+202E y U+2066 a U+2069), recortado a 120 caracteres; si queda vacío, `"adjunto.<ext>"`.
- **Response 201:** `PurchaseAttachmentSchema`.
- **Errores:** `400 VALIDATION_ERROR`, `400 ATTACHMENT_TOO_LARGE`, `400 ATTACHMENT_TYPE_NOT_ALLOWED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `415 UNSUPPORTED_MEDIA_TYPE`, `422 ATTACHMENT_LIMIT_REACHED`. Un error de disco (lleno, sin permiso) → `500` (al log con detalle; al usuario, el mensaje genérico).
- **Auditoría:** `PURCHASE_ATTACHMENT_ADD`, `entityType` `Purchase`, `entityId` = compra, `details: { attachmentId, originalFileName, mimeType, sizeBytes }`.
- **Foto desde el celular:** el frontend usa `<input type="file" accept="image/jpeg,image/png,application/pdf" capture="environment">`. Los iPhone sacan fotos en HEIC, pero Safari las convierte a JPG al subirlas con `accept` de imágenes; si algún equipo manda HEIC igual, el error `ATTACHMENT_TYPE_NOT_ALLOWED` lo explica ("Mandá la foto como JPG").

### 8.2 `GET /api/purchases/:id/attachments/:attachmentId` — Ver o descargar

- **Sesión:** sí (la cookie viaja sola en un `<img src>` o un link del mismo origen). **Acceso:** `any`. **Roles:** OWNER, MANAGER (EMPLOYEE → `403`).
- **Query:** `download?: 'true'` → descarga en lugar de mostrar.
- El adjunto tiene que ser **de esa compra** y **no estar borrado** (si no, `404`): no se puede pedir el adjunto 7 por otra compra.
- **Cómo se arma la ruta del archivo:** con `storedFileName` **leído de la base**, después de comprobar que cumple `^[0-9a-f]{32}\.(jpg|png|pdf)$`, y verificando que la ruta resuelta quede **dentro** de `UPLOADS_DIR`. Nada del pedido (ids, query) entra en la ruta del disco. Si el archivo no está en disco → `404` y error en el log.
- **Encabezados de la respuesta `200`:** `Content-Type` = el `mimeType` **guardado** (el detectado al subir); `Content-Length`; `X-Content-Type-Options: nosniff`; `Content-Disposition`: **`attachment` siempre en los PDF** (pueden traer JavaScript: no se abren en el visor del navegador) e `inline` en JPG y PNG (`attachment` con `download=true`), con `filename*=UTF-8''<nombre>` donde el nombre es el original **sin su extensión y con la del tipo detectado** (`.jpg`, `.png`, `.pdf`); `Cache-Control: no-store` (README 1.1: hay datos de compras); `Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox` para JPG y PNG (en el PDF, que siempre se descarga, solo `default-src 'none'`). Se envía como archivo (stream), sin pasar por JSON.
- **Errores:** `400` (ids no numéricos), `403`, `404`. **Auditoría:** no (ver no cambia nada).

### 8.3 Lista de adjuntos

Viene dentro de `GET /api/purchases/:id` (`attachments`, con su `url`), **solo los no borrados**. `PurchaseListItem.attachmentCount` tampoco cuenta los borrados. No hay ruta aparte.

### 8.4 `DELETE /api/purchases/:id/attachments/:attachmentId` — Borrar un adjunto (H-54 b)

Para una foto equivocada, una foto personal subida por error o la factura de otra compra.

- **Sesión:** sí. **Acceso:** `any` (criterio del ADR 003 punto 6: compras ✅ desde afuera; borrar un adjunto no mueve plata ni stock). **Roles:** OWNER, MANAGER (H-54 b). EMPLOYEE → `403`.
- **Sin cuerpo.** Lleva `X-Kiosco: 1` y `Origin` como todo pedido que cambia datos (README 1.1).
- **Decisión: borrado lógico de la fila + borrado físico del archivo.** La fila queda con `deletedAt` y `deletedById` (así se sabe qué hubo, quién lo subió y quién lo borró, sin depender de leer la auditoría), y el archivo se borra del disco, como aprobó el dueño en H-54 b: el motivo típico es una foto que no debería quedar guardada, así que moverla a otra carpeta la conservaría. Sigue existiendo en las copias de seguridad anteriores (NF-04).
- **Qué hace:**
  1. En una transacción: bloquear la compra (`FOR UPDATE`) y el adjunto; que el adjunto sea de esa compra y no esté borrado (si no → `404`). Compra anulada: se permite (H-66 a).
  2. `deletedAt = ahora`, `deletedById` = el usuario. Auditar.
  3. **Después de confirmar** la transacción: borrar el archivo de `UPLOADS_DIR` (ruta armada como en 8.2, desde `storedFileName` validado). Si falla (o se corta la luz antes), queda en el log; al arrancar, la API borra los archivos de filas con `deletedAt` (ADR 005 punto 5). Se borra después y no antes para no quedar con un archivo borrado y una fila visible si la transacción falla.
- Un adjunto borrado **no se recupera** por la API, no aparece en el detalle ni en el conteo, y su `GET` da `404`. Libera lugar en el tope de 10.
- **Response `204`** sin cuerpo.
- **Errores:** `400` (ids no numéricos), `403 FORBIDDEN`, `404 NOT_FOUND` (compra o adjunto inexistente, de otra compra o ya borrado). Borrar dos veces → el segundo `404`.
- **Auditoría:** `PURCHASE_ATTACHMENT_DELETE`, `entityType` `Purchase`, `entityId` = compra, `details: { attachmentId, originalFileName, mimeType, sizeBytes, uploadedById, uploadedAt }`. Con `channel` `REMOTE` si se hizo desde afuera.

### 8.5 Configuración (`.env`)

| Variable | Default | Regla |
|---|---|---|
| `UPLOADS_DIR` | `./data/uploads` (relativa a la raíz del repo; en la PC del kiosco, una ruta absoluta fuera del repo) | Al arrancar, la API crea la carpeta si no existe y prueba que puede escribir; si no puede, **no arranca** (como el resto de la configuración). No puede estar dentro de lo que sirve el frontend (nunca se sirve como archivos estáticos). Va en las copias de seguridad (etapa 8, NF-04). |
| `UPLOAD_MAX_MB` | `10` | Entero de 1 a 25. Tamaño máximo de **cada** adjunto (COM-07). La pantalla lo lee de **`GET /api/settings` → `uploadMaxMb`** (número, solo lectura, cualquier rol con sesión; `PATCH /api/settings` no lo acepta). |

## 9. Ejemplos numéricos (tests obligatorios de qa: unitarios con `calculatePurchase` y de integración con `POST /api/purchases`)

### Ejemplo A — 2 bultos × 12 a $ 10.000 neto el bulto, IVA 21 % (test del plan)

| Dato | Cuenta | Resultado |
|---|---|---:|
| `quantity` | 2 × 12 | **24** unidades |
| `unitNetCost` | R-1(10.000 ÷ 12) = R-1(833,3333…) | **$ 833,33** |
| `unitCost` | R-1(833,33 × 1,21) = R-1(1.008,3293) | **$ 1.008,33** |
| `lineNetTotal` | 2 × 10.000 (exacto, no 24 × 833,33) | **$ 20.000,00** |
| IVA 21 % | R-1(20.000 × 0,21) | $ 4.200,00 |
| `total` | 20.000 + 4.200 + 0 | **$ 24.200,00** |

- Stock del producto: **+24**. Costo del producto: neto **$ 833,33**, final **$ 1.008,33** (PA-05). Unidades por bulto del producto: **12** (H-07). Deuda: **+$ 24.200**.
- Cuadre: 24 × 833,33 = 19.999,92; la deuda igual es **$ 24.200**, la de la factura (4.1).

### Ejemplo B — Una línea con IVA 0 % (remito o factura C)

10 unidades de "Pan lactal" por unidad, costo neto $ 1.500, IVA 0 %:
- `lineNetTotal` = 10 × 1.500 = **$ 15.000**; `unitCost` = R-1(1.500 × 1,00) = **$ 1.500** (costo final = neto); IVA **$ 0**; `total` **$ 15.000**.
- El producto queda con costo neto y final **$ 1.500**. Su IVA de **venta** no cambia (sigue en 21 % si así estaba): el precio sugerido se calcula con el neto y el IVA de venta (H-15 a), así que no pierde margen por comprarle a un proveedor que no discrimina IVA.

### Ejemplo C — Otros cargos (H-16 a) en una factura con dos alícuotas

Las líneas de A y B en la misma compra, con percepción de IIBB $ 600 y flete $ 500 → `otherChargesAmount` **$ 1.100**:

| Alícuota | `netAmount` | `vatAmount` |
|---:|---:|---:|
| 21 % | 20.000,00 | 4.200,00 |
| 0 % | 15.000,00 | 0,00 |
| **Total** | **35.000,00** | **4.200,00** |

- `total` = 35.000 + 4.200 + 1.100 = **$ 40.300** → la deuda sube **$ 40.300**.
- **Los $ 1.100 no van al costo**: los productos quedan con $ 833,33 / $ 1.008,33 y $ 1.500 / $ 1.500, igual que en A y B.

### Ejemplo D — El IVA por alícuota cuadra con la factura

Dos productos por unidad, 1 × $ 10,02 neto cada uno, IVA 21 %:

| Forma | Cuenta | IVA | Total |
|---|---|---:|---:|
| **Por alícuota (la elegida)** | R-1(20,04 × 0,21) = R-1(4,2084) | **$ 4,21** | **$ 24,25** (= factura A) |
| Línea por línea (descartada) | R-1(10,02 × 0,21) × 2 = 2,10 × 2 | $ 4,20 | $ 24,24 |

Cada línea muestra `lineTotal` $ 12,12 (informativo); la compra, IVA $ 4,21 y total **$ 24,25**.

### Ejemplo E — Producto por peso, por unidad de kg

1,255 kg de queso a $ 3.333,33 el kg neto, IVA 21 %: `lineNetTotal` = R-1(4.183,32915) = **$ 4.183,33**; `unitCost` = R-1(3.333,33 × 1,21) = R-1(4.033,3293) = **$ 4.033,33**; IVA R-1(4.183,33 × 0,21) = R-1(878,4993) = **$ 878,50**; total **$ 5.061,83**.

### Ejemplo F — "Pagar ahora" (pasos 2 a 4 de "Cómo probarlo")

1. Compra del ejemplo C ($ 40.300) **sin** pago: cuenta corriente `PURCHASE +40.300` → saldo **$ 40.300**.
2. Pago de **$ 10.000 por transferencia** (`proveedores.md` 8): `PAYMENT −10.000` → saldo **$ 30.300**; la caja no cambia.
3. Pago de **$ 5.000 con efectivo de la caja**: `PAYMENT −5.000` → saldo **$ 25.300**; en la caja abierta, `OUT` / `SUPPLIER_PAYMENT` $ 5.000 (el esperado del arqueo baja $ 5.000).

Variante con "pagar ahora": la compra del ejemplo A con `payNow: { "source": "CASH_REGISTER", "amount": "24200" }` crea `PURCHASE +24.200` y `PAYMENT −24.200` (saldo **$ 0**) y la salida de caja de $ 24.200 en el mismo paso. Desde la puerta remota → `403 LOCAL_ONLY` y no se guarda nada.

### Ejemplo G — Anulación (paso 6 de "Cómo probarlo")

Con el saldo de $ 25.300 del ejemplo F, se anula la compra de $ 40.300: `PURCHASE_VOID −40.300` → saldo **−$ 15.000** (los $ 15.000 pagados quedan **a favor del kiosco**, H-55 a). El stock baja 24 y 10 unidades; los costos quedan en $ 833,33 y $ 1.500. Al cargar de nuevo la compra corregida, por ejemplo de $ 40.300, el saldo vuelve a **$ 25.300**. Si en lugar de eso el proveedor **devuelve la plata**: ejemplo H.

### Ejemplo H — Devolución del proveedor (H-65 a; `proveedores.md` 15.11)

Sigue al ejemplo G (saldo **−$ 15.000**, caja #9 abierta):

1. El proveedor devuelve **$ 15.000 en efectivo** y entran al cajón: `POST /api/suppliers/3/refunds` con `{ "amount": "15000", "source": "CASH_REGISTER", ... }` → `REFUND +15.000` → saldo **$ 0**; en la caja #9, `IN` / `SUPPLIER_REFUND` $ 15.000 (el esperado del arqueo **sube** $ 15.000). Desde la puerta remota → `403 LOCAL_ONLY` y no se guarda nada; sin caja abierta → `422 CASH_SESSION_REQUIRED`.
2. **Parcial:** devuelve $ 10.000 → saldo **−$ 5.000** (sigue a favor del kiosco).
3. **Después de la compra corregida** (H-68 b): con la compra corregida de $ 40.300 ya cargada el saldo es **+$ 25.300**; una devolución de $ 15.000 pide confirmación (`422 REFUND_EXCEEDS_CREDIT`) y, confirmada, deja **$ 40.300**: el kiosco le debe la compra corregida entera porque recuperó lo que había pagado.

### Pedido sugerido

Los casos (stock 3 y mínimo 10 → 7; stock = mínimo → 1; stock negativo −2 y mínimo 10 → 12; por peso) están en `proveedores.md` 11.2.

## 10. Códigos de error y acciones de auditoría nuevos

Van a `ERROR_CODES` en `shared` (más los de `proveedores.md` 12).

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `PURCHASE_REQUEST_ID_REUSED` | Esa compra ya se había guardado (compra #N). Revisá antes de cargarla de nuevo. |
| 409 | `PURCHASE_ALREADY_VOIDED` | Esta compra ya está anulada. |
| 422 | `DUPLICATE_DOCUMENT` | Ya cargaste un comprobante con ese número para este proveedor (compra #N). Confirmá si es otro. |
| 422 | `PURCHASE_TOTAL_ZERO` | La compra no puede dar $ 0. (H-63) |
| 422 | `PURCHASE_AMOUNT_OUT_OF_RANGE` | El importe es demasiado grande. Revisá los ceros. |
| 400 | `ATTACHMENT_TOO_LARGE` | El archivo pesa más de 10 MB. |
| 400 | `ATTACHMENT_TYPE_NOT_ALLOWED` | Solo se pueden adjuntar fotos JPG o PNG, o archivos PDF. |
| 422 | `ATTACHMENT_LIMIT_REACHED` | Esta compra ya tiene 10 adjuntos. |

Se usan también: `VALIDATION_ERROR`, `FORBIDDEN`, `LOCAL_ONLY`, `NOT_FOUND`, `UNSUPPORTED_MEDIA_TYPE`, `CASH_SESSION_REQUIRED`, `PRODUCT_NOT_FOUND`, `PRODUCT_INACTIVE`, `MISC_PRODUCT_NO_STOCK`, `STOCK_OUT_OF_RANGE`, `SUPPLIER_NOT_FOUND`, `SUPPLIER_INACTIVE`, `PAYMENT_EXCEEDS_BALANCE`, `DATE_IN_FUTURE`.

**Nota sobre el `400` de los adjuntos:** el plan pide "adjunto con tipo no permitido o muy grande → 400"; por eso un archivo grande es `400 ATTACHMENT_TOO_LARGE` y no el `413` del README (que sigue valiendo para los pedidos JSON de más de 100 KB).

Acciones de auditoría nuevas: `PURCHASE_CREATE`, `PURCHASE_ATTACHMENT_ADD`, `PURCHASE_ATTACHMENT_DELETE`. `PURCHASE_VOID` y `SUPPLIER_PAYMENT` ya estaban (modelo 2.21).

## 11. Cambios al modelo de datos (etapa 5)

Detalle en `docs/modelo-datos.md` (2.6, 2.7, 2.8, 2.9, 2.13, 2.17 a 2.20, 2.21, 2.22, diagrama y sección 4). Resumen para base-datos:

| Tabla | Cambio | Por qué |
|---|---|---|
| `suppliers` | `name` `varchar(80)` con índice único `lower(name)`; `phone` `varchar(10)` con `CHECK (phone ~ '^[0-9]{10}$')`; `email` `varchar(120)`; `tax_id` con índice (no único, H-58); `visit_days` `Weekday[]` default `{}`; `notes` `varchar(500)`. | `proveedores.md` 3 y 4. |
| `products` | **Agregar** `default_supplier_id` (FK, `onDelete: Restrict`, índice); `CHECK (NOT is_miscellaneous OR default_supplier_id IS NULL)`. | PA-04 (R2 del plan). |
| `purchases` | **Agregar** `client_request_id uuid UNIQUE NOT NULL`, `request_hash char(64) NOT NULL`; `document_number varchar(30)`; `notes varchar(500)`; `CHECK`s: `net_total >= 0`, `vat_total >= 0`, `other_charges_amount >= 0`, `total > 0`, `total = net_total + vat_total + other_charges_amount`, anulación ⇔ campos de anulación; índices `(supplier_id, document_type, document_number)`, `document_date`, `user_id`, `voided_by_id`. `vatTotal` = suma del IVA **por alícuota** (4.2). | 5.3, 4.2, H-63. |
| `purchase_items` | `CHECK`s: `PACK` ⇔ campos de bulto; `PACK` ⇒ `quantity = pack_count * units_per_pack` **y** `line_net_total = pack_count * pack_net_cost` **y** `pack_count = trunc(pack_count)`; `unit_cost >= unit_net_cost`; `line_net_total >= 0`; `line_total >= line_net_total`. | 4.1. |
| `purchase_attachments` | **Agregar** `deleted_at timestamptz` y `deleted_by_id` (FK a `users`, con índice), con `CHECK ((deleted_at IS NULL) = (deleted_by_id IS NULL))` (H-54 b, 8.4); `original_file_name varchar(120)`; `stored_file_name varchar(40) UNIQUE` con `CHECK (stored_file_name ~ '^[0-9a-f]{32}\.(jpg|png|pdf)$')`; `CHECK (mime_type IN ('image/jpeg','image/png','application/pdf'))`; índice `uploaded_by_id`. | 8, ADR 005. |
| `supplier_account_entries` | **Nuevo tipo** `OPENING_BALANCE` (índice único parcial `(supplier_id) WHERE type = 'OPENING_BALANCE'`); **agregar** `client_request_id uuid UNIQUE` y `request_hash char(64)` (nulos salvo en pagos sueltos); `CHECK`s por tipo (modelo 2.20); `reference varchar(100)`, `description varchar(200)`. | `proveedores.md` 7 a 10. |
| `cash_movements` | **FK** de `supplier_account_entry_id` → `supplier_account_entries` (la columna ya existe, sin FK). | Modelo 2.13. |
| `supplier_account_entries`, `cash_movements` (**cierre de la etapa 5**) | Enums nuevos `REFUND` y `SUPPLIER_REFUND`; se reescriben 3 `CHECK`s de la cuenta y 2 de la caja, en **dos migraciones** (enums primero). | H-65; SQL en `proveedores.md` 15.7. |
| `stock_movements`, `price_changes` | **FK** de `purchase_item_id` y `purchase_id` (las columnas ya existen, sin FK). | Modelo 2.8 y 2.9. |

No hace falta migrar datos: todavía no hay compras ni proveedores reales.

## 12. Decisiones del dueño (2026-11-26)

Eran preguntas pendientes (H-54 a H-64, `requisitos.md` 7.9); no estaban en el relevamiento. **El dueño aceptó todas las recomendaciones** (`relevamiento.md` "Etapa 5") y ya están en este contrato. La última columna dice dónde quedaron; la tabla conserva las opciones como registro.

| H | Pregunta | Opciones | Decisión (= recomendación) | Dónde |
|---|---|---|---|---|
| H-54 | **¿Se puede borrar un adjunto?** (foto equivocada, foto personal subida por error, factura de otra compra) | a) No: solo se agregan, como las notas de caja. b) Sí, encargado y dueño, con auditoría (quién, cuándo, nombre y tamaño); el archivo se borra del disco (queda en las copias anteriores). c) Como b), pero solo el dueño. | b): una foto personal o de otra factura no debería quedar pegada a la compra para siempre, y la auditoría deja rastro. | b): borrado lógico de la fila y físico del archivo, desde cualquier puerta (8.4). |
| H-55 | **Anular una compra ya pagada** (total o parcialmente, con "pagar ahora" o con pagos sueltos). ¿Y desde afuera? | a) Se anula igual: se revierte la deuda por el total y los pagos quedan como están; el saldo puede quedar a favor del kiosco hasta cargar la compra corregida; la salida de caja no vuelve sola. b) No se anula si tuvo "pagar ahora" (como los pagos no se anulan, esa compra no se podría corregir nunca). c) a) y además se revierten solos los pagos de "pagar ahora" (con un ingreso en la caja abierta si fue efectivo). Desde afuera: i) sí, como cargar compras (ADR 003); ii) no, como el ajuste de stock. | a) + i): el pago existió de verdad, y al cargar la compra corregida el saldo vuelve a cuadrar (ejemplo G). | a) + i) (7, ejemplo G) |
| H-56 | **¿Un pago puede superar la deuda** (saldo a favor del kiosco)? | a) Sí, sin aviso. b) No: `422`. c) Sí, con confirmación explícita (la pantalla muestra el saldo que quedaría). | c): cubre un pago adelantado y frena un cero de más. | c) (`proveedores.md` 8.2 paso 7; 5.2 paso 10) |
| H-57 | **¿Se puede comprar un producto desactivado?** | a) No (`422 PRODUCT_INACTIVE`); la pantalla ofrece reactivarlo (encargado y dueño, H-26) y seguir. b) Sí, y sigue desactivado (suma stock). c) Sí, y la compra lo reactiva sola. | a): explícito, igual que en la venta (H-34). | a) (5.2 paso 8) |
| H-58 | **¿Dos proveedores con el mismo CUIT?** (por ejemplo, la misma empresa con dos preventistas, días de visita y WhatsApp distintos) | a) No: CUIT único (`409`). b) Sí, con confirmación. c) Sin control. | b): permite el caso real y avisa del error de tipeo. | b) (`proveedores.md` 5.3) |
| H-59 | **Proveedor desactivado:** ¿con saldo o con productos que lo tienen como habitual? ¿Recibe compras y pagos? ¿Se reactiva? | a) Se desactiva siempre; conserva saldo e historial; sus productos lo mantienen como habitual; no recibe compras nuevas ni se asigna a productos, pero sí pagos, saldo inicial y ajustes; se reactiva (encargado y dueño). b) No se desactiva con saldo distinto de 0. c) a), y al desactivarlo se quita como habitual de sus productos. | a): como H-31 con los productos; deja cancelar la deuda. | a) (`proveedores.md` 5.4) |
| H-60 | **¿Una compra puede tener productos de otro proveedor** que el habitual (o sin habitual)? | a) Sí; el habitual no cambia; la pantalla avisa ("su proveedor habitual es X"). b) a), pero si el producto no tenía habitual, queda este. c) La compra cambia siempre el habitual (como el último costo). d) No se permite. | a): el habitual se elige a propósito (ficha o asignación), no por la última compra. | a) (4.3) |
| H-61 | **¿La fecha del comprobante puede ser distinta de hoy?** ¿Y la de un pago? | a) Cualquier fecha pasada, no futura; por defecto hoy. El stock y el costo cambian al guardar, sea cual sea la fecha. La deuda queda con la fecha del comprobante. Un pago con efectivo de la caja es siempre de hoy. b) Solo hoy. c) Cualquier fecha, también futura. | a): las facturas llegan con su fecha y a veces se cargan días después. | a) (5.2 paso 5; `proveedores.md` 8.2 paso 5) |
| H-62 | **Saldo inicial: ¿quién lo carga y con qué signo?** (lo aprobado dice "al instalar" y "solo el dueño" para las correcciones) | a) Solo el dueño, positivo (le debemos) o negativo (nos debe). b) Encargado y dueño. c) Solo positivo. | a). | a) (`proveedores.md` 9) |
| H-63 | **Línea con costo $ 0** (bonificación, "12 + 1 sin cargo") **y compra de $ 0** | a) Costo 0 permitido: suma stock pero **no pisa** el costo del producto (si no, quedaría con costo 0 y sin precio sugerido); una compra con total $ 0 no se permite. b) Costo 0 no permitido: las unidades sin cargo se suman a la línea (por bulto: 13 por bulto; por unidad: la cantidad total con el costo prorrateado). c) Costo 0 permitido y pisa el costo (PA-05 literal: "el último pagado"). | a). | a) (4.3; 5.2 paso 9) |
| H-64 | **El mismo producto en dos líneas** de una compra (un bulto y unidades sueltas, o la bonificación aparte) | a) Se permite; el costo que queda es el de la última línea con costo mayor que 0, en el orden cargado. b) No: una línea por producto (`422`). | a): es como viene la factura; con H-63 a, la bonificación va en su propia línea. | a) (4.3) |

**Ya definidos por documentos aprobados** (no se preguntan):
- **Quién da de alta, edita y desactiva proveedores:** encargado y dueño (PRV-06, matriz). El empleado no accede a proveedores, compras ni adjuntos (matriz; plan etapa 5).
- **Saldo inicial y correcciones con motivo, solo el dueño** (plan 5, punto 5).
- **Pago con efectivo de la caja:** genera la salida de caja (CAJ-07) y no se hace desde afuera (PRV-06, ADR 003), tampoco en "pagar ahora".
- **Anular revierte stock y deuda, no costos** (COM-09, PA-25); **toda compra suma deuda**, también la pagada en el acto (PA-07); **último costo** (PA-05); **unidades por bulto: queda la última usada** (H-07 a); **otros cargos a la deuda y no al costo** (H-16 a); **pedido sugerido** con "al menos 1" y sin guardar pedidos (H-08 b, H-12 a).
- **El precio no cambia con la compra en esta etapa** (R3).

### 12.1 Decisiones del dueño (2026-11-27, cierre de la etapa 5)

| H | Pregunta | Opciones | Decisión | Dónde |
|---|---|---|---|---|
| H-65 | **Devolución de plata del proveedor** tras anular una compra pagada. | a) Un movimiento "Devolución del proveedor" que, en un solo paso, suma a la caja y baja el saldo a favor del kiosco. b) Dos pasos a mano (ajuste del dueño + ingreso "Otro" en la caja). c) No registrarlo. | **a)** | `proveedores.md` 15 (detalles H-67 b, H-68 b, H-69 a, H-70 a y H-71 a, resueltos: `proveedores.md` 16); 7 paso 7; ejemplo H |
| H-66 | **Fotos en una compra anulada.** | a) Se pueden agregar y borrar (son documentación, por ejemplo la nota de crédito del proveedor). b) La compra anulada queda congelada. | **a)** (ya funcionaba así) | 7, 8.1 paso 1, 8.4 paso 1 |

## 13. Notas para los demás agentes

- **base-datos:** sección 11 y `modelo-datos.md`. Migración nueva con los `CHECK` e índices parciales a mano y un test por cada uno (R8 del plan). Enum `Weekday` nuevo en Prisma; `SupplierEntryType` suma `OPENING_BALANCE`. Seed: proveedores de ejemplo, habitual en algunos productos con `unitsPerPack`, y una compra de ejemplo armada con `calculatePurchase` (no números escritos a mano).
- **backend:**
  - `shared/purchases/`: esquemas de la sección 3 y `calculatePurchase` con los ejemplos A a E como tests.
  - `POST /api/purchases` en el orden exacto de 5.2; bloqueos proveedor → caja → productos; `clientRequestId` + `requestHash` como en ventas (huella con números normalizados).
  - Subidas: `RouteSpec` suma `body: 'multipart'`; `requireJsonBody` no se aplica a esas rutas y el lector de `multipart` (por ejemplo, `multer` con `memoryStorage`, `limits: { fileSize, files: 1, fields: 0, parts: 1 }`) va **después** de sesión, rol y existencia de la compra. Validación de `UPLOADS_DIR` y `UPLOAD_MAX_MB` en `config.ts` (la API no arranca si la carpeta no se puede escribir). Al arrancar, borrar los `.tmp` de más de una hora y los archivos de filas con `deletedAt`, y avisar en el log si hay archivos sin fila (esos no se borran solos, ADR 005). La única ruta `DELETE` es la de 8.4.
  - El control de `CASH_REGISTER` desde afuera es la misma función que usa el pago (`proveedores.md` 8.2 paso 2).
- **frontend (`/impeccable`):** carga rápida con teclado: buscar producto (lector o nombre), elegir "Unidad" o "Bulto" por línea (con bulto, precarga `unitsPerPack` del producto), costo neto e IVA (precargado con el del producto), y totales en vivo con `calculatePurchase` (neto, IVA por alícuota, otros cargos, total) para comparar con la factura; aviso si el producto es de otro proveedor (H-60); "Pagar ahora" con los 4 orígenes (sin "efectivo de la caja" si el acceso es remoto); después de guardar, subir las fotos (`FormData` sin `Content-Type`, con `X-Kiosco`) y mostrar `costChanges` con link a Precios. Confirmaciones por `422 DUPLICATE_DOCUMENT` y `PAYMENT_EXCEEDS_BALANCE`. Mensajes por `code`.
- **qa:** unitarios de la sección 9 (A a E) y de `detectAttachmentType`; borrar un adjunto (encargado → `204`, empleado → `403`, después su `GET` → `404`, el archivo ya no está en disco, la fila queda con `deletedAt` y la auditoría tiene el nombre; borrar dos veces → `404`; el tope de 10 no cuenta los borrados); integración (plan): la compra suma stock, actualiza costos (y `unitsPerPack`) y crea la deuda; "pagar ahora" con efectivo de la caja crea la salida de caja y desde la remota da `403 LOCAL_ONLY` sin guardar nada; anular revierte stock y deuda pero no los costos; adjunto con tipo no permitido (un `.txt` renombrado a `.jpg`) o de más de 10 MB → `400`; un empleado → `403` en compras y adjuntos (también el `GET` del archivo); el `GET` de un adjunto de otra compra → `404`; doble envío con el mismo `clientRequestId` → una sola compra; comprobante repetido → `422` y con confirmación → `201`; ninguna respuesta trae `storedFileName`.
- **Etapa 6 (precio después de la compra):** notas para cada agente en `precios.md` 13 a 16 (`CostChange` ampliado, `costChanges` en el detalle y `POST /api/purchases/:id/price-updates`). `costChangesOf` tiene que tomar la **primera** fila `PriceChange` de cada producto (ordenar por `id`), porque las decisiones de precio agregan filas `PURCHASE` de la misma compra.
- **Devolución del proveedor (cierre de la etapa 5):** notas para cada agente en `proveedores.md` 15.7 a 15.10. En la pantalla de una compra anulada que tenía pagos, link a **Registrar devolución** (15.9); qa suma el ejemplo H.
- **seguridad:** revisar en especial la sección 8 y el ADR 005 (tipo real, tamaño, nombres aleatorios, que no se pueda leer otra ruta del disco, encabezados al servir, acceso solo con permiso), el bloqueo remoto de "pagar ahora" con efectivo de la caja, la visibilidad de costos (encargado sí, empleado nunca) y la auditoría de compras, pagos y anulaciones.
