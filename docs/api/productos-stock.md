# API — Productos, precios, stock y configuración

> Etapa 2, tarea 1. Requisitos: STK-01 a STK-08, STK-10, PRE-01 a PRE-04, PRE-06 (cambios manuales), PRE-07, CFG-02, CFG-03, CFG-05, CFG-07; `requisitos.md` sección 3 (PA-03, PA-33, H-05).
> Base: contrato común (`docs/api/README.md`), ADR 002 (dinero, redondeos, precio sugerido) y ADR 003 (puertas).
> Modelo: `Setting`, `Category`, `Subcategory`, `Product`, `StockMovement`, `PriceChange` (`docs/modelo-datos.md` 2.2, 2.4, 2.5, 2.7, 2.8, 2.9).
> **Fuera de esta etapa:** `Product.defaultSupplierId` (llega en la etapa 5, R2: no aparece en ningún request ni response de este documento; si se manda → `400`), historial de precios en pantalla (etapa 6), aumentos masivos (etapa 6), importación de Excel (etapa 8).
> Lo marcado **H-23 a H-32** está pendiente del dueño (sección 11 y `requisitos.md` 7.6). Backend **no** implementa esos puntos hasta que se respondan; mientras tanto vale la columna "Mientras tanto".

## 1. Resumen de rutas

Todas piden sesión y tienen **`access: 'any'`**: productos, precios, stock y configuración se pueden usar desde afuera (ADR 003 punto 6). Igual, por la puerta remota solo entran encargado y dueño.

| Método y ruta | Qué hace | Roles | Respuesta según rol |
|---|---|---|---|
| `GET /api/settings` | Ver la configuración | Todos | Igual para todos |
| `PATCH /api/settings` | Cambiar nombre, redondeo, hora de corte | OWNER | — |
| `GET /api/categories` | Categorías con sus subcategorías | Todos | Empleado sin márgenes |
| `POST /api/categories` | Crear categoría | OWNER, MANAGER (H-23) | — |
| `PATCH /api/categories/:id` | Editar, desactivar | OWNER, MANAGER (margen: solo OWNER) | — |
| `POST /api/categories/:id/subcategories` | Crear subcategoría | OWNER, MANAGER (margen: solo OWNER) | — |
| `PATCH /api/subcategories/:id` | Editar, desactivar | OWNER, MANAGER (margen: solo OWNER) | — |
| `GET /api/products/search` | **Búsqueda del mostrador** (código exacto o nombre) | Todos | Igual para todos, **sin costo** |
| `GET /api/products` | Lista del ABM (paginada) | Todos | OWNER con costo; resto sin costo |
| `GET /api/products/:id` | Ficha | Todos | OWNER con costo; resto sin costo |
| `POST /api/products` | Alta | OWNER, MANAGER | Con costo (es pantalla de precios) |
| `PATCH /api/products/:id` | Editar datos generales, desactivar | OWNER, MANAGER | OWNER con costo; MANAGER sin costo |
| `GET /api/products/:id/pricing` | **Precios:** costo, márgenes, sugerido, margen real | OWNER, MANAGER | Con costo |
| `PATCH /api/products/:id/pricing` | Cambio manual de precio, costo o margen | OWNER, MANAGER (costo: H-24; margen: solo OWNER) | Con costo |
| `GET /api/products/:id/stock-movements` | Historial de stock | OWNER, MANAGER | OWNER ve el costo del movimiento |
| `POST /api/products/:id/stock-adjustments` | Ajuste de stock con motivo | OWNER, MANAGER | — |
| `GET /api/stock/restock` | Lista "Para reponer" | OWNER, MANAGER | — |
| `GET /api/stock/negative` | Lista de stock negativo | OWNER, MANAGER | — |

- Para un rol que no figura, la respuesta es `403 FORBIDDEN` (README 4).
- Todos los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1).
- **Orden de registro en Express:** `/api/products/search` va **antes** que `/api/products/:id` (si no, `search` se toma como un `id` y da `400`).
- Las filas marcadas "Propuesta" en la sección 2 no salen de un requisito: se validan al aprobar este contrato.

## 2. Visibilidad por rol (crítico)

### 2.1 Reglas

| Dato | EMPLOYEE | MANAGER | OWNER | Origen |
|---|:---:|:---:|:---:|---|
| Costo neto y final (`netCostPrice`, `costPrice`) | ❌ nunca | Solo en las **rutas de precios** (2.2) | ✅ siempre | PA-03, matriz |
| Datos que salen del costo: `suggestedPrice`, `realMarginPercent`, costo del movimiento de stock (`unitNetCost`) | ❌ nunca | Solo en las rutas de precios | ✅ | PA-03 (con el precio y estos datos se calcula el costo) |
| Margen propio del producto y margen que se usa (`marginPercent`, `effectiveMarginPercent`, `marginSource`) | ❌ nunca | Solo en las rutas de precios | ✅ | PA-03 (con precio + margen + IVA se despeja el costo) |
| Márgenes de categoría y subcategoría | ❌ nunca | ✅ (solo lectura) | ✅ | Propuesta: no son costos, y el encargado los necesita para ver el sugerido al dar de alta |
| Cambiar márgenes (categoría, subcategoría, producto) | ❌ | ❌ | ✅ | PA-33, H-05 |
| Precio de venta, IVA, stock, mínimo, unidades por bulto | ✅ | ✅ | ✅ | Propuesta (el empleado necesita precio y stock para vender) |
| Lista del ABM y ficha (solo lectura) | ✅ sin costo | ✅ sin costo | ✅ con costo | Propuesta |
| Historial de stock, "Para reponer", stock negativo | ❌ | ✅ | ✅ | REP-07; Propuesta para historial y negativos (los corrigen encargado y dueño) |

**Rutas de precios** (donde el encargado sí ve costos, PA-03 y PRE-08): `GET` y `PATCH /api/products/:id/pricing`, y `POST /api/products` (el alta incluye costo y precio). La de compras llega en la etapa 5.

**El mostrador nunca recibe costos, ni siquiera el dueño:** `GET /api/products/search` devuelve siempre `ProductSaleItem` (la pantalla de venta puede estar a la vista del cliente y tiene que ser liviana).

### 2.2 Qué esquema devuelve cada ruta

| Ruta | EMPLOYEE | MANAGER | OWNER |
|---|---|---|---|
| `GET /api/products/search` | `ProductSaleItem` | `ProductSaleItem` | `ProductSaleItem` |
| `GET /api/products`, `GET /api/products/:id` | `ProductPublic` | `ProductPublic` | `ProductWithCost` |
| `POST /api/products` | 403 | `ProductWithCost` | `ProductWithCost` |
| `PATCH /api/products/:id` | 403 | `ProductPublic` | `ProductWithCost` |
| `GET`/`PATCH /api/products/:id/pricing` | 403 | `ProductPricing` | `ProductPricing` |
| `GET /api/categories` | `CategoryPublic` | `CategoryWithMargin` | `CategoryWithMargin` |
| `POST`/`PATCH` de categorías y subcategorías | 403 | `CategoryWithMargin` / `SubcategoryWithMargin` | ídem |
| `GET /api/products/:id/stock-movements` | 403 | `StockMovement` | `StockMovementWithCost` |
| `POST /api/products/:id/stock-adjustments` | 403 | `StockAdjustmentResponse` (con `StockMovement`) | ídem con `StockMovementWithCost` |
| `GET /api/stock/restock`, `GET /api/stock/negative` | 403 | `StockListItem` | `StockListItem` |

### 2.3 Cómo lo garantiza el backend

1. Una única función por recurso arma la respuesta **según el rol y la ruta** (por ejemplo `toProductResponse(product, role, 'catalog' | 'pricing')`); ninguna ruta devuelve el objeto de Prisma.
2. **Red de seguridad:** antes de responder, el objeto pasa por `.parse()` del esquema del rol (esquemas de **respuesta no estrictos**: Zod descarta las claves que no están). Así, aunque alguien agregue por error `netCostPrice` al objeto, `ProductPublicSchema.parse` lo saca.
3. Los esquemas `ProductPublic`, `ProductSaleItem`, `CategoryPublic`, `StockMovement` y `StockListItem` **no tienen** ningún campo de costo ni de margen de producto: no hay `null` que "esconda" el dato, el campo no existe.
4. Test obligatorio (qa): para cada ruta de este documento, con sesión de **empleado** y de **encargado** (fuera de las rutas de precios), la respuesta no contiene las claves `netCostPrice`, `costPrice`, `suggestedPrice`, `realMarginPercent`, `marginPercent`, `effectiveMarginPercent`, `unitNetCost` (búsqueda recursiva en el JSON).

### 2.4 Campos que solo puede mandar el dueño

Si un **encargado** manda `marginPercent` (en categoría, subcategoría, producto o precios), la respuesta es **`403 FORBIDDEN`** con `details: { "fields": ["marginPercent"] }`, **aunque el valor sea igual al actual**. El frontend no debe mandar el campo si el usuario no es dueño. Mismo tratamiento para `netCostPrice` mientras H-24 esté pendiente (sección 11).

Este control mira el cuerpo, así que va **después** de la validación de formato (`400`) — igual que el `LOCAL_ONLY` por cuerpo de `PATCH /api/users/:id` (H-20).

## 3. Esquemas (van a Zod en `@kiosco/shared`)

Todos los **requests** son estrictos (campo desconocido → `400`). Las **respuestas** se validan sin `strict` (descartan claves de más, 2.3).

### 3.1 Campos comunes

| Esquema | Tipo y reglas |
|---|---|
| `IdParamSchema` | `:id` entero positivo ≤ 2.147.483.647 (si no, `400`). Es el mismo `UserIdParamSchema` de la etapa 1, con nombre general (se exportan los dos). |
| `MoneyInputSchema` | string `^\d{1,12}(\.\d{1,2})?$` (≥ 0). Un número de JSON → `400`. |
| `QuantityInputSchema` | string `^\d{1,9}(\.\d{1,3})?$` (≥ 0). |
| `SignedQuantityInputSchema` | string `^-?\d{1,9}(\.\d{1,3})?$`, distinto de 0. Solo en el ajuste de stock. |
| `PercentInputSchema` | string `^\d{1,4}(\.\d{1,2})?$` (0 a 9999,99; cabe en `Decimal(6,2)`). Márgenes. |
| `VatRateInputSchema` | string con valor numérico en `VAT_RATES` (0; 2,5; 5; 10,5; 21; 27). Acepta `"21"`, `"21.00"`, `"10.5"`, `"10.50"`. |
| `SaleUnitSchema` | `"UNIT"` \| `"KG"` |
| `StockMovementTypeSchema` | `"SALE"` \| `"SALE_VOID"` \| `"PURCHASE"` \| `"PURCHASE_VOID"` \| `"ADJUSTMENT"` |
| `StockAdjustmentReasonSchema` | `"BREAKAGE"` (rotura) \| `"MISSING"` (faltante: robo o pérdida) \| `"COUNT_CORRECTION"` (corrección por conteo) \| `"INITIAL_LOAD"` (carga inicial) \| `"OWN_CONSUMPTION"` (consumo propio) \| `"OTHER"` (otro, con nota) — PA-27 |
| `MarginSourceSchema` | `"PRODUCT"` \| `"SUBCATEGORY"` \| `"CATEGORY"`: de dónde salió el margen que se usa (PA-22) |
| `CategoryNameSchema` / `SubcategoryNameSchema` | string con `trim`, 1 a 60 caracteres. |
| `ProductNameSchema` | string con `trim`, 1 a 120 caracteres. |
| `BarcodeSchema` | string con `trim`; 1 a 50 caracteres sin espacios ni caracteres de control (`^[\x21-\x7E]{1,50}$`). `""` o `null` = sin código. |
| `BusinessDayCutoffSchema` | string `"HH:MM"` de 24 h (`^([01]\d|2[0-3]):[0-5]\d$`). En la base se guarda en minutos (`06:00` = 360). |
| `PaginatedSchema(item)` | `{ items: item[], page, pageSize, total }` (README 5). `page`/`pageSize` con las reglas del README. |

**Cantidades enteras en productos por unidad (STK regla 2):** en un producto `UNIT`, toda cantidad que se le cargue (`minStock`, `unitsPerPack`, `initialStock`, `quantity` del ajuste) tiene que ser entera (`"3"`, `"3.000"`; no `"3.5"`). Si no → **`400 VALIDATION_ERROR`** con el campo en `details.fields` (`"Este producto se vende por unidad: usá números enteros."`). Es una excepción a la regla 400/422 del README (hay que mirar la unidad del producto en la base), pedida así por el plan: el error se muestra en el campo, como cualquier error de formato.

### 3.2 Objetos de respuesta

```ts
SettingsSchema = {
  storeName: string;                 // CFG-05
  priceRoundingStep: Money;          // CFG-03: "10.00"; "0.00" = sin redondeo
  businessDayCutoff: string;         // CFG-07: "06:00"
  updatedAt: string;
  updatedBy: { id: number; fullName: string } | null;
}

SubcategoryPublicSchema   = { id; categoryId; name; isActive }
SubcategoryWithMarginSchema = SubcategoryPublic & {
  marginPercent: Percent | null;     // null = usa el de la categoría (PA-22)
  activeProductCount: number;
}
CategoryPublicSchema = { id; name; isActive; subcategories: SubcategoryPublic[] }
CategoryWithMarginSchema = { id; name; isActive;
  marginPercent: Percent;            // siempre tiene (PRE-02)
  activeProductCount: number;        // productos activos en todas sus subcategorías
  hasMiscellaneousProduct: boolean;  // true en la categoría de "Varios" (no se desactiva)
  subcategories: SubcategoryWithMargin[];
}
CategoryListResponseSchema = { items: (CategoryPublic | CategoryWithMargin)[] }  // sin paginar

// Mostrador: lo mínimo para agregar a la venta. Nunca costo.
ProductSaleItemSchema = {
  id; name; barcode: string | null; saleUnit: SaleUnit;
  salePrice: Money;                  // final, con IVA
  stockQuantity: Quantity;           // para el aviso de "sin stock" (VEN-09)
  isMiscellaneous: boolean;          // "Varios": la pantalla pide el precio a mano
}
ProductSearchResponseSchema = {
  matchedBy: 'BARCODE' | 'NAME';
  items: ProductSaleItem[];
  isInactiveBarcode: boolean;        // q era el código de un producto DESACTIVADO
}

// Ficha y lista para cualquier rol. NO tiene campos de costo ni de margen.
ProductPublicSchema = {
  id; name; barcode: string | null; saleUnit: SaleUnit;
  category: { id; name }; subcategory: { id; name };
  salePrice: Money; vatRatePercent: Percent;
  stockQuantity: Quantity;           // puede ser negativo (R2)
  minStock: Quantity;
  needsRestock: boolean;             // stockQuantity <= minStock y no es "Varios" (PA-26)
  unitsPerPack: Quantity | null;
  isMiscellaneous: boolean; isActive: boolean;
  createdAt: string; updatedAt: string;
}

// Solo dueño (y encargado en el alta). = ProductPublic + datos de precio.
ProductWithCostSchema = ProductPublic & {
  netCostPrice: Money;               // costo neto (sin IVA)
  costPrice: Money;                  // costo final (con IVA)
  marginPercent: Percent | null;     // margen propio; null = hereda
  effectiveMarginPercent: Percent;   // el que se usa (producto → subcategoría → categoría)
  marginSource: MarginSource;
  suggestedPrice: Money | null;      // null si el costo es 0 o es "Varios"
  realMarginPercent: Percent | null; // null si el costo es 0 o es "Varios"; puede ser negativo
}

// Pantalla de precios de un producto (dueño y encargado).
ProductPricingSchema = {
  productId; name; saleUnit; isMiscellaneous;
  vatRatePercent: Percent;
  netCostPrice: Money; costPrice: Money;
  marginPercent: Percent | null;           // propio
  subcategoryMarginPercent: Percent | null;
  categoryMarginPercent: Percent;
  effectiveMarginPercent: Percent; marginSource: MarginSource;
  priceRoundingStep: Money;                // el de Setting, para explicar el redondeo
  suggestedPrice: Money | null;
  salePrice: Money;
  realMarginPercent: Percent | null;
  matchesSuggestedPrice: boolean;          // salePrice == suggestedPrice
  updatedAt: string;
}

StockMovementSchema = {
  id; productId; type: StockMovementType;
  quantity: SignedQuantity;          // + entra, − sale
  stockAfter: SignedQuantity;
  adjustmentReason: StockAdjustmentReason | null;
  note: string | null;
  user: { id; fullName };
  saleId: number | null;             // etapa 3; en esta etapa siempre null
  purchaseId: number | null;         // etapa 5; en esta etapa siempre null
  createdAt: string;
}
StockMovementWithCostSchema = StockMovement & { unitNetCost: Money | null }   // solo dueño

StockAdjustmentResponseSchema = {
  movement: StockMovement | StockMovementWithCost;
  product: { id; stockQuantity: Quantity; minStock: Quantity; needsRestock: boolean };
}

StockListItemSchema = {
  id; name; barcode: string | null; saleUnit: SaleUnit;
  categoryName: string; subcategoryName: string;
  stockQuantity: Quantity; minStock: Quantity;
  shortfall: Quantity;               // max(0, minStock − stockQuantity): "lo que falta para el mínimo"
  isActive: boolean;
}
```

`Money` = string con 2 decimales; `Quantity`/`SignedQuantity` = string con 3 decimales (con `-` si es negativo); `Percent` = string con 2 decimales (con `-` solo en `realMarginPercent`). Ids, enteros. Fechas, ISO UTC (README 3).

### 3.3 Requests

```ts
UpdateSettingsRequestSchema = {     // al menos uno
  storeName?: string;               // trim, 1 a 80
  priceRoundingStep?: Money;        // 0 a "10000.00" (tope técnico contra errores de tipeo)
  businessDayCutoff?: string;       // "HH:MM"
}

CategoryListQuerySchema = { isActive?: 'true' | 'false' }  // filtra categorías y subcategorías

CreateCategoryRequestSchema    = { name: CategoryName; marginPercent: Percent }       // margen obligatorio (PRE-02); solo OWNER (H-23)
UpdateCategoryRequestSchema    = { name?; marginPercent?: Percent; isActive?: boolean }  // al menos uno
CreateSubcategoryRequestSchema = { name: SubcategoryName; marginPercent?: Percent | null }  // margen: solo OWNER
UpdateSubcategoryRequestSchema = { name?; marginPercent?: Percent | null; isActive?: boolean } // al menos uno; null = vuelve a heredar

ProductSearchQuerySchema = {
  q: string;                        // trim, 1 a 100
  limit?: number;                   // entero 1 a 50, default 20
}

ProductListQuerySchema = {
  page?; pageSize?;                 // README 5
  search?: string;                  // trim, 1 a 100: nombre (como en la búsqueda) o código de barras que EMPIEZA con eso
  categoryId?: number; subcategoryId?: number;
  isActive?: 'true' | 'false';      // sin filtro = todos (el frontend manda 'true' por defecto)
  saleUnit?: SaleUnit;
  needsRestock?: 'true' | 'false';
  sortBy?: 'name' | 'barcode' | 'salePrice' | 'stockQuantity' | 'updatedAt';  // default 'name'
  sortOrder?: 'asc' | 'desc';       // default 'asc'
}

CreateProductRequestSchema = {
  name: ProductName;
  barcode?: Barcode | null;
  saleUnit: SaleUnit;
  subcategoryId: number;
  vatRatePercent?: VatRate;         // default "21.00" (PA-13)
  netCostPrice?: Money;             // default "0.00". Ver H-24
  marginPercent?: Percent | null;   // solo OWNER (H-05); default null (hereda)
  salePrice: Money;                 // obligatorio: el usuario confirma el precio (R3, D7)
  minStock?: Quantity;              // default "0"
  unitsPerPack?: Quantity | null;   // > 0 si viene
  initialStock?: Quantity;          // opcional, ≥ 0: genera un ajuste "carga inicial" (6.4)
}
// NO acepta: stockQuantity, costPrice, isMiscellaneous, isActive, defaultSupplierId (→ 400).

UpdateProductRequestSchema = {      // datos generales; al menos uno
  name?; barcode?: Barcode | null; saleUnit?; subcategoryId?;
  vatRatePercent?; minStock?; unitsPerPack?: Quantity | null;
  isActive?: boolean;
}
// NO acepta: stockQuantity (el stock solo cambia con movimientos), netCostPrice, costPrice,
// salePrice, marginPercent (van por /pricing), isMiscellaneous, defaultSupplierId (→ 400).

UpdateProductPricingRequestSchema = {   // al menos uno
  salePrice?: Money;                // OWNER, MANAGER (PRE-04)
  netCostPrice?: Money;             // H-24 (mientras tanto: solo OWNER)
  marginPercent?: Percent | null;   // solo OWNER (H-05); null = vuelve a heredar
}

StockMovementListQuerySchema = {
  page?; pageSize?;
  type?: StockMovementType;
  from?: string; to?: string;       // YYYY-MM-DD, ambos incluidos, día CALENDARIO de Buenos Aires
}                                    // (los movimientos no tienen día de trabajo). Orden: más nuevo primero.

CreateStockAdjustmentRequestSchema = {
  reason: StockAdjustmentReason;
  quantity: SignedQuantity;         // a sumar (+) o restar (−), ≠ 0. Ver H-28 y H-29
  note?: string | null;             // trim, hasta 500; OBLIGATORIA si reason = OTHER
}

StockListQuerySchema = {            // para /restock y /negative
  page?; pageSize?;
  search?: string; categoryId?: number; subcategoryId?: number;
}
```

Nota: `CreateStockAdjustmentRequestSchema` incluye el control "motivo `OTHER` sin nota" (`refine` con `path: ['note']`), así el formulario lo marca antes de mandar y el servidor responde `400` con el mismo mensaje.

## 4. Configuración (`Setting`)

Una sola fila (`id = 1`), creada en la migración con valores iniciales (`storeName` "Kiosco", redondeo `10.00`, corte `06:00`); los valores reales se cargan en la instalación (plan, etapa 8).

### 4.1 `GET /api/settings` — Ver la configuración

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos (el nombre del negocio va en encabezados; el redondeo, para mostrar el precio sugerido).
- **Response 200:** `SettingsSchema`.
- **Errores:** `401`. **Auditoría:** no.

### 4.2 `PATCH /api/settings` — Cambiar la configuración

- **Sesión:** sí. **Acceso:** `any` (ADR 003: la configuración se puede cambiar desde afuera). **Roles:** OWNER (R5, CFG).
- **Request:** `UpdateSettingsRequestSchema`.
- **Response 200:** `SettingsSchema`.
- **Reglas:**
  - Cambiar el **redondeo** no cambia ningún precio guardado: solo cambia los precios **sugeridos** de ahí en adelante (D7).
  - Cambiar la **hora de corte** no mueve los registros viejos (ADR 002 punto 7). Se guarda ahora y se usa desde la etapa 3. La pantalla avisa que tiene que ser una hora con el kiosco cerrado (regla 3 de reportes); el servidor no puede saberlo y no lo controla.
  - Recargos y medios de pago (CFG-01, CFG-04) llegan en la etapa 3. Los márgenes (CFG-02) están en categorías y subcategorías (sección 5).
- **Errores:** `400 VALIDATION_ERROR`, `403 FORBIDDEN` (no es dueño).
- **Auditoría:** `SETTINGS_UPDATE`, `entityType` `Setting`, `entityId` `1`, `details: { before, after }` solo con lo que cambió. Si no cambió nada: `200` sin auditar.
- **Ejemplo:**

```json
{ "priceRoundingStep": "50", "businessDayCutoff": "05:30" }
```

```json
{
  "storeName": "Kiosco Don Pepe", "priceRoundingStep": "50.00", "businessDayCutoff": "05:30",
  "updatedAt": "2026-11-25T13:00:00.000Z", "updatedBy": { "id": 1, "fullName": "Pedro Gómez" }
}
```

## 5. Categorías y subcategorías

Reglas comunes:
- Nombre **único sin distinguir mayúsculas**: categorías en todo el sistema; subcategorías dentro de su categoría (activas o no).
- Una subcategoría **no se cambia de categoría** (no hay campo para eso: `categoryId` → `400`). Para reorganizar, se crea otra y se mueven los productos.
- No hay `DELETE` (README 2): se **desactivan**. Desactivar solo saca la opción de los desplegables para productos nuevos o editados. Con productos activos adentro: H-27. Reactivar: H-26.
- La categoría y la subcategoría del producto **"Varios"** no se pueden desactivar (`422 MISC_CATEGORY_LOCKED`): "Varios" siempre tiene que estar disponible para vender (H-09).
- Margen: **solo el dueño** lo pone o lo cambia (PA-33). Ver 2.4 y H-23.
- Cambiar un margen **no cambia ningún precio guardado**: cambia el precio **sugerido** de los productos que lo usan (D7, PA-21).

### 5.1 `GET /api/categories` — Listar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos.
- **Query:** `CategoryListQuerySchema`. Sin paginar (lista corta, README 5). Orden por `name` (categorías y, adentro, subcategorías).
- **Response 200:** `CategoryListResponseSchema`: `CategoryWithMargin` para OWNER y MANAGER; `CategoryPublic` para EMPLOYEE (sin márgenes ni conteos).
- **Errores:** `400`, `401`. **Auditoría:** no.

### 5.2 `POST /api/categories` — Crear categoría

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER y MANAGER según PA-33, **pero** el margen es obligatorio y solo lo pone el dueño: **H-23**. Mientras tanto, solo OWNER.
- **Request:** `CreateCategoryRequestSchema`.
- **Response 201:** `CategoryWithMargin` (sin subcategorías).
- **Errores:** `400`, `403 FORBIDDEN`, `409 CATEGORY_NAME_TAKEN` (`details: { "field": "name" }`).
- **Auditoría:** `CATEGORY_CREATE`, `entityType` `Category`, `details: { after: { name, marginPercent } }`.

### 5.3 `PATCH /api/categories/:id` — Editar o desactivar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER. `marginPercent` solo OWNER (`403 FORBIDDEN` + `details.fields`, 2.4).
- **Request:** `UpdateCategoryRequestSchema`.
- **Response 200:** `CategoryWithMargin`.
- **Errores:** `400`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CATEGORY_NAME_TAKEN`, `422 MISC_CATEGORY_LOCKED` (desactivar la de "Varios"), `422 CATEGORY_HAS_ACTIVE_PRODUCTS` (H-27, mientras tanto), `422 REACTIVATION_NOT_ALLOWED` (H-26, mientras tanto).
- **Auditoría:** `CATEGORY_UPDATE`, `details: { before, after }` solo con lo que cambió.

### 5.4 `POST /api/categories/:id/subcategories` — Crear subcategoría

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER. `marginPercent` solo OWNER (el encargado la crea sin margen propio: hereda el de la categoría).
- **Request:** `CreateSubcategoryRequestSchema`.
- **Response 201:** `SubcategoryWithMargin`.
- **Errores:** `400`, `403 FORBIDDEN`, `404 NOT_FOUND` (la categoría no existe), `409 SUBCATEGORY_NAME_TAKEN`, `422 CATEGORY_INACTIVE` (la categoría está desactivada).
- **Auditoría:** `SUBCATEGORY_CREATE`, `entityType` `Subcategory`, `details: { after: { categoryId, name, marginPercent } }`.

### 5.5 `PATCH /api/subcategories/:id` — Editar o desactivar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER. `marginPercent` solo OWNER.
- **Request:** `UpdateSubcategoryRequestSchema` (`marginPercent: null` = vuelve a usar el de la categoría).
- **Response 200:** `SubcategoryWithMargin`.
- **Errores:** `400`, `403 FORBIDDEN`, `404`, `409 SUBCATEGORY_NAME_TAKEN`, `422 MISC_CATEGORY_LOCKED`, `422 SUBCATEGORY_HAS_ACTIVE_PRODUCTS` (H-27), `422 REACTIVATION_NOT_ALLOWED` (H-26).
- **Auditoría:** `SUBCATEGORY_UPDATE`, `details: { before, after }`.
- **Ejemplo** (dueño):

```json
{ "marginPercent": "50" }
```

```json
{ "id": 4, "categoryId": 2, "name": "Chocolates", "isActive": true, "marginPercent": "50.00", "activeProductCount": 12 }
```

## 6. Productos

### 6.1 `GET /api/products/search` — Búsqueda del mostrador

Pensada para la pantalla de venta (etapa 3): el lector "escribe" el código y un Enter (VEN-01); también se tipea parte del nombre (VEN-02). **Un solo pedido** resuelve los dos casos.

- **Sesión:** sí. **Acceso:** `any` (vender sí es `local`, pero buscar no). **Roles:** todos.
- **Query:** `ProductSearchQuerySchema` (`q`, `limit`).
- **Qué hace, en orden:**
  1. Busca un producto **activo** con `barcode = q` **exacto** (índice único). Si lo encuentra → `matchedBy: "BARCODE"`, `items` con ese único producto. El frontend lo agrega a la venta directamente.
  2. Si no, busca por **nombre**, solo productos **activos**: cada palabra de `q` tiene que aparecer en el nombre, sin distinguir mayúsculas **ni acentos** ("cafe" encuentra "Café"). Orden: primero los que **empiezan** con `q`, después alfabético. Hasta `limit` resultados → `matchedBy: "NAME"`.
  3. `isInactiveBarcode: true` si `q` es el código de un producto **desactivado** (para que la pantalla diga "Ese producto está desactivado" en lugar de "no existe"). Igual se hace el paso 2.
- **Los productos desactivados nunca aparecen** en `items` (STK-02).
- "Varios" aparece en la búsqueda por nombre como cualquier producto activo, con `isMiscellaneous: true` (D21). Para un acceso directo, la etapa 3 puede agregar una ruta propia.
- **Response 200:** `ProductSearchResponseSchema`, **siempre sin costo** (2.1), también para el dueño.
- **Rapidez (NF-12):** la búsqueda por código usa el índice único; la de nombre, `ILIKE` sobre `unaccent(lower(name))` (alcanza para unos miles de productos; si se vuelve lenta, índice de trigramas, `modelo-datos.md` 2.7). Sin `COUNT(*)` ni paginación.
- **Errores:** `400` (`q` vacío o muy largo, `limit` fuera de rango), `401`. **Auditoría:** no.
- **Ejemplo:** `GET /api/products/search?q=7790895000997`

```json
{
  "matchedBy": "BARCODE",
  "items": [
    { "id": 12, "name": "Coca-Cola 500 ml", "barcode": "7790895000997", "saleUnit": "UNIT",
      "salePrice": "1450.00", "stockQuantity": "-2.000", "isMiscellaneous": false }
  ],
  "isInactiveBarcode": false
}
```

### 6.2 `GET /api/products` — Lista del ABM

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos (Propuesta: el empleado consulta precios y stock en modo lectura).
- **Query:** `ProductListQuerySchema`. Paginada (README 5).
- **Response 200:** `Paginated<ProductWithCost>` para OWNER; `Paginated<ProductPublic>` para MANAGER y EMPLOYEE.
- **Errores:** `400`, `401`. **Auditoría:** no.

### 6.3 `GET /api/products/:id` — Ficha

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos. Incluye productos desactivados.
- **Response 200:** `ProductWithCost` (OWNER) o `ProductPublic` (MANAGER, EMPLOYEE). El encargado ve los precios del producto en `GET /api/products/:id/pricing` (pestaña "Precios" de la ficha).
- **Errores:** `400`, `401`, `404 NOT_FOUND`. **Auditoría:** no.

### 6.4 `POST /api/products` — Alta

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (STK-01; H-14 dice "como cargar productos": encargado y dueño). `marginPercent` solo OWNER (H-05); `netCostPrice` según H-24 (mientras tanto, solo OWNER).
- **Request:** `CreateProductRequestSchema`.
- **Qué hace** (una transacción):
  1. Valida formato (`400`), campos de dueño (`403`), enteros si es `UNIT` (`400`), subcategoría existente y activa (`422`), código libre (`409`).
  2. `costPrice = finalFromNet(netCostPrice, vatRatePercent del producto)` (ADR 002: el final nunca se carga a mano; con qué IVA: H-25).
  3. `salePrice` se guarda **tal como lo mandó el usuario** (el sugerido solo se muestra; el servidor no lo pisa, D7).
  4. `stockQuantity = 0`. Si viene `initialStock > 0`: crea un `StockMovement` `ADJUSTMENT` / `INITIAL_LOAD` (`quantity = initialStock`, `stockAfter = initialStock`, `unitNetCost = netCostPrice`) y deja `stockQuantity = initialStock`. Así el stock inicial también queda como movimiento (STK regla 4).
  5. No crea `PriceChange` (no hay valor anterior); los valores iniciales quedan en la auditoría.
- **Response 201:** `ProductWithCost` (también para el encargado: el alta es pantalla de precios, 2.1).
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato; campo desconocido (`stockQuantity`, `defaultSupplierId`…); decimales en un producto `UNIT`. |
| `403` | `FORBIDDEN` | Empleado; o encargado con `marginPercent` (o `netCostPrice` mientras H-24 esté pendiente): `details.fields`. |
| `409` | `BARCODE_TAKEN` | El código ya es de otro producto (activo o no). `details: { "field": "barcode", "productId": 5, "productName": "..." }` |
| `422` | `SUBCATEGORY_NOT_FOUND` | `subcategoryId` no existe. |
| `422` | `SUBCATEGORY_INACTIVE` | La subcategoría o su categoría están desactivadas. |

- **Auditoría:** `PRODUCT_CREATE`, `entityType` `Product`, `details: { after: { name, barcode, saleUnit, subcategoryId, vatRatePercent, netCostPrice, costPrice, marginPercent, salePrice, minStock, unitsPerPack } }`. Si hubo `initialStock`, además `STOCK_ADJUST` (8.2).
- **Ejemplo** (dueño, paso 3 de "Cómo probarlo": Golosinas 40 %, Chocolates 50 %):

```json
{ "name": "Chocolate Águila 100 g", "barcode": "7790580123456", "saleUnit": "UNIT", "subcategoryId": 4,
  "vatRatePercent": "21", "netCostPrice": "1000", "salePrice": "1820", "minStock": "6", "initialStock": "24" }
```

```json
{
  "id": 51, "name": "Chocolate Águila 100 g", "barcode": "7790580123456", "saleUnit": "UNIT",
  "category": { "id": 2, "name": "Golosinas" }, "subcategory": { "id": 4, "name": "Chocolates" },
  "salePrice": "1820.00", "vatRatePercent": "21.00", "stockQuantity": "24.000", "minStock": "6.000",
  "needsRestock": false, "unitsPerPack": null, "isMiscellaneous": false, "isActive": true,
  "createdAt": "2026-11-25T13:10:00.000Z", "updatedAt": "2026-11-25T13:10:00.000Z",
  "netCostPrice": "1000.00", "costPrice": "1210.00", "marginPercent": null,
  "effectiveMarginPercent": "50.00", "marginSource": "SUBCATEGORY",
  "suggestedPrice": "1820.00", "realMarginPercent": "50.41"
}
```

($1.000 × 1,50 × 1,21 = $1.815 → hacia arriba a $10 → **$1.820**; margen real de $1.820 = 1.820 ÷ 1,21 = 1.504,13 → 50,41 %.)

### 6.5 `PATCH /api/products/:id` — Editar datos generales o desactivar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER.
- **Request:** `UpdateProductRequestSchema`. **El stock no se edita acá** (`stockQuantity` → `400`): solo cambia con movimientos (sección 8). Precio, costo y margen tampoco: van por `/pricing` (7.2).
- **Reglas:**
  - **Desactivar** = `{ "isActive": false }`: deja de aparecer en la búsqueda del mostrador (STK-02); su historial queda. Con stock distinto de 0: H-31. **Reactivar:** H-26.
  - **IVA:** cambiarlo **no cambia el precio de venta** (STK-10: los precios ya incluyen IVA). Sí cambian el precio sugerido y el margen real que se muestran. No genera `PriceChange` (modelo 2.9); queda en la auditoría.
  - **Subcategoría:** cambiarla puede cambiar el margen que se usa (si el producto no tiene propio) y por lo tanto el sugerido; **el precio no cambia solo** (D7).
  - **Pasar a `UNIT`:** el stock, el mínimo y las unidades por bulto actuales tienen que ser enteros; si no → `422 SALE_UNIT_NOT_WHOLE` (`details.fields`). Primero se corrige el stock con un ajuste.
  - **Código de barras:** `null` lo quita (por ejemplo, para pasárselo a otro producto).
  - **"Varios":** no se puede desactivar ni cambiar de subcategoría, unidad, ni código. Qué más se puede editar: H-32 (mientras tanto, nada: `422 MISC_PRODUCT_LOCKED`).
- **Response 200:** `ProductWithCost` (OWNER) o `ProductPublic` (MANAGER).
- **Errores:** `400`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 BARCODE_TAKEN`, `422 SUBCATEGORY_NOT_FOUND`, `422 SUBCATEGORY_INACTIVE`, `422 SALE_UNIT_NOT_WHOLE`, `422 MISC_PRODUCT_LOCKED`, `422 REACTIVATION_NOT_ALLOWED` (H-26, mientras tanto).
- **Auditoría:** `PRODUCT_UPDATE`, `details: { before, after }` solo con lo que cambió (incluye IVA, desactivación y subcategoría). Si no cambió nada: `200` sin auditar.

## 7. Precios

### 7.1 Cómo se calcula (fijo, ya aprobado)

| Concepto | Regla | Función de `shared` |
|---|---|---|
| Margen que se usa | `Product.marginPercent` ?? `Subcategory.marginPercent` ?? `Category.marginPercent` (PA-22). `marginSource` dice cuál fue. | (nueva) `effectiveMargin(product, sub, cat)` → `{ percent, source }` |
| Precio sugerido | `R-3( costoNeto × (1 + margen/100) × (1 + IVA/100) )`: margen sobre el **neto**, después el IVA de venta (H-15 a), **siempre hacia arriba** al múltiplo de `priceRoundingStep` (PA-19; paso 0 = sin redondeo comercial). `null` si el costo neto es 0 o el producto es "Varios". | `suggestedPrice(net, margin, vat, step)` |
| Margen real | `((precio ÷ (1 + IVA/100)) − costoNeto) ÷ costoNeto × 100`, a 2 decimales (PA-21). `null` si el costo es 0. Puede ser negativo (precio por debajo del costo). | `realMargin(price, net, vat)` |
| Costo final | `R-1( costoNeto × (1 + IVA/100) )` (H-25 define qué IVA) | `finalFromNet(net, vat)` |

- **El precio sugerido se calcula en cada respuesta** (`ProductWithCost`, `ProductPricing`); **no se guarda** y no hay ruta aparte. Mientras el usuario completa un formulario (todavía sin guardar), el frontend lo calcula con las mismas funciones de `shared`, usando los márgenes de `GET /api/categories` y el redondeo de `GET /api/settings`. El servidor recalcula siempre (README 7).
- **El precio guardado nunca cambia solo** (D7, R3, PA-21): ni al cambiar el costo, ni el margen (de producto, subcategoría o categoría), ni el IVA, ni el redondeo. Solo cambia cuando alguien manda `salePrice`. La pantalla muestra el sugerido nuevo y el usuario decide.

### 7.2 `GET /api/products/:id/pricing` — Precios de un producto

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (PA-03, PRE-08: pantalla de precios).
- **Response 200:** `ProductPricingSchema`.
- **Errores:** `400`, `401`, `403 FORBIDDEN` (empleado), `404`. **Auditoría:** no.

### 7.3 `PATCH /api/products/:id/pricing` — Cambio manual de precio, costo o margen

- **Sesión:** sí. **Acceso:** `any` (ADR 003: precios desde afuera ✅). **Roles:** OWNER, MANAGER.
  - `salePrice`: OWNER y MANAGER (PRE-04).
  - `marginPercent`: solo OWNER (H-05); `null` = vuelve a heredar.
  - `netCostPrice`: **H-24** (mientras tanto, solo OWNER). Recalcula `costPrice` (7.1).
- **Request:** `UpdateProductPricingRequestSchema`.
- **Qué hace** (una transacción, con la fila del producto bloqueada `SELECT ... FOR UPDATE` para que el "antes" sea exacto):
  1. Aplica solo lo que vino. **Cambiar el precio a mano no toca el margen guardado** (PA-21); cambiar costo o margen **no toca el precio** (7.1).
  2. Si cambió algo: crea **un** `PriceChange` con `source = MANUAL` y los valores antes/después de costo neto, costo final, precio y margen propio (PRE-06), y audita.
  3. Si no cambió nada: `200` sin `PriceChange` ni auditoría.
- **Response 200:** `ProductPricingSchema` (con `realMarginPercent` y `matchesSuggestedPrice` actualizados: así la pantalla muestra el "margen real" del precio puesto a mano).
- **Errores:** `400`, `403 FORBIDDEN` (empleado; o campo de dueño, 2.4), `404`, `422 MISC_PRODUCT_LOCKED` ("Varios" no tiene costo ni precio guardado: su precio se escribe al vender, H-09).
- **Auditoría:** `PRICE_CHANGE`, `entityType` `Product`, `details: { priceChangeId, before: {...}, after: {...} }` solo con lo que cambió.
- Las ventas ya registradas no cambian (PRE-07, foto de precio en `SaleItem`).
- **Ejemplo** (paso 4 de "Cómo probarlo"):

```json
{ "salePrice": "1900" }
```

```json
{
  "productId": 51, "name": "Chocolate Águila 100 g", "saleUnit": "UNIT", "isMiscellaneous": false,
  "vatRatePercent": "21.00", "netCostPrice": "1000.00", "costPrice": "1210.00",
  "marginPercent": null, "subcategoryMarginPercent": "50.00", "categoryMarginPercent": "40.00",
  "effectiveMarginPercent": "50.00", "marginSource": "SUBCATEGORY", "priceRoundingStep": "10.00",
  "suggestedPrice": "1820.00", "salePrice": "1900.00", "realMarginPercent": "57.02",
  "matchesSuggestedPrice": false, "updatedAt": "2026-11-25T13:20:00.000Z"
}
```

## 8. Stock

**Regla de oro (STK regla 4, STK-04):** `Product.stockQuantity` **solo** cambia junto con un `StockMovement`, en la misma transacción. No hay ninguna ruta que lo escriba directo. En esta etapa el único movimiento es `ADJUSTMENT` (las ventas llegan en la etapa 3 y las compras en la 5).

### 8.1 `GET /api/products/:id/stock-movements` — Historial

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (Propuesta).
- **Query:** `StockMovementListQuerySchema`. Paginado; orden `createdAt` descendente (más nuevo primero).
- **Response 200:** `Paginated<StockMovementWithCost>` (OWNER) o `Paginated<StockMovement>` (MANAGER: sin `unitNetCost`, que es un costo).
- **Errores:** `400`, `403 FORBIDDEN`, `404`. **Auditoría:** no.

### 8.2 `POST /api/products/:id/stock-adjustments` — Ajuste de stock

- **Sesión:** sí. **Acceso:** `any` (ADR 003: stock desde afuera ✅). **Roles:** OWNER, MANAGER (STK-05, matriz).
- **Request:** `CreateStockAdjustmentRequestSchema`.
  - `reason`: obligatorio, uno de los 6 motivos (PA-27).
  - `note`: obligatoria si `reason = OTHER` (STK-05).
  - `quantity`: con signo, distinta de 0. Por unidad, entera (`400` si no). Si además se puede cargar "la cantidad contada": **H-28**. Si cada motivo admite solo sumar o solo restar: **H-29**.
- **Qué hace** (una transacción):
  1. Suma `quantity` al stock **en la misma sentencia** (`UPDATE products SET stock_quantity = stock_quantity + $q ... RETURNING stock_quantity`), así una venta simultánea nunca pisa el ajuste ni al revés.
  2. Crea el `StockMovement` (`type = ADJUSTMENT`, `adjustmentReason`, `note`, `stockAfter` = lo que devolvió el paso 1, `unitNetCost` = costo neto actual, `userId`).
  3. **El stock puede quedar negativo** (R2, STK regla 1): no es un error.
  4. Audita.
- **Response 201:** `StockAdjustmentResponseSchema`.
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Falta el motivo; `quantity` 0, sin formato o con decimales en un producto `UNIT`; motivo `OTHER` sin nota (`path: note`, "Escribí una nota para el motivo 'otro'."). |
| `403` | `FORBIDDEN` | Empleado. |
| `404` | `NOT_FOUND` | El producto no existe. |
| `422` | `MISC_PRODUCT_NO_STOCK` | Es "Varios": no lleva stock (STK regla 5). |
| `422` | `PRODUCT_INACTIVE` | El producto está desactivado (H-31, mientras tanto). |

- **Auditoría:** `STOCK_ADJUST`, `entityType` `Product`, `entityId` = producto, `details: { movementId, reason, quantity, stockBefore, stockAfter, note }`.
- **Ejemplo** (paso 5 de "Cómo probarlo"):

```json
{ "reason": "BREAKAGE", "quantity": "-2", "note": "Se cayeron del exhibidor" }
```

```json
{
  "movement": {
    "id": 310, "productId": 51, "type": "ADJUSTMENT", "quantity": "-2.000", "stockAfter": "22.000",
    "adjustmentReason": "BREAKAGE", "note": "Se cayeron del exhibidor",
    "user": { "id": 3, "fullName": "María Gómez" }, "saleId": null, "purchaseId": null,
    "createdAt": "2026-11-25T13:30:00.000Z"
  },
  "product": { "id": 51, "stockQuantity": "22.000", "minStock": "6.000", "needsRestock": false }
}
```

### 8.3 `GET /api/stock/restock` — "Para reponer"

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (REP-07).
- **Qué lista:** productos **activos**, que no son "Varios", con **`stockQuantity <= minStock`** (PA-26, STK-06), incluidos los de stock negativo. Con mínimo 0: H-30.
- **Query:** `StockListQuerySchema`. Paginada. Orden: `shortfall` descendente, después `name`.
- **Response 200:** `Paginated<StockListItem>`. `shortfall` = lo que falta para llegar al mínimo (el pedido sugerido de la etapa 5 parte de acá; el "al menos 1" de H-08 se aplica en el pedido, no en esta lista).
- El filtro por proveedor (REP-07 "también por proveedor") se agrega en la etapa 5 con `supplierId` (cambio que solo agrega).
- **Errores:** `400`, `403 FORBIDDEN`. **Auditoría:** no.

### 8.4 `GET /api/stock/negative` — Stock negativo

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER, MANAGER (STK-07; los corrigen con un ajuste).
- **Qué lista:** productos con **`stockQuantity < 0`**, que no son "Varios". Activos y desactivados (los desactivados con `isActive: false`; ver H-31).
- **Query:** `StockListQuerySchema`. Paginada. Orden: `stockQuantity` ascendente (el más negativo primero).
- **Response 200:** `Paginated<StockListItem>`.
- **Errores:** `400`, `403 FORBIDDEN`. **Auditoría:** no.

## 9. Reglas que el contrato deja explícitas

| # | Regla | Dónde se aplica | Origen |
|---|---|---|---|
| 1 | El stock **no se edita por el ABM**: `stockQuantity` no existe en ningún request (→ `400`). Solo cambia con movimientos (alta con `initialStock` y ajustes en esta etapa). | 6.4, 6.5, 8 | STK regla 4, STK-04 |
| 2 | Producto **por unidad**: cantidades enteras (mínimo, unidades por bulto, stock inicial, ajustes) → `400`. Por **peso**: hasta 3 decimales. | 3.1 | STK regla 2 |
| 3 | **Un código de barras por producto**, único entre todos los productos (activos o no) → `409 BARCODE_TAKEN`. Opcional. | 6.4, 6.5 | PA-11, STK-01 |
| 4 | **"Varios"**: único (índice parcial), sin costo (`CHECK`), sin stock, no se crea por la API (`isMiscellaneous` no es un campo de request), **no se desactiva** (`422 MISC_PRODUCT_LOCKED`), no se ajusta (`422 MISC_PRODUCT_NO_STOCK`), su categoría y subcategoría no se desactivan (`422 MISC_CATEGORY_LOCKED`). | 5, 6.5, 7.3, 8.2 | PA-10, H-09 |
| 5 | Productos **desactivados no aparecen en la búsqueda para vender**. | 6.1 | STK-02 |
| 6 | **Precio sugerido** = cadena de margen producto → subcategoría → categoría, sobre el costo **neto**, con IVA, redondeado **hacia arriba** a `priceRoundingStep` ($10). | 7.1 | PA-22, H-15, PA-19 |
| 7 | **Cambiar el precio a mano** mantiene el margen guardado y la respuesta muestra el **margen real**. | 7.3 | PA-21, PRE-04 |
| 8 | **El precio guardado nunca cambia solo** (costo, margen, IVA o redondeo solo cambian el sugerido). | 7.1 | D7, R3, STK-10 |
| 9 | **Márgenes** (categoría, subcategoría, producto): solo el dueño → `403 FORBIDDEN` con `details.fields`. | 2.4 | PA-33, H-05 |
| 10 | **El costo** nunca viaja a un empleado; al encargado solo en las rutas de precios. | 2 | PA-03 |
| 11 | `defaultSupplierId` **no existe en esta etapa** (→ `400` si se manda). | 3.3 | R2 del plan |
| 12 | El stock **puede quedar negativo**; no es error. | 8.2 | R2, STK regla 1 |

## 10. Códigos de error nuevos (van a `ERROR_CODES` en `shared`)

| HTTP | `code` | Mensaje sugerido |
|---|---|---|
| 409 | `CATEGORY_NAME_TAKEN` | Ya existe una categoría con ese nombre. |
| 409 | `SUBCATEGORY_NAME_TAKEN` | Ya existe una subcategoría con ese nombre en esta categoría. |
| 409 | `BARCODE_TAKEN` | Ese código de barras ya es de otro producto. |
| 422 | `CATEGORY_INACTIVE` | La categoría está desactivada. |
| 422 | `SUBCATEGORY_NOT_FOUND` | La subcategoría no existe. |
| 422 | `SUBCATEGORY_INACTIVE` | La subcategoría (o su categoría) está desactivada. |
| 422 | `SALE_UNIT_NOT_WHOLE` | Para venderlo por unidad, el stock y el mínimo tienen que ser enteros. |
| 422 | `MISC_PRODUCT_LOCKED` | El producto "Varios" no se puede modificar así. |
| 422 | `MISC_PRODUCT_NO_STOCK` | "Varios" no lleva stock. |
| 422 | `MISC_CATEGORY_LOCKED` | La categoría de "Varios" no se puede desactivar. |
| 422 | `PRODUCT_INACTIVE` | El producto está desactivado. (H-31, mientras tanto) |
| 422 | `CATEGORY_HAS_ACTIVE_PRODUCTS` / `SUBCATEGORY_HAS_ACTIVE_PRODUCTS` | Tiene productos activos: movelos o desactivalos primero. (H-27, mientras tanto) `details: { "activeProductCount": 12 }` |
| 422 | `REACTIVATION_NOT_ALLOWED` | Todavía no se puede reactivar. (H-26, mientras tanto) |

`403 FORBIDDEN` (existente) suma `details: { "fields": [...] }` cuando el problema es un campo reservado al dueño.

Acciones de auditoría nuevas: `PRODUCT_CREATE`, `CATEGORY_CREATE`, `CATEGORY_UPDATE`, `SUBCATEGORY_CREATE`, `SUBCATEGORY_UPDATE` (las demás, `PRODUCT_UPDATE`, `PRICE_CHANGE`, `STOCK_ADJUST`, `SETTINGS_UPDATE`, ya estaban en `modelo-datos.md` 2.21). Todas en la misma transacción que la acción (README 8).

## 11. Frenar y preguntar (pendientes del dueño)

No están definidas en `requisitos.md`. También figuran en `requisitos.md` 7.6.

| H | Pregunta | Opciones | Recomendación | Mientras tanto |
|---|---|---|---|---|
| H-23 | El encargado crea categorías (PA-33), pero toda categoría **tiene que tener margen** (PRE-02) y el margen **solo lo cambia el dueño**. ¿Qué margen tiene una categoría que crea el encargado? | a) El encargado pone el margen **solo al crearla**; después solo lo cambia el dueño (queda auditado). b) Toma un "margen por defecto" que el dueño configura (un dato más en Configuración). c) Solo el dueño crea categorías (el encargado, subcategorías). | a): es lo más simple y no le da al encargado más poder del que ya tiene (puede poner cualquier precio a mano, PRE-04). | Solo OWNER crea categorías. |
| H-24 | ¿Quién puede **cambiar el costo a mano** (fuera de una compra) y cargarlo en el alta? STK-01 lo pide en el alta y la edición; la matriz no lo nombra. | a) Encargado y dueño, en la pantalla de precios (como el precio). b) Solo el dueño. c) Nadie después del alta: solo cambia con compras (etapa 5) y aumentos masivos (etapa 6). | a): el encargado ya ve el costo en precios y lo cambia al cargar compras. | Solo OWNER (`netCostPrice` del encargado → `403`). |
| H-25 | Al cargar el costo a mano, ¿con qué IVA se calcula el **costo final**? (En una compra sale de la factura.) | a) Con el IVA del producto. b) Con un IVA que se elige en el formulario (por defecto, el del producto). | a): el costo final casi no se usa (la ganancia y el stock valorizado van con el neto, H-17) y la primera compra lo corrige. | a). |
| H-26 | ¿Se pueden **reactivar** productos, categorías y subcategorías desactivados? | a) Sí, encargado y dueño. b) Solo el dueño. c) No. | a): igual que desactivar. Si el código de barras ya lo tomó otro producto → `409`. | No (`422 REACTIVATION_NOT_ALLOWED`). |
| H-27 | ¿Se puede **desactivar una categoría o subcategoría que tiene productos activos**? (Borrar no: nada se borra.) | a) No: primero se mueven o desactivan sus productos. b) Sí: los productos siguen activos y a la venta; solo desaparece de los desplegables. c) Sí, y se desactivan también sus productos. | a): evita productos a la venta dentro de una categoría "apagada". | a). |
| H-28 | ¿El ajuste puede ser **"a una cantidad final"** (conteo) o solo sumar/restar? | a) Solo sumar/restar. b) Para "corrección por conteo" se escribe **lo contado** y el sistema calcula la diferencia; el resto, sumar/restar. c) Siempre se puede elegir. | b): al contar, es lo natural. Cuidado: si se vende entre que se cuenta y se guarda, la diferencia sale corrida. Se agrega `countedQuantity` al request (cambio que solo agrega). | a). |
| H-29 | ¿Cada motivo de ajuste admite **solo sumar o solo restar**? | a) Cualquier signo para todos. b) Rotura, faltante y consumo propio solo restan; carga inicial solo suma; conteo y "otro", los dos. | b): evita errores de signo (una "rotura" que suma). | a). |
| H-30 | "Para reponer" con **mínimo 0**: con stock ≤ mínimo (PA-26), un producto sin mínimo cargado y con stock 0 o negativo aparece en la lista. | a) Sí, aparece (lectura literal de PA-26). b) Solo los que tienen mínimo > 0 (mínimo 0 = "no controlar"). | a): un producto en 0 de verdad falta. | a). |
| H-31 | **Productos desactivados con stock:** ¿se pueden desactivar con stock distinto de 0? ¿Se les puede hacer un ajuste? | a) Sí a las dos (el desactivado aparece en "stock negativo" para corregirlo). b) Se desactiva con cualquier stock, pero para ajustarlo hay que reactivarlo. | a). | Se desactiva con cualquier stock; ajuste de un desactivado → `422 PRODUCT_INACTIVE`. |
| H-32 | ¿Qué se puede editar del producto **"Varios"**? (H-09 fija costo 0, categoría "Varios" y precio a mano.) | a) Solo el nombre y el IVA (el IVA sirve para el neto de sus ventas y para ARCA). b) Nada: queda como lo crea la instalación. | a). | b) (`422 MISC_PRODUCT_LOCKED`). |

**Ya resueltas por documentos aprobados** (no hace falta preguntar; se dejan para que el dueño las vea):
- ¿Cambiar el costo o el margen recalcula el precio solo? **No, solo sugiere** (D7 de `modelo-datos.md`, R3, COM-06, PA-21).
- ¿Qué pasa con el precio si cambia el IVA? **El precio no cambia** (STK-10); cambian el sugerido y el margen real (modelo 2.9: queda en auditoría).
- ¿Quién ajusta stock? **Encargado y dueño** (STK-05, matriz).

## 12. Notas para los demás agentes

- **base-datos:** ver los cambios en `modelo-datos.md` (unicidad de nombres sin mayúsculas, `CHECK`s de "Varios", extensión `unaccent`, fila inicial de `Setting`, sin `defaultSupplierId`). El seed crea "Varios" (H-09) en la categoría y subcategoría "Varios".
- **backend:** esquemas y enums nuevos en `@kiosco/shared` con los nombres de la sección 3; `effectiveMargin` nueva en `shared/money`. Armar las respuestas como dice 2.3. El ajuste y el alta con `initialStock` son una transacción con el `UPDATE ... RETURNING` de 8.2.
- **frontend:** el formulario de alta y la pestaña "Precios" calculan el sugerido en vivo con `suggestedPrice` y `realMargin` de `shared`; el precio se **precarga** con el sugerido pero lo confirma el usuario (se manda siempre `salePrice`). No mostrar ni mandar `marginPercent` si el usuario no es dueño. Mensajes por `code` (sección 10).
- **qa:** además de los tests del plan, el de 2.3 punto 4 (ningún campo de costo para empleado y encargado fuera de precios) y uno por cada `CHECK` nuevo.
