# API — Precios: aumentos masivos, precios después de una compra e historial

> Etapa 6, tarea 1. Requisitos: **PRE-05** (aumento masivo), **PRE-06** (historial), **PRE-08** (el encargado ve costos en precios), **COM-06** (aviso de cambio de costo con precio sugerido); PA-03, PA-19, PA-21, PA-22, PA-23, H-05, H-15 a, H-24 a; venta a pérdida con confirmación (decisión del dueño, cierre de la etapa 2).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero, redondeos, precio sugerido), ADR 003 (puertas: **aumentos masivos desde afuera ✅**, `relevamiento.md` "Etapa 1") y **ADR 007** (vista previa y confirmación con huella).
> Modelo: `Product`, `PriceChange`, `BulkPriceUpdate` (`docs/modelo-datos.md` 2.7, 2.9, 2.10 y sección 4). Cambios al modelo de esta etapa: sección 13.
> Cambia otros contratos (solo agrega): `productos-stock.md` (rutas de precios, 7.4 y 7.5) y `compras.md` (`CostChange` con precio sugerido, `costChanges` en el detalle y la ruta nueva de 8.2).
> **H-72 a H-76 resueltos por el dueño (2026-11-27)**, aceptando todas las recomendaciones: H-72 a, H-73 a, H-74 c, H-75 a, H-76 a (sección 12, `requisitos.md` 7.10 y `relevamiento.md` "Etapa 6"). Ya están en este contrato.

## 1. Resumen de rutas

| Método y ruta | Qué hace | Acceso | Roles |
|---|---|:---:|---|
| `GET /api/bulk-price-updates/preview` | **Vista previa** de un aumento masivo (no guarda nada) | `any` | OWNER, MANAGER |
| `POST /api/bulk-price-updates` | **Confirmar** el aumento masivo (una transacción) | `any` | OWNER, MANAGER |
| `GET /api/bulk-price-updates` | Aumentos anteriores (paginada) | `any` | OWNER, MANAGER |
| `GET /api/bulk-price-updates/:id` | Ver un aumento con el antes y después de cada producto | `any` | OWNER, MANAGER |
| `POST /api/purchases/:id/price-updates` | **Guardar los precios elegidos** después de una compra que cambió costos (COM-06) | `any` | OWNER, MANAGER |
| `GET /api/products/:id/price-changes` | **Historial de precios y costos** de un producto (PRE-06, paginado) | `any` | OWNER, MANAGER |

- Todas piden sesión. Los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **EMPLOYEE → `403 FORBIDDEN` en todas** (matriz: "Cambiar precios y hacer aumentos masivos" ❌; PA-03: el empleado nunca ve costos). Rol antes que puerta.
- **Todas son `access: 'any'`:** el dueño decidió que los aumentos masivos **sí** se hacen desde afuera (`relevamiento.md` "Etapa 1", ADR 003 punto 6); precios y compras también (ADR 003). Por la puerta remota solo entran encargado y dueño.
- **Orden de registro en Express:** `/api/bulk-price-updates/preview` va **antes** que `/api/bulk-price-updates/:id` (si no, `preview` se toma como un `id` y da `400`).

## 2. Visibilidad por rol

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Vista previa y aumentos (costos neto y final, precio, margen, margen real) | ❌ `403` | ✅ | ✅ | PRE-05, PRE-08, PA-03 ("pantallas de precios") |
| Aviso de cambio de costo de una compra con **precio sugerido** y margen | ❌ `403` | ✅ | ✅ | COM-06, COM-10, PA-03 ("pantallas de compras"); nota PA-03 del plan (etapa 6) |
| Historial de precios y costos de un producto | ❌ `403` | ✅ | ✅ | PRE-06, PA-03; igual que el historial de stock (aprobado 2026-11-25) |

- Son **rutas de precios** (`productos-stock.md` 2.1): el encargado ve costos acá, como en `GET /api/products/:id/pricing`. Encargado y dueño reciben **el mismo esquema**: no hay ganancia ni stock valorizado en estas pantallas.
- **Confirmación de la nota PA-03 del plan:** el precio sugerido que se agrega a `costChanges` (sección 8) es de encargado y dueño, igual que el costo. Con precio + margen + IVA se despeja el costo, así que **nunca** viaja a un empleado (no llega: toda ruta de compras le da `403`).
- Las respuestas se arman campo por campo y pasan por `parseResponse` del esquema (README 6). Test obligatorio de qa: con sesión de **empleado**, todas las rutas de este documento → `403`.

## 3. Esquemas (van a Zod en `@kiosco/shared`, carpeta nueva `pricing/`)

Requests **estrictos** (campo desconocido → `400`); respuestas sin `strict`. `Money`, `Percent`, `SignedPercent`, `UserRef`, `ClientRequestIdSchema`, `QueryIdSchema`, `DateOnlySchema` y `PaginatedSchema` como en `productos-stock.md` 3, `ventas.md` 4.1 y `compras.md` 3.

### 3.1 Campos y enums

| Esquema | Tipo y reglas |
|---|---|
| `BulkUpdateScopeSchema` | `"SUPPLIER"` (por proveedor habitual) \| `"CATEGORY"` (por categoría, con subcategoría opcional, H-74 c). Enum `BULK_UPDATE_SCOPES` (modelo 2.22). |
| `BulkUpdateTargetSchema` | `"COST"` (sube costo neto y final; el precio se recalcula con margen, IVA y redondeo) \| `"SALE_PRICE"` (sube el precio y se redondea). PA-23. Enum `BULK_UPDATE_TARGETS`. |
| `BulkPercentInputSchema` | string `^\d{1,3}(\.\d{1,2})?$`, **mayor que 0** (solo aumentos, PA-23) y **hasta `MAX_BULK_PRICE_PERCENT` = `"100"`** inclusive (H-75 a: si hace falta más, se hacen dos aumentos). `"0"`, `"-5"`, `"10.555"`, `"100.01"`, `"150"` o un número de JSON → `400`. |
| `PreviewHashSchema` | string `^[0-9a-f]{64}$` (SHA-256 en hexadecimal, ADR 007). |
| `PriceChangeSourceSchema` | `"MANUAL"` \| `"PURCHASE"` \| `"BULK_UPDATE"` \| `"IMPORT"` (la última llega en la etapa 8). Enum `PRICE_CHANGE_SOURCES`. |
| `BulkPriceSkipReasonSchema` | `"NO_COST"` (sobre costo, con costo neto 0: no hay de dónde sacar el precio) \| `"ZERO_PRICE"` (sobre precio, con precio 0) \| `"NO_CHANGE"` (el redondeo deja todo igual). |
| `PurchasePriceModeSchema` | `"SUGGESTED"` (usar el sugerido) \| `"MANUAL"` (precio escrito a mano). Enum `PURCHASE_PRICE_MODES`. |
| `PriceSnapshotSchema` | `{ netCostPrice: Money; costPrice: Money; salePrice: Money }`: costo neto, costo final y precio de venta en un momento. |

Constantes en `shared`: `MAX_BULK_PRICE_PRODUCTS = 2000` (tope técnico, como los 200 renglones de una venta, H-43 a; también es el máximo de `excludedProductIds`) y `MAX_BULK_PRICE_PERCENT = '100'` (H-75 a).

### 3.2 Requests

```ts
// Qué productos entran y qué sube. Se usa en la vista previa (query) y en la confirmación (cuerpo).
// Unión por `scope` (las reglas se controlan con superRefine; error en el campo que corresponde).
BulkPriceSelection = (
  | { scope: 'SUPPLIER'; supplierId: number }                          // sin categoryId ni subcategoryId
  | { scope: 'CATEGORY'; categoryId: number; subcategoryId?: number }  // subcategoryId opcional (H-74 c)
) & { target: BulkUpdateTarget; percent: BulkPercent }
// Reglas (400 en el campo que corresponde): SUPPLIER pide supplierId y rechaza categoryId y subcategoryId;
// CATEGORY pide categoryId y rechaza supplierId. subcategoryId nunca va solo (siempre con su categoryId).

BulkPricePreviewQuerySchema = BulkPriceSelection    // ids como QueryIdSchema (strings de la query)
// GET /api/bulk-price-updates/preview?scope=SUPPLIER&supplierId=3&target=COST&percent=8
// GET /api/bulk-price-updates/preview?scope=CATEGORY&categoryId=2&subcategoryId=5&target=SALE_PRICE&percent=10
// La vista previa NO recibe exclusiones (excludedProductIds en la query → 400): siempre muestra
// todos los productos del alcance. Destildar pasa solo en la pantalla y no pide otra vista previa.

CreateBulkPriceUpdateRequestSchema = BulkPriceSelection & {
  clientRequestId: ClientRequestId;     // UUID por vista previa (6.2), como ventas y compras
  previewHash: PreviewHash;             // la huella que devolvió la vista previa (ADR 007)
  excludedProductIds?: number[];        // H-74 c: productos DESTILDADOS en la vista previa (no se tocan).
                                        // Enteros positivos, sin repetidos, de 0 a 2000 (MAX_BULK_PRICE_PRODUCTS).
                                        // Default []. El orden no importa. Cada uno tiene que estar en
                                        // items de la vista previa (6.1 paso 7).
  confirmBelowCost?: boolean;           // confirma que algunos de los que SÍ cambian quedan a pérdida (4.4)
}
// NO acepta: precios, costos, márgenes ni una lista de productos a cambiar (→ 400).
// Se mandan los EXCLUIDOS y no los incluidos: así un producto que se sumó al alcance después de la
// vista previa cambia la huella (409) en lugar de quedar afuera sin que nadie lo vea (4.5).
// El servidor recalcula TODO desde la base (README 7); la pantalla solo dice "lo que vi" con la huella.

BulkPriceUpdateListQuerySchema = {
  page?; pageSize?;                     // README 5
  from?: string; to?: string;           // YYYY-MM-DD, día CALENDARIO de Buenos Aires, ambos incluidos
  scope?: BulkUpdateScope; supplierId?: number; categoryId?: number;
}                                       // orden: más nuevo primero

PurchasePriceUpdateItemInput = {
  productId: number;
  mode: PurchasePriceMode;              // SUGGESTED o MANUAL
  salePrice: Money;                     // SUGGESTED: el sugerido que MOSTRÓ la pantalla (se compara, 8.2 paso 6)
}                                       // MANUAL: el precio elegido (como PRE-04)
PurchasePriceUpdateRequestSchema = {
  items: PurchasePriceUpdateItemInput[];  // 1 a 200, sin productId repetido (400)
  confirmBelowCost?: boolean;             // 4.4
}
// "Dejar el precio como estaba" = no mandar ese producto (COM-06).

PriceChangeListQuerySchema = {
  page?; pageSize?;
  source?: PriceChangeSource;
  from?: string; to?: string;           // YYYY-MM-DD, día calendario de Buenos Aires
}                                       // orden: createdAt descendente, después id descendente
```

### 3.3 Respuestas

```ts
BulkPricePreviewItemSchema = {
  productId: number; name: string; barcode: string | null; saleUnit: SaleUnit;
  category: { id; name }; subcategory: { id; name };
  defaultSupplier: { id; name } | null;
  vatRatePercent: Percent;                  // IVA de VENTA del producto
  effectiveMarginPercent: Percent; marginSource: MarginSource;   // PA-22
  before: PriceSnapshot;
  after: PriceSnapshot;                     // COST: neto, final y precio nuevos; SALE_PRICE: solo cambia el precio
  suggestedPrice: Money | null;             // COST: el sugerido con el costo nuevo; SALE_PRICE: null
  keepsPrice: boolean;                      // COST: el sugerido es MENOR que el precio actual → el precio queda (H-72 a); SALE_PRICE: false
  salePriceChangePercent: SignedPercent | null;  // (nuevo − anterior) ÷ anterior × 100; null si el anterior es 0
  realMarginPercentBefore: SignedPercent | null; // margen real (PA-21) con los valores de antes; null si costo 0
  realMarginPercentAfter: SignedPercent | null;
  isBelowCost: boolean;                     // el precio que queda es a pérdida (4.4)
}

BulkPriceSkippedItemSchema = { productId: number; name: string; reason: BulkPriceSkipReason }

BulkPricePreviewSchema = {
  scope: BulkUpdateScope;
  supplier: { id; name; isActive } | null;
  category: { id; name } | null; subcategory: { id; name } | null;
  target: BulkUpdateTarget; percent: Percent;
  priceRoundingStep: Money;                 // el de Setting (para explicar el redondeo)
  items: BulkPricePreviewItem[];            // los que cambian (todos tildados al abrir); orden por nombre (como productos-stock.md 1)
  skipped: BulkPriceSkippedItem[];          // los que no cambian y por qué (sin casilla); mismo orden
  affectedCount: number;                    // items.length (sin descontar destildados: la pantalla los resta)
  keepsPriceCount: number;                  // cuántos de items tienen keepsPrice
  belowCostCount: number;                   // cuántos de items quedan a pérdida
  previewHash: string;                      // ADR 007: se manda tal cual al confirmar
}

BulkPriceUpdateItemSchema = {               // un producto de un aumento ya hecho (sale de su PriceChange)
  priceChangeId: number; productId: number; productName: string;   // nombre ACTUAL
  before: PriceSnapshot; after: PriceSnapshot;
}

BulkPriceUpdateListItemSchema = {
  id: number;                               // número de aumento
  scope; supplier: { id; name } | null; category: { id; name } | null; subcategory: { id; name } | null;
  target; percent: Percent; priceRoundingStep: Money;
  productsAffected: number;                 // los que cambiaron (= items del detalle)
  productsExcluded: number;                 // los destildados (H-74 c); cuáles, en la auditoría (6.4)
  user: UserRef; createdAt: string;
}
BulkPriceUpdateDetailSchema = BulkPriceUpdateListItem & { items: BulkPriceUpdateItem[] }   // orden por nombre

CreateBulkPriceUpdateResponseSchema = {
  bulkPriceUpdate: BulkPriceUpdateDetail;
  isReplay: boolean;                        // true = reintento con el mismo clientRequestId (6.2)
}

PriceChangeItemSchema = {                   // una fila del historial (PRE-06)
  id: number; productId: number; source: PriceChangeSource;
  oldNetCostPrice: Money; newNetCostPrice: Money;
  oldCostPrice: Money; newCostPrice: Money;
  oldSalePrice: Money; newSalePrice: Money;
  oldMarginPercent: Percent | null; newMarginPercent: Percent | null;   // margen PROPIO; null = heredaba / hereda
  changedFields: ('NET_COST' | 'COST' | 'SALE_PRICE' | 'MARGIN')[];    // calculado: qué cambió en esta fila
  purchase: { id: number; supplierName: string; documentNumber: string | null } | null;   // source PURCHASE
  bulkPriceUpdate: { id: number; target: BulkUpdateTarget; percent: Percent } | null;     // source BULK_UPDATE
  user: UserRef;
  createdAt: string;
}
```

Los esquemas de la compra (`CostChange` ampliado y `PurchasePriceUpdateResponse`) están en la sección 8 y van a `shared/purchases/`.

## 4. Cálculo del aumento masivo (una sola función de `shared`)

`calculateBulkPriceItem({ target, percent, netCostPrice, costPrice, salePrice, vatRatePercent, effectiveMarginPercent, priceRoundingStep })` devuelve, para **un** producto, `{ skipReason } | { after, suggestedPrice, keepsPrice, isBelowCost, ... }`. La usan la vista previa y la confirmación (el servidor), y los tests. Usa `roundToCents` (R-1), `roundPriceUp` (R-3), `suggestedPrice`, `realMargin` y `effectiveMargin` del ADR 002 y `productos-stock.md` 7.1; nunca `number`. `factor = 1 + percent/100`.

### 4.1 Sobre costo (`target = COST`)

| Dato | Regla |
|---|---|
| Costo neto nuevo | `R-1( netCostPrice × factor )` |
| Costo final nuevo | `R-1( costPrice × factor )`: **el mismo %** que el neto (modelo 2.10). No se recalcula desde el neto porque el producto no guarda el IVA de la última factura (puede ser 0 % en una factura C). |
| Sugerido | `suggestedPrice(costo neto nuevo, margen que se usa, IVA de venta, paso)`: margen sobre el **neto** (H-15 a), cadena producto → subcategoría → categoría (PA-22), **hacia arriba** al paso (PA-19). |
| Precio nuevo | ⏳ **H-72 a:** el **mayor** entre el sugerido y el precio actual. Si el sugerido es menor o igual al precio actual (por ejemplo, un precio puesto a mano más alto), **el precio queda igual** y `keepsPrice = true`; el costo sube igual. |
| Se saltea | Costo neto **0** → `NO_COST` (no hay costo para recalcular; el sugerido es `null`, `productos-stock.md` 7.1). Si neto, final y precio quedan iguales por el redondeo → `NO_CHANGE`. |

- El margen guardado **no cambia** (PA-21, D7). El IVA tampoco.
- **Diferencia de un centavo:** como neto y final se redondean por separado, el final puede diferir en $ 0,01 de `finalFromNet(neto nuevo, IVA de la última compra)`. No hay ningún `CHECK` que lo use; la próxima compra lo corrige. Se mantiene `costPrice >= netCostPrice` (el mismo factor sobre dos valores ordenados no los invierte).

### 4.2 Sobre precio (`target = SALE_PRICE`)

| Dato | Regla |
|---|---|
| Precio nuevo | `R-3( salePrice × factor )`: **siempre hacia arriba** al paso (PA-19). Si ya da un múltiplo, queda ese (1.700 × 1,10 = 1.870 → **$ 1.870**). Con paso 0, solo R-1. |
| Costos | **No cambian.** |
| Se saltea | Precio **0** → `ZERO_PRICE`. Precio igual después del redondeo → `NO_CHANGE` (solo posible con paso 0 y montos mínimos). |

Con costo 0 el producto **sí** entra (se sube el precio): el control de venta a pérdida no aplica con costo 0 (`productos-stock.md` 7.4).

### 4.3 Qué productos entran

| Condición | Regla | Origen |
|---|---|---|
| Por proveedor | Productos con `defaultSupplierId = supplierId` (proveedor **habitual**). Un producto sin proveedor habitual nunca entra por proveedor (no tiene). Un proveedor **desactivado** se puede elegir: sus productos lo conservan como habitual (H-59 a) y esto es solo un filtro. | PRE-05, PA-04 |
| Por categoría | Productos de cualquier subcategoría de esa categoría; o solo de **una subcategoría** (⏳ H-74 b). | PRE-05 |
| Activos | **Solo productos activos** (⏳ H-73 a). Los desactivados no aparecen ni en `items` ni en `skipped`; la pantalla lo aclara con una línea fija. | — |
| "Varios" | **Nunca** (no tiene costo ni precio guardado, H-09, `productos-stock.md` 7.3). | H-09 |
| Destildados | Los `excludedProductIds` de la confirmación no se tocan (⏳ H-74 c). Tienen que estar en `items` de la vista previa; si no → `422 BULK_UPDATE_EXCLUDED_NOT_IN_SCOPE`. | — |
| Tope | Si `items` tiene más de **2000** productos → `422 BULK_UPDATE_TOO_MANY_PRODUCTS` (`details: { count, max }`), en la vista previa y en la confirmación. Es un **tope técnico** (tamaño de la respuesta y tiempo de la transacción), no una regla del negocio; se divide por subcategoría o por proveedor. | Plan, seguridad etapa 6 |

### 4.4 Venta a pérdida (regla ya aprobada, cierre de la etapa 2)

**Se permite, con confirmación explícita** (`productos-stock.md` 7.4). Función nueva en `shared` para que pantalla y servidor den lo mismo:
`isBelowCost(salePrice, netCostPrice, costPrice, vatRatePercent)` = costo neto > 0 **y** (`salePrice < costPrice` **o** margen real negativo). Hoy la regla vive en `products.service.ts` (`assertNotBelowCost`): backend la pasa a usar esta función (sin cambiar el comportamiento).

| Dónde | Cuándo pide confirmación |
|---|---|
| Aumento masivo | Si algún producto que se va a cambiar queda con `isBelowCost` (por ejemplo, uno que ya vendía a pérdida y sube un 10 % sobre el precio). Sin `confirmBelowCost: true` → `422 PRICE_BELOW_COST` con `details: { "items": [ { productId, name, salePrice, costPrice, realMarginPercent } ] }`. La vista previa ya los marca, así que la pantalla pide la confirmación **antes** de mandar. |
| Precio después de una compra (8.2) | Si algún precio elegido (sugerido o a mano) queda a pérdida con el costo nuevo. Mismo `422` con `details.items`. |
| "Dejar igual" después de una compra | No se guarda nada, así que no hay nada que confirmar: el aviso **marca en rojo** que el precio actual queda a pérdida (`isBelowCost` del `CostChange`, 8.1) (⏳ H-76 a). |

`details.items` es la forma **en lista** del mismo código (en el alta y en `/pricing` sigue la forma de un solo producto, `productos-stock.md` 7.4). La auditoría suma `confirmedBelowCost: true` y la lista de productos.

### 4.5 La huella de la vista previa (ADR 007)

La confirmación **no acepta precios de la pantalla** (plan, seguridad): manda **los mismos parámetros** que la vista previa y la **huella** (`previewHash`) que esta devolvió. El servidor vuelve a calcular todo **con las filas bloqueadas**, calcula la huella de nuevo y, si no coincide, **no guarda nada** (`409 BULK_PREVIEW_OUTDATED`). Así se cumple "la confirmación coincide con la vista previa" sin guardar la vista previa en ningún lado.

`previewHash = SHA-256` (hex) del texto JSON de, en este orden exacto:

```text
{ "v": 1, "scope", "supplierId", "categoryId", "subcategoryId", "target",
  "percent" (2 decimales), "priceRoundingStep" (2 decimales),
  "items":   [ [productId, antes.neto, antes.final, antes.precio, margen que se usa, IVA,
                después.neto, después.final, después.precio], ... ]   ← por productId ascendente
  "skipped": [ [productId, reason], ... ] }                            ← por productId ascendente
```

- Importes con 2 decimales como texto (`"1000.00"`), ids como números, `null` para lo que no viene. La función vive en el **backend** (`apps/api`, usa `node:crypto`); la pantalla no la calcula, solo la devuelve tal cual.
- **Cubre todo lo que puede cambiar el resultado:** un precio, costo o margen tocado por otro usuario, un producto nuevo, desactivado o movido de proveedor o categoría, otro paso de redondeo. Las exclusiones (⏳ H-74 c) **no** entran en la huella: se mandan aparte y se validan contra `items`.
- **No es un secreto:** como el servidor recalcula todo, alguien que "fabrique" una huella solo logra que pase si coincide con lo que el servidor calcula en ese momento. No hace falta firmarla.
- **Un doble envío nunca aplica el aumento dos veces:** después del primero los precios de "antes" ya son otros, la huella deja de coincidir y el segundo da `409` (o `200` con `isReplay` si trae el mismo `clientRequestId`, 6.2).

## 5. `GET /api/bulk-price-updates/preview` — Vista previa

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (PRE-05).
- **Query:** `BulkPricePreviewQuerySchema`. Es un `GET` porque **no cambia nada** (README 1.1).
- **Qué hace** (solo lectura, sin bloquear filas):
  1. Valida formato (`400`): `percent` 0, negativo, con 3 decimales o mayor que 100 (⏳ H-75); `supplierId` con `scope=CATEGORY`, etc.
  2. Que exista el proveedor (`422 SUPPLIER_NOT_FOUND`) o la categoría (`422 CATEGORY_NOT_FOUND`); que la subcategoría exista y sea de esa categoría (`422 SUBCATEGORY_NOT_IN_CATEGORY`, ⏳ H-74).
  3. Lee los productos que entran (4.3) con sus márgenes (producto, subcategoría, categoría) y el paso de redondeo de `Setting`.
  4. Más de 2000 → `422 BULK_UPDATE_TOO_MANY_PRODUCTS`.
  5. `calculateBulkPriceItem` para cada uno; arma `items` y `skipped`, los contadores y la huella (4.5).
- **Response 200:** `BulkPricePreviewSchema`. **Con 0 productos** que cambian también es `200` (`items: []`): la pantalla muestra "No hay productos para aumentar" y no deja confirmar.
- **No guarda nada ni audita** (test del plan: "la vista previa no cambia nada").
- **Errores:** `400`, `401`, `403 FORBIDDEN`, `422 SUPPLIER_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `SUBCATEGORY_NOT_IN_CATEGORY` / `BULK_UPDATE_TOO_MANY_PRODUCTS` / `BULK_UPDATE_AMOUNT_OUT_OF_RANGE` (un valor nuevo no entra en 9 enteros; `details: { productIds }`).
- **Ejemplo:** ejemplo 1 de la sección 10 (`GET /api/bulk-price-updates/preview?scope=SUPPLIER&supplierId=3&target=COST&percent=10`):

```json
{
  "scope": "SUPPLIER", "supplier": { "id": 3, "name": "Distribuidora Sur", "isActive": true },
  "category": null, "subcategory": null, "target": "COST", "percent": "10.00", "priceRoundingStep": "10.00",
  "items": [
    { "productId": 52, "name": "Alfajor triple", "barcode": null, "saleUnit": "UNIT",
      "category": { "id": 2, "name": "Golosinas" }, "subcategory": { "id": 4, "name": "Chocolates" },
      "defaultSupplier": { "id": 3, "name": "Distribuidora Sur" },
      "vatRatePercent": "21.00", "effectiveMarginPercent": "30.00", "marginSource": "PRODUCT",
      "before": { "netCostPrice": "500.00", "costPrice": "605.00", "salePrice": "790.00" },
      "after": { "netCostPrice": "550.00", "costPrice": "665.50", "salePrice": "870.00" },
      "suggestedPrice": "870.00", "keepsPrice": false, "salePriceChangePercent": "10.13",
      "realMarginPercentBefore": "30.58", "realMarginPercentAfter": "30.73", "isBelowCost": false }
  ],
  "skipped": [ { "productId": 55, "name": "Bombón sin costo", "reason": "NO_COST" } ],
  "affectedCount": 4, "keepsPriceCount": 1, "belowCostCount": 0,
  "previewHash": "9f2c…(64 caracteres hex)"
}
```

(En el ejemplo se muestra un solo ítem; la respuesta real trae los 4 del ejemplo 1.)

## 6. `POST /api/bulk-price-updates` — Confirmar el aumento

- **Sesión:** sí. **Acceso:** `any` (decisión del dueño, etapa 1). **Roles:** OWNER, MANAGER.
- **Request:** `CreateBulkPriceUpdateRequestSchema`.
- **Response 201** (nuevo) o **200** (reintento): `CreateBulkPriceUpdateResponseSchema`.

### 6.1 Qué hace, en este orden (una transacción, tiempo máximo 30 s)

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato con Zod (como 5 paso 1, más `previewHash`, `clientRequestId` y `excludedProductIds`). | `400 VALIDATION_ERROR` |
| 2 | **Reintento:** buscar un aumento con ese `clientRequestId` (6.2). | `200` con `isReplay: true`, o `409 BULK_UPDATE_REQUEST_ID_REUSED` |
| 3 | Proveedor, categoría o subcategoría (como 5 paso 2). | `422` |
| 4 | Leer el paso de redondeo. Leer y **bloquear** los productos que entran (4.3): `SELECT ... FROM products p JOIN subcategories s ... JOIN categories c ... WHERE ... ORDER BY p.id FOR NO KEY UPDATE OF p` (mismo tipo de bloqueo y orden que la compra, `compras.md` 5.2 paso 8). | — |
| 5 | Más de 2000 → rechazar. | `422 BULK_UPDATE_TOO_MANY_PRODUCTS` |
| 6 | `calculateBulkPriceItem` para cada producto y **huella** (4.5). Distinta de `previewHash` → no se guarda nada. | `409 BULK_PREVIEW_OUTDATED` |
| 7 | ⏳ H-74 c: cada id de `excludedProductIds` tiene que estar en `items`; se sacan. | `422 BULK_UPDATE_EXCLUDED_NOT_IN_SCOPE`, `details: { productIds }` |
| 8 | No queda ningún producto para cambiar (vista previa vacía o todos destildados). | `422 BULK_UPDATE_NO_PRODUCTS` |
| 9 | Algún producto que se cambia queda a pérdida y no vino `confirmBelowCost: true` (4.4). | `422 PRICE_BELOW_COST`, `details.items` |
| 10 | Crear `BulkPriceUpdate` (`scope`, ids, `target`, `percent`, `priceRoundingStep`, `productsAffected`, `productsExcluded`, `previewHash`, `clientRequestId`, `requestHash`, `userId`). | Choque de `clientRequestId` (`P2002`) → deshacer y responder como el paso 2 |
| 11 | Actualizar los productos **en una sola sentencia** (`UPDATE products SET ... FROM (VALUES ...) WHERE products.id = v.id`): con `COST`, `net_cost_price`, `cost_price` y `sale_price`; con `SALE_PRICE`, solo `sale_price`. Márgenes e IVA no se tocan. | — |
| 12 | **Un `PriceChange` por producto** (`createMany`): `source = BULK_UPDATE`, `bulkPriceUpdateId`, antes y después de neto, final y precio; margen propio igual antes y después. Con `keepsPrice`, el precio es igual y el costo cambia (la fila igual se crea: algo cambió). | — |
| 13 | Auditar `BULK_PRICE_UPDATE` (6.4). | — |

- **Bloqueos cortos:** con una sola sentencia para los productos y un `createMany`, el bloqueo dura menos de un segundo aun con 2000 productos. Una venta que llega en ese momento espera ese rato; si el precio cambió con el carrito armado, el cobro frena y el cajero confirma el total nuevo (H-33 a, `ventas.md` 2.3).
- **Las ventas ya hechas no cambian** (PRE-07: foto del precio en `SaleItem`). **El precio no cambia solo:** el aumento lo confirma una persona (D7).

### 6.2 Reintentos: `clientRequestId`

Como en ventas, compras y pagos: la pantalla genera un UUID **por vista previa** (lo renueva cada vez que pide una vista previa nueva). Mismo id + mismo cuerpo + mismo usuario → `200` con el **mismo** aumento, `isReplay: true`, sin crear ni auditar nada. Otro cuerpo u otro usuario → `409 BULK_UPDATE_REQUEST_ID_REUSED` con `details: { bulkPriceUpdateId, createdAt }`. La huella del pedido (`requestHash`, SHA-256 del cuerpo validado con números normalizados) se guarda y nunca se devuelve. Aunque se mande con otro id, la huella de la vista previa impide aplicar dos veces el mismo aumento (4.5).

### 6.3 Errores

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; `percent` 0, negativo o > 100 (⏳ H-75); un campo de precio o costo (campo desconocido); ids repetidos en `excludedProductIds`. | `fields` |
| `403` | `FORBIDDEN` | Empleado. | — |
| `409` | `BULK_UPDATE_REQUEST_ID_REUSED` | 6.2. | `{ bulkPriceUpdateId, createdAt }` |
| `409` | `BULK_PREVIEW_OUTDATED` | Paso 6: algo cambió desde la vista previa. | — |
| `422` | `SUPPLIER_NOT_FOUND` / `CATEGORY_NOT_FOUND` / `SUBCATEGORY_NOT_IN_CATEGORY` | Paso 3. | — |
| `422` | `BULK_UPDATE_TOO_MANY_PRODUCTS` | Paso 5. | `{ count, max }` |
| `422` | `BULK_UPDATE_EXCLUDED_NOT_IN_SCOPE` | Paso 7 (⏳ H-74 c). | `{ productIds }` |
| `422` | `BULK_UPDATE_NO_PRODUCTS` | Paso 8. | — |
| `422` | `PRICE_BELOW_COST` | Paso 9. | `{ items }` |
| `422` | `BULK_UPDATE_AMOUNT_OUT_OF_RANGE` | Un valor nuevo no entra en 9 enteros. | `{ productIds }` |

### 6.4 Auditoría

`BULK_PRICE_UPDATE` (ya en el modelo 2.21), `entityType` `BulkPriceUpdate`, `entityId` = id, `details: { scope, supplierId, categoryId, subcategoryId, target, percent, priceRoundingStep, productsAffected, excludedProductIds, keepsPriceProductIds, belowCostProductIds, confirmedBelowCost, previewHash }`. Los valores de cada producto quedan en `PriceChange` (no se repiten en la auditoría).

### 6.5 Ejemplo

```json
{
  "clientRequestId": "4d1e2f3a-5b6c-4d7e-8f9a-0b1c2d3e4f5a",
  "scope": "SUPPLIER", "supplierId": 3, "target": "COST", "percent": "10",
  "previewHash": "9f2c…", "excludedProductIds": [], "confirmBelowCost": false
}
```

Respuesta `201`: `{ "bulkPriceUpdate": { "id": 7, "scope": "SUPPLIER", "supplier": { "id": 3, "name": "Distribuidora Sur" }, ..., "productsAffected": 4, "productsExcluded": 0, "items": [ { "priceChangeId": 120, "productId": 52, "productName": "Alfajor triple", "before": { ... }, "after": { ... } } ] }, "isReplay": false }`.

## 7. Aumentos anteriores

### 7.1 `GET /api/bulk-price-updates` — Listar

- **Roles:** OWNER, MANAGER. **Query:** `BulkPriceUpdateListQuerySchema`. Paginada; más nuevo primero.
- **Response 200:** `Paginated<BulkPriceUpdateListItem>`. **Errores:** `400`, `403`. **Auditoría:** no.

### 7.2 `GET /api/bulk-price-updates/:id` — Ver un aumento

- **Roles:** OWNER, MANAGER. **Response 200:** `BulkPriceUpdateDetail` con todos sus productos (hasta 2000, sin paginar), armados desde sus `PriceChange`.
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.
- Un aumento **no se anula ni se deshace** (no hay ruta). Si fue un error, se corrige con un aumento nuevo (solo sube) o precio por precio en Precios (PRE-04); PA-23 no permite bajas masivas.

## 8. Precios después de una compra (COM-06)

Al guardar una compra el costo de cada producto pasa a ser el último pagado (PA-05) **y el precio no cambia** (`compras.md` 4.3). Desde esta etapa, `costChanges` trae además el **precio sugerido** y la pantalla deja, por cada producto, **usar el sugerido, escribir otro precio o dejarlo como estaba** (COM-06). Se guarda con una ruta aparte, **después** de la compra (decisión técnica, explicada abajo; cuándo se puede usar: ⏳ H-76 a).

**Por qué una ruta aparte y no dentro de `POST /api/purchases` (decisión técnica):**
- La compra es un hecho (llegó la mercadería, se debe la factura): se guarda siempre, aunque el usuario todavía no sepa qué precio poner. Mezclar la decisión de precios con la compra haría que un precio mal elegido frene el stock y la deuda.
- El sugerido se calcula **con el costo que dejó la compra guardada** (el último de varias líneas, H-64; costo 0 que no pisa, H-63). Antes de guardar, la pantalla tendría que adivinarlo.
- El reintento de la compra (`clientRequestId`, `requestHash`) no cambia.
- **En contra:** son dos pedidos. Si el usuario cierra el aviso, el precio queda como estaba (es "dejar igual", COM-06) y puede volver a decidir desde el detalle de la compra (⏳ H-76 a).

### 8.1 `CostChange` ampliado (cambio en `compras.md` 3.3; solo agrega campos)

```ts
CostChangeSchema = {
  // --- de la etapa 5 (sin cambios) ---
  productId; productName;
  previousNetCostPrice: Money; newNetCostPrice: Money;
  previousCostPrice: Money; newCostPrice: Money;
  netCostChangePercent: SignedPercent | null;
  salePrice: Money;                         // precio de venta AL MOMENTO DE LA COMPRA
  // --- etapa 6 ---
  vatRatePercent: Percent;                  // IVA de VENTA del producto (hoy)
  effectiveMarginPercent: Percent; marginSource: MarginSource;   // margen que se usa (hoy)
  priceRoundingStep: Money;                 // el de Setting (hoy)
  suggestedPrice: Money | null;             // suggestedPrice(newNetCostPrice, margen, IVA, paso); null si el costo nuevo es 0
  currentSalePrice: Money;                  // precio de venta HOY (puede ser otro que salePrice)
  realMarginPercent: SignedPercent | null;  // margen real del precio de hoy con el costo nuevo (PA-21)
  isBelowCost: boolean;                     // el precio de hoy queda a pérdida con el costo nuevo (4.4)
  matchesSuggestedPrice: boolean;           // currentSalePrice == suggestedPrice
  canUpdatePrice: boolean;                  // se puede usar 8.2 para este producto ahora
  cannotUpdateReason: 'PURCHASE_VOIDED' | 'COST_CHANGED_SINCE' | null;
  priceUpdate: {                            // la última decisión guardada con 8.2 para este producto (o null)
    priceChangeId: number; previousSalePrice: Money; salePrice: Money;
    user: UserRef; createdAt: string;
  } | null;
}
```

- **Se calcula siempre "ahora":** con el costo que dejó **esta** compra y el margen, IVA y redondeo **actuales**. Así el reintento de la compra, el detalle (`GET /api/purchases/:id`) y la respuesta de 8.2 dan lo mismo en el mismo momento.
- `canUpdatePrice = false` si la compra está **anulada** (`PURCHASE_VOIDED`) o si el costo del producto **ya no es** el que dejó esta compra (`COST_CHANGED_SINCE`: otra compra, un aumento masivo sobre costo o un cambio manual lo tocaron después). En esos casos el precio se cambia en Precios (`productos-stock.md` 7.3).
- **`costChanges` también en el detalle:** `PurchaseSchema` suma el campo `costChanges: CostChange[]` (`compras.md` 3.3 y 6.2). La respuesta de `POST /api/purchases` lo sigue trayendo arriba, como en la etapa 5.
- **Cómo se reconocen las filas de una compra en `PriceChange`:** la compra crea **una** fila `PURCHASE` por producto con el cambio de costo (precio igual antes y después, etapa 5). Las decisiones de 8.2 crean filas `PURCHASE` **posteriores** del mismo producto y la misma compra, con el costo igual y el precio distinto. Para armar `costChanges`, la fila del costo es **la primera** (menor `id`) de ese producto en esa compra y `priceUpdate` es **la última posterior**. No hace falta una columna nueva.

### 8.2 `POST /api/purchases/:id/price-updates` — Guardar los precios elegidos

- **Sesión:** sí. **Acceso:** `any` (precios y compras desde afuera ✅, ADR 003). **Roles:** OWNER, MANAGER (COM-10, PRE-04).
- **Request:** `PurchasePriceUpdateRequestSchema`.
- **Qué hace** (una transacción):

| # | Paso | Si falla |
|---|---|---|
| 1 | Validar formato: 1 a 200 ítems, sin `productId` repetido, `salePrice` como dinero. | `400` |
| 2 | Bloquear la compra (`SELECT ... FOR SHARE`: espera a una anulación en curso, que la bloquea `FOR UPDATE`). No existe → `404`. Anulada → no se guarda nada. | `404`; `409 PURCHASE_ALREADY_VOIDED` |
| 3 | Cada `productId` tiene que estar en los `costChanges` de esa compra. | `422 PRODUCT_NOT_IN_COST_CHANGES`, `details: { productIds }` |
| 4 | Bloquear los productos (`FOR UPDATE`, `ORDER BY id`, como `/pricing`). | — |
| 5 | El costo neto y final del producto tienen que seguir siendo los que dejó esta compra. | `409 COST_CHANGED_SINCE_PURCHASE`, `details: { items: [{ productId, netCostPrice, costPrice }] }` |
| 6 | `mode = SUGGESTED`: el servidor calcula el sugerido **ahora** (8.1) y lo **compara** con `salePrice`; si es distinto (alguien cambió un margen, el IVA o el redondeo mientras estaba el aviso) → no se guarda nada y la pantalla muestra el sugerido nuevo para confirmar otra vez (como H-33 a). Si el sugerido es `null` (costo 0) → `422`. `mode = MANUAL`: se usa `salePrice` tal cual (PRE-04). | `409 SUGGESTED_PRICE_CHANGED`, `details: { items: [{ productId, suggestedPrice }] }`; `422 NO_SUGGESTED_PRICE` |
| 7 | Venta a pérdida (4.4) en algún precio elegido, sin `confirmBelowCost: true`. | `422 PRICE_BELOW_COST`, `details.items` |
| 8 | Por cada producto **cuyo precio cambia**: `UPDATE products SET sale_price` y **un** `PriceChange` `source = PURCHASE`, `purchaseId`, costo igual antes y después, precio anterior y nuevo, margen propio igual. Si el precio elegido es igual al actual, no se guarda nada para ese producto (`changed: false`). | — |
| 9 | Si cambió al menos un precio: auditar `PURCHASE_PRICE_UPDATE`. | — |

- **El margen guardado no cambia** (PA-21): un precio a mano muestra su margen real.
- **El sugerido puede ser menor que el precio actual** (por ejemplo, si el costo bajó): elegirlo baja el precio. No es un aumento masivo (PA-23 habla de aumentos masivos); es el "lo confirma" de COM-06, producto por producto.
- **Doble envío:** el segundo pedido encuentra los precios ya puestos y responde `200` con `changed: false` (no duplica filas). Por eso no lleva `clientRequestId`.
- **Response 200:** `PurchasePriceUpdateResponseSchema`:

```ts
PurchasePriceUpdateResponseSchema = {
  purchaseId: number;
  results: {
    productId: number; productName: string; mode: PurchasePriceMode;
    previousSalePrice: Money; salePrice: Money;
    changed: boolean; priceChangeId: number | null;
    realMarginPercent: SignedPercent | null; isBelowCost: boolean;
  }[];                                      // en el orden del pedido
  costChanges: CostChange[];                // todos los de la compra, actualizados (con priceUpdate)
}
```

- **Errores:** `400`, `403 FORBIDDEN`, `404`, `409 PURCHASE_ALREADY_VOIDED`, `409 COST_CHANGED_SINCE_PURCHASE`, `409 SUGGESTED_PRICE_CHANGED`, `422 PRODUCT_NOT_IN_COST_CHANGES`, `422 NO_SUGGESTED_PRICE`, `422 PRICE_BELOW_COST`.
- **Auditoría:** `PURCHASE_PRICE_UPDATE` (nueva), `entityType` `Purchase`, `entityId` = id de la compra, `details: { items: [{ productId, priceChangeId, mode, before, after }], confirmedBelowCost }` (solo los que cambiaron). El historial por producto queda en `PriceChange`.
- **Ejemplo** (ejemplo 4 de la sección 10): `{ "items": [ { "productId": 12, "mode": "SUGGESTED", "salePrice": "1520" } ] }` → `200` con `results: [ { "productId": 12, "previousSalePrice": "1450.00", "salePrice": "1520.00", "changed": true, "priceChangeId": 131, ... } ]`.

## 9. Historial de precios: `GET /api/products/:id/price-changes` (PRE-06)

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (trae costos: es una ruta de precios, PA-03). El empleado → `403`, como el historial de stock (aprobado 2026-11-25).
- **Query:** `PriceChangeListQuerySchema`. Paginada (README 5); más nuevo primero.
- **Response 200:** `Paginated<PriceChangeItem>`: costo neto, costo final, precio y margen propio **antes y después**, origen (manual, compra con su número y proveedor, aumento masivo con su número y %, importación), usuario y fecha (PRE-06).
- `changedFields` lo calcula el backend comparando antes y después (para que la pantalla resalte solo lo que cambió).
- Productos desactivados también tienen historial. "Varios" devuelve una lista vacía (nunca tiene `PriceChange`).
- El **alta** del producto no aparece (no crea `PriceChange`, modelo 2.9): sus valores iniciales están en la auditoría.
- **Errores:** `400`, `403`, `404`. **Auditoría:** no.
- **Ejemplo** (ejemplo 7 de la sección 10): `GET /api/products/51/price-changes?pageSize=2`

```json
{
  "items": [
    { "id": 118, "productId": 51, "source": "BULK_UPDATE",
      "oldNetCostPrice": "1000.00", "newNetCostPrice": "1100.00", "oldCostPrice": "1210.00", "newCostPrice": "1331.00",
      "oldSalePrice": "1900.00", "newSalePrice": "2000.00", "oldMarginPercent": null, "newMarginPercent": null,
      "changedFields": ["NET_COST", "COST", "SALE_PRICE"], "purchase": null,
      "bulkPriceUpdate": { "id": 7, "target": "COST", "percent": "10.00" },
      "user": { "id": 4, "fullName": "Lucía Pérez" }, "createdAt": "2026-11-28T13:00:00.000Z" },
    { "id": 95, "productId": 51, "source": "MANUAL",
      "oldNetCostPrice": "1000.00", "newNetCostPrice": "1000.00", "oldCostPrice": "1210.00", "newCostPrice": "1210.00",
      "oldSalePrice": "1820.00", "newSalePrice": "1900.00", "oldMarginPercent": null, "newMarginPercent": null,
      "changedFields": ["SALE_PRICE"], "purchase": null, "bulkPriceUpdate": null,
      "user": { "id": 1, "fullName": "Pedro Gómez" }, "createdAt": "2026-11-25T13:20:00.000Z" }
  ],
  "page": 1, "pageSize": 2, "total": 2
}
```

## 10. Ejemplos numéricos (tests obligatorios de qa)

Datos de partida (los arma el test; paso de redondeo **$ 10**; IVA de venta 21 % en todos):

| Producto | id | Subcategoría (margen) → categoría (margen) | Margen propio | Proveedor habitual | Neto | Final | Precio | Activo |
|---|---:|---|---:|---|---:|---:|---:|:---:|
| A "Chocolate Águila 100 g" | 51 | Chocolates (50 %) → Golosinas (40 %) | — | 3 | 1.000,00 | 1.210,00 | 1.820 | ✅ |
| B "Alfajor triple" | 52 | Chocolates (50 %) | **30 %** | 3 | 500,00 | 605,00 | 790 | ✅ |
| C "Caramelos masticables" | 53 | Caramelos (—) → Golosinas (40 %) | — | 3 | 1.000,00 | 1.210,00 | 1.700 | ✅ |
| D "Chicle importado" | 54 | Caramelos (—) | — | 3 | 1.000,00 | 1.210,00 | **2.500** (a mano) | ✅ |
| E "Bombón sin costo" | 55 | Chocolates (50 %) | — | 3 | **0** | 0 | 300 | ✅ |
| F "Turrón" | 56 | Chocolates (50 %) | — | 3 | 1.000,00 | 1.210,00 | 1.820 | ❌ |
| G "Gomitas" | 57 | Caramelos (—) | — | 4 | 1.000,00 | 1.210,00 | **1.000** (a pérdida) | ✅ |

### Ejemplo 1 — 10 % sobre costo, proveedor 3 (margen de producto, de subcategoría y de categoría)

| Producto | Margen (origen) | Neto nuevo | Final nuevo | Sugerido | Precio | Margen real después |
|---|---|---:|---:|---|---|---:|
| A | 50 % (subcategoría) | 1.100,00 | 1.331,00 | 1.100 × 1,50 × 1,21 = 1.996,50 → **2.000** | 1.820 → **2.000** | 50,26 % |
| B | 30 % (producto) | 550,00 | 665,50 | 550 × 1,30 × 1,21 = 865,15 → **870** | 790 → **870** | 30,73 % |
| C | 40 % (categoría) | 1.100,00 | 1.331,00 | 1.100 × 1,40 × 1,21 = 1.863,40 → **1.870** | 1.700 → **1.870** | 40,50 % |
| D | 40 % (categoría) | 1.100,00 | 1.331,00 | 1.870 (menor que 2.500) | **2.500, queda** (`keepsPrice`, ⏳ H-72 a) | 87,83 % |

- E se saltea (`NO_COST`); F no aparece (desactivado, ⏳ H-73 a); G no es del proveedor 3. `affectedCount` 4, `keepsPriceCount` 1, `belowCostCount` 0.
- Margen real de A: 2.000 ÷ 1,21 = 1.652,89; (1.652,89 − 1.100) ÷ 1.100 = **50,26 %**. B antes: 790 ÷ 1,21 = 652,89 → **30,58 %**.
- Al confirmar: 4 `PriceChange` `BULK_UPDATE` con el mismo `bulkPriceUpdateId`; `BulkPriceUpdate` con `productsAffected` 4; margen propio de B sigue en 30 %.
- ⏳ H-74 c: con `excludedProductIds: [54]`, D queda como estaba, `productsAffected` 3 y `productsExcluded` 1.

### Ejemplo 2 — 10 % sobre precio, categoría Golosinas (redondeo a $ 10)

| Producto | Precio × 1,10 | Precio nuevo | ¿A pérdida? |
|---|---:|---:|:---:|
| A | 2.002 | **2.010** | no |
| B | 869 | **870** | no |
| C | 1.870 | **1.870** (ya es múltiplo) | no |
| D | 2.750 | **2.750** | no |
| E | 330 | **330** (costo 0: no se controla) | no |
| G | 1.100 | **1.100** (< 1.210 de costo final; margen real −9,09 %) | **sí** |

- Los costos no cambian. F no aparece (⏳ H-73 a). `affectedCount` 6, `belowCostCount` 1.
- Confirmar **sin** `confirmBelowCost` → `422 PRICE_BELOW_COST` con `details.items` = [G] y **no cambia ningún producto**; con `confirmBelowCost: true` → `201` y la auditoría con `belowCostProductIds: [57]`.
- ⏳ H-74 b: con `subcategoryId` de Caramelos entran solo C, D y G.

### Ejemplo 3 — 8 % sobre costo ("Cómo probarlo", paso 1)

Coca-Cola 500 ml (id 12), neto 833,33, final 1.008,33, margen 50 % (subcategoría Gaseosas), precio 1.520:
neto R-1(833,33 × 1,08) = R-1(899,9964) = **900,00**; final R-1(1.008,33 × 1,08) = R-1(1.088,9964) = **1.089,00**; sugerido 900 × 1,50 × 1,21 = 1.633,50 → **1.640**; precio 1.520 → **1.640**.

### Ejemplo 4 — Compra con costo mayor ("Cómo probarlo", paso 3; sigue a `compras.md` ejemplo A)

Coca-Cola (id 12) con margen 50 % (subcategoría) y precio 1.450: la compra deja neto **833,33** y final **1.008,33** (antes 780,00 / 943,80).
- `costChanges[0]`: `suggestedPrice` = R-3(833,33 × 1,50 × 1,21) = R-3(1.512,49) = **1.520**; `currentSalePrice` 1.450; `realMarginPercent` = (1.450 ÷ 1,21 − 833,33) ÷ 833,33 = **43,80 %**; `isBelowCost` false; `canUpdatePrice` true.
- `POST /api/purchases/21/price-updates` con `{ "items": [ { "productId": 12, "mode": "SUGGESTED", "salePrice": "1520" } ] }` → precio **1.520**; `PriceChange` `PURCHASE` (`purchaseId` 21) con costo 833,33 / 1.008,33 igual antes y después y precio 1.450 → 1.520. El historial muestra **dos** filas de la compra #21: la del costo y la del precio.
- Variantes: con `"salePrice": "1500"` y `mode: "SUGGESTED"` → `409 SUGGESTED_PRICE_CHANGED` con `suggestedPrice: "1520.00"`; con `mode: "MANUAL"` y `"1500"` → `200`, precio 1.500. Mandar el mismo pedido dos veces → la segunda vez `changed: false` y sin fila nueva.

### Ejemplo 5 — Compra que deja venta a pérdida

G (id 57, precio 1.000, margen 40 % de categoría) entra en una compra con neto 1.000 e IVA 21 % → final 1.210: `isBelowCost` **true** con el precio de hoy (aviso en rojo).
- `MANUAL` 1.150 → `422 PRICE_BELOW_COST` (`details.items[0]`: `salePrice` 1150.00, `costPrice` 1210.00, `realMarginPercent` −4,96); con `confirmBelowCost: true` → `200`.
- `SUGGESTED` 1.700 (1.000 × 1,40 × 1,21 = 1.694 → 1.700) → `200` sin confirmación.

### Ejemplo 6 — La confirmación tiene que coincidir con la vista previa

1. Vista previa del ejemplo 1 → `previewHash` H1.
2. Antes de confirmar, alguien cambia a mano el precio de A a 1.900 → confirmar con H1 → **`409 BULK_PREVIEW_OUTDATED`** y **ningún** producto cambia (B, C y D tampoco).
3. Nueva vista previa → H2 (A queda 1.900 → 2.000). Confirmar con H2 → `201`.
4. Repetir el mismo pedido (mismo `clientRequestId`) → `200` con `isReplay: true`, el mismo aumento, sin filas nuevas. Repetirlo con **otro** `clientRequestId` y H2 → `409 BULK_PREVIEW_OUTDATED` (los "antes" ya cambiaron): nunca se aplica dos veces.
5. Lo mismo si entre la vista previa y la confirmación: se desactiva C, se asigna otro producto al proveedor 3, se cambia el margen de Chocolates o el paso de redondeo → `409`.

### Ejemplo 7 — Historial

A con un cambio manual de 1.820 a 1.900 (`MANUAL`) y después el ejemplo 1 → `GET /api/products/51/price-changes` trae 2 filas, la más nueva primero (sección 9).

## 11. Códigos de error y acciones de auditoría nuevos

Van a `ERROR_CODES` en `shared`.

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `BULK_PREVIEW_OUTDATED` | Los precios cambiaron desde la vista previa. Revisala de nuevo antes de confirmar. |
| 409 | `BULK_UPDATE_REQUEST_ID_REUSED` | Ese aumento ya se había aplicado (aumento #N). |
| 409 | `COST_CHANGED_SINCE_PURCHASE` | El costo de este producto cambió después de esta compra. Cambiá el precio desde Precios. |
| 409 | `SUGGESTED_PRICE_CHANGED` | El precio sugerido cambió. Revisalo y confirmá de nuevo. |
| 422 | `CATEGORY_NOT_FOUND` | La categoría no existe. |
| 422 | `SUBCATEGORY_NOT_IN_CATEGORY` | La subcategoría no es de esa categoría. (⏳ H-74) |
| 422 | `BULK_UPDATE_NO_PRODUCTS` | No hay productos para aumentar con ese filtro. |
| 422 | `BULK_UPDATE_TOO_MANY_PRODUCTS` | Son más de 2000 productos: elegí una categoría, subcategoría o proveedor más chico. |
| 422 | `BULK_UPDATE_EXCLUDED_NOT_IN_SCOPE` | Uno de los productos sacados no está en la vista previa. (⏳ H-74 c) |
| 422 | `BULK_UPDATE_AMOUNT_OUT_OF_RANGE` | Un precio o costo nuevo es demasiado grande. Revisá el porcentaje. |
| 422 | `PRODUCT_NOT_IN_COST_CHANGES` | Ese producto no cambió de costo en esta compra. |
| 422 | `NO_SUGGESTED_PRICE` | Este producto no tiene precio sugerido (costo $ 0): escribí el precio. |

Se usan también: `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `SUPPLIER_NOT_FOUND`, `PURCHASE_ALREADY_VOIDED`, `PRICE_BELOW_COST` (con la forma en lista `details.items`, 4.4).

Acciones de auditoría: `BULK_PRICE_UPDATE` (ya en el modelo 2.21) y **`PURCHASE_PRICE_UPDATE`** (nueva). Las dos en la misma transacción que la acción (README 8).

## 12. Frenar y preguntar (H-72 a H-76) — ⏳ pendientes del dueño

No están en `requisitos.md` ni en `relevamiento.md`. El contrato asume la **recomendación** de cada una.

| H | Pregunta | Opciones | Recomendación | Dónde |
|---|---|---|---|---|
| H-72 | **Aumento sobre costo y precios puestos a mano.** Al subir el costo, el precio se recalcula con el margen. ¿Qué pasa si el producto tenía un precio puesto a mano **más alto** que el sugerido nuevo? | a) El precio pasa al sugerido **solo si es más alto** que el actual; si no, queda como está (el costo sube igual). b) El precio pasa **siempre** al sugerido, aunque baje. c) El precio sube el mismo % que el costo, sin mirar el margen. | **a)**: respeta "solo aumentos" y el margen; con b) un aumento puede bajar precios, y c) no usa el margen que pide PA-23. | 4.1, ej. 1 (D) |
| H-73 | **¿Entran los productos desactivados?** | a) No, solo los activos. b) Sí, activos y desactivados. c) Se elige en cada aumento. | **a)**: no se venden; si se reactiva uno, se revisa su precio en Precios. | 4.3, ej. 1 y 2 (F) |
| H-74 | **¿Cómo se eligen los productos del aumento?** | a) Solo todo un proveedor o toda una categoría (lo que dice PRE-05). b) a), más poder elegir una subcategoría. c) b), más poder destildar productos en la vista previa antes de confirmar. | **c)**: un proveedor no siempre aumenta todo igual; destildar evita tener que corregir a mano después. | 3.2, 4.3, 6.1 paso 7, ej. 1 y 2 |
| H-75 | **¿Tope para el porcentaje?** (para frenar un "80" escrito en lugar de "8") | a) Hasta 100 % por aumento (si hace falta más, se hacen dos). b) Hasta 100 % y una confirmación extra desde el 30 %. c) Sin tope propio (hasta 9.999,99 %). | **a)**: la vista previa ya muestra el antes y el después de cada producto; un tope fijo es lo más simple. | 3.1 |
| H-76 | **Precio después de una compra: ¿cuándo se decide?** | a) Al guardar la compra aparece el aviso; si se cierra sin decidir, el precio queda como estaba, y se puede decidir después desde el detalle de la compra mientras el costo siga siendo el de esa compra. Si el precio de hoy queda a pérdida, el aviso lo marca en rojo. b) Solo en el aviso; después, desde Precios del producto. c) Antes de guardar: la compra no se guarda hasta elegir el precio de cada producto con costo nuevo. | **a)**: la compra siempre se guarda, nadie queda obligado a decidir con apuro y no se pierde el sugerido. | 8, 4.4 |

**Ya definidos por documentos aprobados (no se preguntan):** encargado y dueño hacen aumentos y cambian precios (matriz, PRE-05); los aumentos se hacen desde afuera (`relevamiento.md` "Etapa 1"); solo aumentos, con vista previa, sobre costo o precio (PA-23); margen producto → subcategoría → categoría sobre el neto y redondeo hacia arriba a $ 10 (PA-22, H-15 a, PA-19); el margen guardado no cambia al cambiar el precio (PA-21); venta a pérdida con confirmación explícita (cierre de la etapa 2), que vale también para un precio elegido después de una compra; el encargado ve costos en compras y precios y el empleado nunca (PA-03, PRE-08); el historial lo ven encargado y dueño, como el de stock; las ventas ya hechas no cambian (PRE-07); "Varios" no tiene precio guardado (H-09).

## 13. Cambios al modelo de datos y migración (para `base-datos`)

Detalle en `docs/modelo-datos.md` 2.9, 2.10, 2.21, 2.22 y sección 4. **Una migración** (`bulk_price_updates`): los enums son nuevos (no hay `ALTER TYPE ... ADD VALUE`), así que tabla, FK y `CHECK`s van juntos.

| Tabla | Cambio |
|---|---|
| **enums** | Nuevos en Prisma: `BulkUpdateScope` (`SUPPLIER`, `CATEGORY`) y `BulkUpdateTarget` (`COST`, `SALE_PRICE`), con `@@map("bulk_update_scope")` / `@@map("bulk_update_target")` como los demás. |
| **`bulk_price_updates`** (nueva) | `id`; `scope`; `supplier_id` (FK, null); `category_id` (FK, null); `subcategory_id` (FK, null, ⏳ H-74 b); `target`; `percent numeric(6,2)`; `price_rounding_step numeric(14,2)`; `products_affected int`; `products_excluded int default 0` (⏳ H-74 c); `preview_hash char(64)`; `client_request_id uuid UNIQUE`; `request_hash char(64)`; `user_id` (FK); `created_at timestamptz(3)`. Todas las FK `onDelete: Restrict`, con índice. Índice `created_at`. |
| `bulk_price_updates` `CHECK`s | `bulk_price_updates_scope_check`: `(scope = 'SUPPLIER' AND supplier_id IS NOT NULL AND category_id IS NULL AND subcategory_id IS NULL) OR (scope = 'CATEGORY' AND category_id IS NOT NULL AND supplier_id IS NULL)`. `bulk_price_updates_percent_check`: `percent > 0 AND percent <= 100` (⏳ H-75; con c) queda solo `> 0`). `products_affected > 0`; `products_excluded >= 0`; `price_rounding_step >= 0`; `preview_hash ~ '^[0-9a-f]{64}$'`; `request_hash ~ '^[0-9a-f]{64}$'`. Que la subcategoría sea de la categoría lo controla el backend (un `CHECK` no mira otra tabla). |
| **`price_changes`** | **FK** `bulk_price_update_id` → `bulk_price_updates` (la columna y su índice existen desde la etapa 2). Se **reemplazan** los dos `CHECK` de un solo sentido (`price_changes_purchase_source_check`, `price_changes_bulk_source_check`) por `price_changes_source_refs_check`: `((source = 'PURCHASE') = (purchase_id IS NOT NULL)) AND ((source = 'BULK_UPDATE') = (bulk_price_update_id IS NOT NULL))`. Nuevos: `price_changes_something_changed_check` (al menos uno de neto, final, precio o margen propio distinto: `IS DISTINCT FROM` para el margen); `price_changes_amounts_check` (los seis importes `>= 0`, `new_cost_price >= new_net_cost_price` y `old_cost_price >= old_net_cost_price`). Antes de agregarlos, la migración verifica que los datos existentes los cumplan (hoy los cumplen: `MANUAL` sin referencias, `PURCHASE` con compra, nunca filas sin cambios). |

- **Seed:** no hace falta un aumento de ejemplo. Conviene que los productos de ejemplo tengan un margen propio, uno de subcategoría y uno de categoría, y uno con precio a mano más alto que el sugerido (para probar el ejemplo 1).
- Test por cada `CHECK` nuevo (R8 del plan).

## 14. Qué muestra cada pantalla (para `frontend`, siempre con `/impeccable`)

Solo para encargado y dueño (el empleado no ve los menús; el servidor igual da `403`). Funcionan igual desde afuera.

1. **Precios › Aumento masivo** (pantalla nueva, desde el menú Precios):
   - Paso 1, "¿Qué productos?": **Proveedor** (lista de proveedores, también desactivados, marcados) o **Categoría** (+ **Subcategoría** opcional, ⏳ H-74 b). "¿Qué sube?": **El costo** ("el precio se recalcula con el margen y se redondea") o **El precio** ("sube y se redondea a $ 10"), con el paso real de `priceRoundingStep`. "Porcentaje": campo con `%`, solo números positivos hasta 100 (⏳ H-75), validado con `BulkPercentInputSchema`. Botón **Ver vista previa**.
   - Paso 2, vista previa: tabla por producto con nombre, (con costo) costo neto antes → después, precio antes → después, % de cambio del precio y margen real después; marcas "Queda igual: el precio actual es más alto que el sugerido" (`keepsPrice`, ⏳ H-72 a) y **"A pérdida"** en rojo (`isBelowCost`). Casilla por fila, todas tildadas (⏳ H-74 c). Debajo, plegado: "No cambian (N)" con el motivo (`NO_COST`: "sin costo cargado", `ZERO_PRICE`, `NO_CHANGE`). Línea fija: "Los productos desactivados no se tocan" (⏳ H-73 a). Resumen arriba: "Se van a cambiar N productos".
   - Cambiar cualquier dato del paso 1 **invalida** la vista previa (hay que pedirla de nuevo); el `clientRequestId` se genera con cada vista previa nueva.
   - **Aplicar aumento a N productos** → diálogo "¿Aplicar un aumento del 8 % sobre el costo a 23 productos de Distribuidora Sur?"; si hay productos a pérdida entre los tildados, el diálogo lo dice y manda `confirmBelowCost: true` solo si el usuario lo acepta.
   - `409 BULK_PREVIEW_OUTDATED` → "Los precios cambiaron desde la vista previa" y se recarga sola la vista previa (sin aplicar). `422 BULK_UPDATE_TOO_MANY_PRODUCTS` → sugerir un filtro más chico.
   - Al terminar: "Listo: se actualizaron N precios" con link al aumento.
2. **Precios › Aumentos anteriores**: lista (fecha, quién, filtro, sobre qué, %, cantidad) y detalle con el antes y después de cada producto (7).
3. **Compras › después de guardar** (reemplaza el aviso de la etapa 5): "Cambió el costo de N productos". Por fila: producto, costo neto anterior → nuevo (con el %), precio actual, **precio sugerido**, margen real del precio actual con el costo nuevo, marca **"A pérdida"** si corresponde. Por fila, tres opciones: **Usar el sugerido**, **Otro precio** (campo con el margen real en vivo, con `realMargin` de `shared`) y **Dejar igual** (marcada al abrir: si no se elige nada, no cambia nada). Botón "Usar todos los sugeridos" y **Guardar precios** (manda solo los que cambian, 8.2). Sin sugerido (costo 0): solo "Otro precio" y "Dejar igual". Confirmación por `PRICE_BELOW_COST`; `409 SUGGESTED_PRICE_CHANGED` actualiza el sugerido de la fila y pide confirmar de nuevo.
4. **Compras › detalle de una compra**: sección "Cambios de costo" con la misma tabla (desde `purchase.costChanges`). Si `canUpdatePrice` es falso, solo lectura con el motivo ("Compra anulada" o "El costo cambió después: cambialo desde Precios", con link). Si ya se decidió (`priceUpdate`), "Precio cambiado a $ X por Y el …" (⏳ H-76 a).
5. **Ficha del producto › Precios**: sección **Historial de precios** paginada (9): fecha y hora, origen ("Manual", "Compra #21 — Distribuidora Sur" con link, "Aumento #7 (+10 % sobre costo)" con link, "Importación"), quién, costo neto, costo final, precio y margen propio con "antes → después" resaltando solo `changedFields`. Margen `null` = "el de la subcategoría/categoría".

Números en es-AR (`$ 1.640`, costos con centavos `$ 1.008,33`, porcentajes `8,00 %`) con las funciones de `shared`; nunca `Number()` sobre importes (comparar con `Decimal`).

## 15. Casos de test (para `qa`)

- **Unitarios (`shared`):** `calculateBulkPriceItem` con los ejemplos 1, 2 y 3 (margen de producto, de subcategoría y de categoría; 10 % sobre costo y sobre precio; redondeo hacia arriba y múltiplo exacto que queda igual; `keepsPrice` de D; `NO_COST` de E; paso 0 sin redondeo comercial); `isBelowCost` (precio menor que el final; igual al final no es pérdida; costo 0 nunca; margen negativo); `BulkPercentInputSchema` (`"0"`, `"-5"`, `"10.555"`, `"100.01"`, número de JSON → error; `"8"`, `"100"` → ok); `PurchasePriceUpdateRequestSchema` (ids repetidos, 0 o 201 ítems → error); `CostChange` del ejemplo 4 (sugerido 1.520, margen real 43,80 %).
- **Integración (plan y este contrato):**
  - Porcentaje negativo o cero → `400` (vista previa y confirmación); empleado → `403` en las 6 rutas; un precio o costo en el cuerpo de la confirmación → `400`.
  - **La vista previa no cambia nada:** después de `GET .../preview`, los productos, `price_changes`, `bulk_price_updates` y `audit_logs` quedan iguales.
  - **La confirmación coincide con la vista previa:** ejemplo 1 → los 4 productos quedan con los valores de `after` de la vista previa, 4 `PriceChange` `BULK_UPDATE`, un `BulkPriceUpdate` y un `AuditLog` `BULK_PRICE_UPDATE`. Ejemplo 6 completo (`409` sin cambios parciales, reintento con `isReplay`, nunca dos veces).
  - Ejemplo 2 con G: sin confirmación → `422 PRICE_BELOW_COST` y ningún producto cambia; con confirmación → `201`.
  - Desactivados (F) y "Varios" nunca cambian; un proveedor desactivado se puede usar; más de 2000 productos → `422 BULK_UPDATE_TOO_MANY_PRODUCTS` (con un tope de prueba inyectado, sin crear 2000 filas si el test lo permite); todos destildados → `422 BULK_UPDATE_NO_PRODUCTS`; un excluido que no está → `422` (⏳ H-74 c); subcategoría de otra categoría → `422` (⏳ H-74).
  - **El historial guarda neto, final, precio y margen:** después de un cambio manual, una compra con costo nuevo, la decisión de precio de esa compra y un aumento masivo, `GET /api/products/:id/price-changes` devuelve las 4 filas con su origen, su referencia (compra #, aumento #), usuario, fecha y `changedFields` correctos, la más nueva primero; filtro por `source` y por fechas; empleado → `403`.
  - **La compra con costo cambiado devuelve el sugerido y guarda el elegido:** ejemplo 4 (`costChanges` con `suggestedPrice` 1.520; `price-updates` con el sugerido, con `MANUAL`, con un sugerido viejo → `409`, doble envío sin fila nueva); ejemplo 5 (pérdida con y sin confirmación); compra anulada → `409 PURCHASE_ALREADY_VOIDED`; producto que no cambió de costo → `422`; después de otra compra del mismo producto → `409 COST_CHANGED_SINCE_PURCHASE` y `canUpdatePrice: false` en el detalle; desde la puerta remota → `200` (está permitido).
  - Visibilidad: la búsqueda recursiva de claves de costo (`productos-stock.md` 2.3 punto 4) sigue sin encontrar nada en las rutas que puede pedir un empleado.
  - Un test por cada `CHECK` nuevo de la sección 13.
- **e2e (plan):** aumento masivo por proveedor con vista previa y confirmación (ejemplo 3 o 1): elegir proveedor, 8 % sobre costo, ver la vista previa, confirmar, abrir un producto y ver el precio nuevo y la fila en su historial. Recomendado además: compra con costo mayor → aviso con sugerido → "Usar el sugerido" → precio nuevo en la ficha.
- **"Cómo probarlo"** del plan (etapa 6, pasos 1 a 4), recorrido como el dueño.

## 16. Notas para los demás agentes

- **base-datos:** sección 13 (una migración, `CHECK`s a mano, test por cada uno). Prisma: modelo `BulkPriceUpdate` con relaciones a `Supplier`, `Category`, `Subcategory`, `User` y `PriceChange[]`; en `PriceChange`, la relación `bulkPriceUpdate`.
- **backend:**
  - `shared/pricing/`: enums, esquemas de la sección 3, `calculateBulkPriceItem`, `isBelowCost` y las constantes; `shared/purchases/`: `CostChange` ampliado, `PurchaseSchema.costChanges` y los esquemas de 8.2. `products.service.ts` pasa a usar `isBelowCost`.
  - Huella de la vista previa (4.5, ADR 007) en `apps/api` con `node:crypto`; una sola función usada por la vista previa y la confirmación, con un test que fije el texto exacto que se hashea.
  - Confirmación en el orden de 6.1, con bloqueo `FOR NO KEY UPDATE OF p` y una sola sentencia de `UPDATE` + `createMany`; transacción de hasta 30 s.
  - `costChangesOf` (compras) suma los campos de 8.1 y distingue la fila del costo (la primera) de las decisiones (las siguientes); hoy usa `find`, que con filas nuevas tiene que ordenar por `id`.
  - Registrar `/api/bulk-price-updates/preview` antes de `/:id`.
- **frontend (`/impeccable`):** sección 14. Arrancar con datos simulados desde los ejemplos de la sección 10.
- **seguridad:** revisar en especial que la confirmación **no acepte precios** de la pantalla (requests estrictos, recálculo y huella), que la huella cubra todo lo que cambia el resultado, permisos (encargado y dueño en las 6 rutas, empleado `403`), que el sugerido y los márgenes nunca lleguen a un empleado, la auditoría de cada aumento y de cada decisión de precio, y los topes (2000 productos, 100 % ⏳ H-75, 200 ítems en 8.2, cuerpo JSON de 100 KB: 2000 ids de exclusión entran de sobra).
- **documentacion:** manual "Aumentos masivos" y "Precios después de una compra" (y el historial en la guía de Precios).
