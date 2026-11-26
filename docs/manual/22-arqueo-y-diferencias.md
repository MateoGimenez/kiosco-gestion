# 22. Revisar el arqueo y las diferencias

Para: **encargado y dueño**.
Necesitás: entrar al sistema con tu usuario. Se puede ver desde el local o desde afuera.

El **arqueo** es la cuenta del efectivo de una caja: cuánto debería haber, cuánto se contó y la diferencia. Lo revisás después de cerrar la caja. Mientras la caja está abierta, la misma cuenta sirve para ver "cómo va hasta ahora".

## Dónde está

1. Entrá a **Caja** en el menú de arriba.
2. Arriba, en **Caja abierta**, aparece la caja de turno si hay una. Tocá **Ver el detalle** para verla.
3. Abajo está la **lista de cajas**. Tocá una (por ejemplo, **Caja #8**, con el día y el turno) para abrir su detalle.
4. En el detalle, arriba, ves el turno, el día, quién la abrió, quién la cerró y si está **Cerrada** o **Abierta**.

## La cuenta del efectivo

El detalle muestra la cuenta de arriba hacia abajo:

| Línea | Qué es |
|---|---|
| **Efectivo inicial** | Lo que se declaró al abrir la caja. |
| **+ Cobrado en efectivo** | Lo cobrado en efectivo en todas las ventas de esa caja. Incluye las ventas que después se anularon. |
| **+ Ingresos** | Los movimientos "Entra plata" ([guía 21](21-gastos-retiros-y-aportes.md)). |
| **− Salidas** | Los movimientos "Sale plata", incluidas las devoluciones por anulación. Si hubo devoluciones, aparece aparte cuánto fueron. |
| **= Esperado** | Lo que debería haber en el cajón. En una caja abierta dice "Esperado hasta ahora". |
| **Contado** | Lo que escribió quien cerró la caja. Si está abierta, dice "Todavía no se contó". |
| **Diferencia** | Contado − Esperado. |

### Ejemplo del plan

- Abre con **$ 5.000**.
- Vende **$ 3.000** en efectivo y **$ 2.000** con débito.
- Gasto "Pago limpieza": **$ 500**.

Esperado: 5.000 + 3.000 + 0 − 500 = **$ 7.500**. El débito de $ 2.000 **no entra**, porque no es efectivo.

Si quien cerró contó **$ 7.400**, la diferencia es 7.400 − 7.500 = **−$ 100**. El detalle dice **"Faltan $ 100"**.

### Reglas de la cuenta

- **Solo entra el efectivo.** Débito, crédito, QR y transferencia no entran en la cuenta de arriba.
- **El recargo del crédito no entra.** Se cobra en el posnet, no en la caja.
- **El vuelto no entra.** Lo que queda en la caja es el monto de la venta, no lo que el cliente entregó. Ejemplo: una venta de $ 4.647 en efectivo, el cliente da $ 5.000 y recibe $ 353 de vuelto. En la caja quedan **$ 4.647**.
- **Las ventas anuladas siguen contando en su caja.** La devolución de una anulación aparece como salida en la caja que estaba abierta cuando se anuló ([guía 18](18-anular-una-venta.md)). Puede ser otra caja. Por eso la caja cerrada no cambia.
- **La diferencia tiene texto y color:**
  - **Sin diferencia** (verde).
  - **Sobran $ X** (ámbar): hay más plata de la que debería.
  - **Faltan $ X** (rojo): hay menos plata de la que debería.

## Resumen por medio de pago

Debajo de la cuenta aparece **Por medio de pago**: una fila por cada medio que se usó en esa caja.

| Columna | Qué quiere decir |
|---|---|
| **Pagos** | Cuántos pagos se hicieron con ese medio. |
| **Recargo** | El recargo del crédito de esos pagos. |
| **Cobrado** | Lo que se cobró con ese medio. En crédito, es lo que se tipea en el posnet, con el recargo. |
| **De ventas anuladas** | Lo cobrado con ese medio en ventas que después se anularon. Esa plata se devolvió por fuera del sistema o en otra caja. |

> [!NOTE]
> Solo el efectivo entra en la cuenta de arriba. Los otros medios se muestran como información.

Debajo del resumen, **Ventas y anulaciones** dice cuántas ventas hubo y cuántas se anularon. Tocá el número de una venta para abrir su detalle ([guía 18](18-anular-una-venta.md)).

## Diferencia de apertura

Al abrir una caja, el sistema compara el **efectivo inicial** con lo que se contó en el **cierre anterior**. Si no coinciden, marca la apertura.

- **En el detalle**, aparece un aviso como este:

  > La apertura no coincide con el cierre anterior. Al abrir se declararon $ 7.000; en el cierre anterior (caja #7) se contaron $ 7.400: diferencia de −$ 400 (se declaró menos).

  El número de la caja anterior es un enlace para ver ese cierre.
- **Si coinciden**, aparece: "La apertura coincide con el cierre anterior."
- **Si no hay diferencia pero hubo un cierre anterior**, aparece en el detalle una línea como: "En el cierre anterior (caja #7, turno mañana del 25/11) se contaron $ 7.400. Sirve de referencia para el efectivo inicial."
- **En la lista de cajas**, la caja trae la etiqueta **Apertura con diferencia**.

Sirve para ver si entre un turno y el siguiente salió o entró plata sin anotarse. **No dice quién tuvo la culpa**: es para preguntar y revisar.

> [!NOTE]
> La diferencia de apertura **solo la ven el encargado y el dueño**. El empleado no ve el efectivo del cierre anterior, ni al abrir ni en otro lado.

## Notas

En el detalle hay dos lugares:

- **Nota de quien cerró:** la nota que escribió quien cerró la caja ([guía 20](20-cerrar-la-caja.md)). Aparece en el arqueo.
- **Notas:** las notas que se agregaron después.

Para **agregar una nota**:

1. Abrí el detalle de una caja **cerrada**. Las notas solo se agregan a cajas cerradas.
2. Bajá hasta **Agregar una nota** y escribí el texto (hasta 500 caracteres). Por ejemplo: "Juan avisó que dio mal un vuelto de $ 100."
3. Tocá **Agregar nota**.

Cada nota queda con tu nombre y la hora. **No se puede editar ni borrar.**

> [!NOTE]
> Las notas no mueven plata. Si pasó algo con el efectivo durante el turno, se registra como ingreso o salida ([guía 21](21-gastos-retiros-y-aportes.md)).
> No es obligatorio agregar una nota cuando hay diferencia. La lista muestra cuántas notas tiene cada caja, para ver cuáles ya tienen una explicación.

## La lista de cajas

En **Caja**, debajo de la caja abierta, está la lista de todas las cajas, de la más nueva a la más vieja. Cada fila muestra:

- **Caja:** día de trabajo, turno y número.
- **Abrió / cerró:** quién abrió y quién cerró.
- **Contado**, **Esperado** y **Diferencia**.
- **Notas:** cuántas notas tiene la caja.

Filtros (arriba de la lista):

| Filtro | Qué hace |
|---|---|
| **Desde** y **Hasta** (día de trabajo) | Muestra solo las cajas de esos días, incluidos los dos. "Desde" no puede ser posterior a "Hasta". |
| **Turno** | Mañana, Tarde o Noche. |
| **Estado** | Abiertas o Cerradas. |
| **Diferencia** | **Solo con diferencia**: faltantes y sobrantes. **Solo sin diferencia**: las que cerraron justo. |
| **Con diferencia de apertura** | Solo las cajas que abrieron con un efectivo distinto del cierre anterior. |

> [!TIP]
> Para revisar los faltantes de la semana, poné **Desde** y **Hasta** con esos días y en **Diferencia** elegí **Solo con diferencia**. Después tocá cada caja para ver su arqueo. Recordá que "Solo con diferencia" también muestra los sobrantes.

Si ningún resultado coincide con los filtros, aparece: "No hay cajas con estos filtros."

## Una caja cerrada no cambia

Una vez cerrada, la caja no se modifica. Si después se anula una venta de esa caja, la devolución se registra en la caja que está abierta en ese momento. Por eso el arqueo de la caja cerrada siempre da lo mismo.
