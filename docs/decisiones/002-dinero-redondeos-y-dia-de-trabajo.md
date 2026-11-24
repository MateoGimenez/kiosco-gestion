# ADR 002 — Dinero, redondeos y día de trabajo

- **Estado:** aceptado
- **Fecha:** 2026-11-18
- **Etapa:** 1 (Base y login), paso 1.0
- **Origen:** `docs/modelo-datos.md` 1.1 a 1.5 (Fase 2 aprobada) y las respuestas aprobadas en `docs/requisitos.md` 7.2 y 7.4: **H-06 a)**, **H-10 b)**, **H-11 a)**, **H-15 a)**; PA-13, PA-14, PA-19, PA-20, PA-32.
- **Relacionado:** ADR 001 (paquete `shared`), `docs/api/README.md` (cómo viaja el dinero en el JSON)

## Contexto

Un error de un centavo en una venta, multiplicado por miles de ventas, descuadra la caja y los reportes. Además, el kiosco tiene tres redondeos distintos (técnico, al cobrar y de precios), recargo de crédito con reglas propias y un turno noche que pasa la medianoche. Todo eso tiene que calcularse **igual** en la pantalla (para mostrar el total mientras se arma la venta) y en el servidor (que es quien guarda), así que cada regla tiene que estar escrita **una sola vez**.

Este ADR no agrega reglas de negocio: pasa a una decisión técnica lo que ya está aprobado en los documentos de la Fase 2.

## Decisión

### 1. Dinero: `Decimal` de Prisma, columna `numeric(14,2)`

- Todo importe (precios, costos, totales, pagos, saldos) es `Decimal @db.Decimal(14, 2)` en Prisma = `numeric(14,2)` en PostgreSQL: pesos con 2 decimales, hasta $ 999.999.999.999,99.
- **Por qué no centavos enteros:** con la inflación, un total mensual en centavos pasa rápido el límite de `Int` de Prisma (2.147.483.647 centavos ≈ $ 21 millones), y `BigInt` complica el JSON y el código. `numeric` es exacto y se lee tal cual en la base y en Excel (`1440.00`, no `144000`).
- **Contra:** en el código no se puede usar `+`, `-`, `*`, `/` ni `Math.round` con dinero. Se usan los métodos de `Decimal` (`.plus()`, `.minus()`, `.times()`, `.div()`).

**Reglas para todo el código:**
1. **Nunca** convertir dinero, cantidades ni porcentajes a `number` de JavaScript (ni `parseFloat`, ni `Number()`, ni `+valor`). ESLint prohíbe `parseFloat` (ADR 001).
2. En el JSON de la API viajan como **string** (`"1440.00"`). Ver `docs/api/README.md`.
3. La librería es **`decimal.js`**, la misma que usa `Prisma.Decimal` por dentro. Vive en `@kiosco/shared`, que exporta su propia clase configurada:
   - `Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })`: 40 dígitos significativos alcanzan de sobra para importes de 14 dígitos con divisiones intermedias, y no depende de la configuración global de nadie más.
   - Para pasar de un `Prisma.Decimal` a la clase de `shared` (o al revés) se convierte **por string**: `new Decimal(valorPrisma.toString())`. Así no se mezclan dos copias de la librería.
4. **El servidor es la autoridad:** recalcula todo al guardar con las funciones de `shared`. Lo que calcula la pantalla es solo para mostrar.

### 2. Cantidades: `Decimal(12,3)`

- Stock y cantidades (ventas, compras, movimientos, mínimos, unidades por bulto): `Decimal @db.Decimal(12, 3)`.
- Producto **por unidad**: siempre enteros (`2.000`). Producto **por peso**: kg con hasta 3 decimales (`0.350` = 350 g).
- Que un producto por unidad tenga cantidades enteras lo valida el backend (un `CHECK` no puede mirar la unidad del producto en otra tabla).

### 3. Porcentajes e IVA

- Márgenes, recargos, descuentos y aumentos en %: `Decimal @db.Decimal(6, 2)` (`40.00` = 40 %).
- Alícuota de IVA: `Decimal @db.Decimal(5, 2)` (`21.00`, `10.50`). Valores permitidos: **0; 2,5; 5; 10,5; 21; 27**. La lista vive en `shared` (`VAT_RATES`) y la usa la validación; en la base hay un `CHECK (>= 0 AND <= 100)`.

### 4. Precios con IVA, costos neto y final (responsable inscripto, PA-13)

- El **precio de venta** se guarda **final**, con IVA incluido (lo que paga el cliente).
- Los **costos** se guardan dos veces: **neto** (sin IVA) y **final** (neto + IVA de la compra). En las compras se carga neto + % de IVA y el sistema calcula el final; **el final nunca se carga a mano**.
- La **ganancia** es sobre el **neto**: importe cobrado sin IVA − costo neto.
- **Margen sobre el costo neto (H-15 a, aprobada):** el margen se aplica al costo neto y después se suma el IVA de venta del producto.

### 5. Los tres redondeos

Cada uno es **una sola función** en `@kiosco/shared`. Nadie redondea "a mano" en otro lado.

| # | Redondeo | Regla | Dónde se usa |
|---|---|---|---|
| R-1 | **Técnico, a centavos** | 2 decimales, mitad hacia arriba (`ROUND_HALF_UP`). | Cálculos intermedios: costo final desde neto + IVA, costo por unidad de un bulto, neto sin IVA de una línea de venta, base del recargo, reparto del descuento entre líneas. |
| R-2 | **Al cobrar, al peso entero** | **Al peso más cercano; $ 0,50 sube** (H-06 a, aprobada). | Lo que compone lo cobrado: importe de cada línea de venta (`cantidad × precio`, p. ej. productos por peso), descuento y recargo (PA-20). |
| R-3 | **Comercial, de precios** | **Siempre hacia arriba** al múltiplo de `Setting.priceRoundingStep` (hoy $ 10). Si ya es múltiplo, queda igual. Con paso `0` no hay redondeo comercial: solo R-1. (PA-19, CFG-03) | Precio sugerido (por margen, al cargar compras y en aumentos masivos). |

Detalles técnicos (no cambian ninguna regla):
- "Mitad hacia arriba" es **simétrico**: se redondea el valor absoluto y se mantiene el signo (`-2,50` → `-3`). Así `redondear(-x) = -redondear(x)`. Los importes cobrados son siempre positivos; esto solo importa si alguna cuenta interna pasa por negativos.
- Se redondea **una sola vez, al final** de cada cálculo, salvo donde el modelo guarda un valor intermedio (por ejemplo, la base del recargo se guarda a centavos y el recargo se calcula desde ese valor guardado, para que se pueda recalcular igual desde la base de datos).
- Los costos y netos **sí** pueden tener centavos. Los importes que componen lo cobrado quedan en pesos enteros aunque la columna admita centavos.

### 6. Fórmulas

Todas con la clase `Decimal` de `shared`. `%` se escribe como número (`40` = 40 %).

**Costo final desde el neto (compras):**
`costoFinal = R-1( costoNeto × (1 + iva/100) )`

**Neto sin IVA de lo cobrado en una línea de venta:**
`lineNetTotal = R-1( lineTotal ÷ (1 + iva/100) )`

**Precio sugerido (H-15 a + PA-19):**
`precioSugerido = R-3( costoNeto × (1 + margen/100) × (1 + ivaVenta/100) )`
Ejemplo aprobado: costo neto $ 1.000, margen 40 %, IVA 21 % → $ 1.694 → **$ 1.700**.
Ejemplo de PRE-03: $ 1.432 → **$ 1.440**. $ 1.440 → $ 1.440.
El margen que se usa es el del producto, si tiene; si no, el de la subcategoría; si no, el de la categoría (modelo D7).

**Importe de una línea de venta:**
`lineSubtotal = R-2( cantidad × precioUnitario )`
Ejemplo: 0,350 kg × $ 4.990 = $ 1.746,50 → **$ 1.747**.

**Descuento:**
- En %: `descuento = R-2( subtotal × porcentaje/100 )`.
- En monto fijo: se aplica el mismo R-2 si viniera con centavos.
- Tiene que ser **menor** que el subtotal: no hay ventas con total $ 0 (H-10 b, aprobada).
- Reparto entre las líneas (modelo D6): proporcional al `lineSubtotal` de cada línea, a centavos (R-1); la diferencia de redondeo va a la **última** línea, así la suma da exacto.

**Recargo de crédito (PA-14 + H-11 a, aprobadas): antes del descuento y solo sobre la parte pagada con crédito.**
Para cada pago:
`surchargeBase = R-1( amount × subtotal ÷ (subtotal − descuento) )` (si no hay descuento, es igual a `amount`)
`surchargeAmount = R-2( surchargeBase × surchargePercent/100 )`
Controles: `Σ amount = subtotal − descuento`; `total = subtotal − descuento + Σ surchargeAmount`.

| Caso | Subtotal | Descuento | Pagos (`amount`) | `surchargeBase` crédito | Recargo (10 %) | Total |
|---|---:|---:|---|---:|---:|---:|
| 1. Todo crédito con descuento | 10.000 | 1.000 | crédito 9.000 | 10.000 | 1.000 | **10.000** |
| 2. Mixto | 10.000 | 1.000 | efectivo 4.500 + crédito 4.500 | 5.000 | 500 | **9.500** |
| 3. Sin descuento | 8.000 | 0 | crédito 8.000 | 8.000 | 800 | **8.800** |

Estos tres casos son tests obligatorios de qa.

### 7. Día de trabajo (PA-32)

- Cada venta y cada caja guardan su **día de trabajo** (`businessDate`, columna `date`, sin hora), calculado **por el servidor al guardar** (la venta al cobrarse; la caja al abrirse). Nunca con el reloj del dispositivo.
- Fórmula: `businessDate = fecha( hora de Buenos Aires − hora de corte )`. La hora de corte es `Setting.businessDayCutoffMinutes` (360 = 06:00).
  Con corte 06:00: martes 02:30 → **lunes**; martes 06:00 → martes; martes 23:59 → martes.
- Una sola función en `shared`: `getBusinessDate(instante, minutosDeCorte, zonaHoraria)`. Usa `Intl.DateTimeFormat` con la zona `America/Argentina/Buenos_Aires` (la de la variable `TZ` del `.env`) para obtener la fecha y hora local, **sin depender** de la zona horaria configurada en Windows ni de una librería de fechas. Si Argentina volviera a usar horario de verano, `Intl` lo resuelve solo.
- Las horas se guardan como `timestamptz` (instante exacto); en la API viajan en UTC (ISO 8601) y las pantallas las muestran en hora de Buenos Aires.
- Si el dueño cambia la hora de corte, **los registros viejos mantienen su día**: no se recalcula nada hacia atrás (los reportes pasados no se mueven).

### 8. Formato en pantalla y en Excel (NF-07)

Funciones de formato es-AR en `shared` (`Intl.NumberFormat('es-AR')`):
- Lo cobrado: `$ 1.440` (sin centavos).
- Costos y netos (pueden tener centavos): `$ 1.234,56`.
- Cantidades: por unidad sin decimales (`2`); por peso con hasta 3 (`0,350 kg`).
- Fechas `dd/mm/aaaa` y hora de 24 h, en hora de Buenos Aires.

### 9. Nombres propuestos en `@kiosco/shared`

Para que backend, frontend y qa hablen de lo mismo (el agente que las escribe puede ajustar los nombres, avisando):

| Función | Qué hace |
|---|---|
| `roundToCents(x)` | R-1 |
| `roundToPeso(x)` | R-2 |
| `roundPriceUp(x, step)` | R-3 (con `step = 0` aplica solo R-1) |
| `finalFromNet(net, vatPercent)` | Costo final desde el neto |
| `netFromFinal(final, vatPercent)` | Neto sin IVA desde un importe final |
| `suggestedPrice(netCost, marginPercent, vatPercent, step)` | Precio sugerido (H-15 a) |
| `lineSubtotal(quantity, unitPrice)` | Importe de una línea, al peso |
| `discountFromPercent(subtotal, percent)` | Descuento en % al peso |
| `allocateDiscount(lineSubtotals, discount)` | Reparto del descuento entre líneas |
| `creditSurcharge(amount, subtotal, discount, percent)` | Devuelve `{ surchargeBase, surchargeAmount }` |
| `getBusinessDate(instant, cutoffMinutes, timeZone)` | Día de trabajo |
| `formatMoney`, `formatQuantity`, `formatDate`, `formatDateTime` | Formato es-AR |

## Consecuencias

**A favor**
- Las cuentas dan exacto y **igual** en pantalla, servidor, base de datos y Excel.
- Cada regla de redondeo está en un solo lugar, con sus tests: si una regla cambia, se cambia una función.
- Los reportes por día funcionan con el turno noche y no se mueven si cambia la hora de corte.

**En contra / cuidados**
- Código un poco más largo (`a.plus(b)` en lugar de `a + b`) y conversión por string en los bordes (Prisma, JSON, formularios).
- Si alguien usa `number` con dinero, TypeScript no siempre lo detecta: lo frenan ESLint (`parseFloat`), la revisión de código y los tests.
- Si la hora de corte se configura en un horario con el kiosco abierto, las ventas de ese rato quedan en el día equivocado (por eso tiene que ser una hora con el kiosco cerrado, como dice el requisito).

## Preguntas abiertas

Ninguna. Todas las reglas usadas en este ADR están aprobadas (H-06, H-10, H-11 y H-15 con la recomendación del arquitecto).
