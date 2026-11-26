# 25. Cargar una compra

Para: **encargado y dueño**. El empleado no ve esta pantalla.
Necesitás: la factura o el remito que llegó con la mercadería, y el proveedor dado de alta ([guía 24](24-proveedores.md)).

Cada vez que llega mercadería, se carga la compra. Al guardarla:

- **Sube el stock** de cada producto.
- **Cambia el costo** de cada producto, con lo que dice la factura.
- **Sube la deuda** con el proveedor por el total de la factura (o baja, si se paga en el acto).

Se puede cargar desde el local o desde afuera. Lo único que solo se hace desde el local es **pagar con efectivo de la caja**.

## Paso a paso

1. Entrá a **Compras** en el menú de arriba y tocá **Cargar una compra**.
   - Si venís desde la cuenta de un proveedor, tocá **Cargar una compra** ahí: el proveedor ya queda elegido.
2. Completá el **comprobante**:
   - **Proveedor**: elegilo de la lista. Solo aparecen los activos.
   - **Tipo de comprobante**: **Factura**, **Remito** u **Otro comprobante**.
   - **Número del comprobante** (opcional). Por ejemplo: `0003-00012345`.
   - **Fecha del comprobante**: la fecha que dice el papel. Puede ser de hoy o anterior, pero **no futura**.
3. En **Productos**, buscá cada producto con el lector de códigos de barras, o escribiendo el nombre y apretando **Enter**. Cada producto aparece como una línea, con su stock actual.
4. En cada línea, elegí **cómo lo compraste**: **Por unidad** (o **Por kg**, si el producto se vende por peso) o **Por bulto**.
5. Completá los datos de la línea (ver los dos casos abajo).
6. Elegí el **IVA de la factura** de esa línea. Viene precargado con el IVA del producto: cambialo si la factura dice otra cosa.
7. Repetí los pasos 3 a 6 para cada producto de la factura.
8. Mirá los **Totales** a la derecha y compará el **Total a pagar** con el total de la factura.
9. Si hay **otros cargos** (percepciones, flete), escribilos en **Otros cargos**.
10. Si querés, escribí una **nota**.
11. Elegí si **pagás ahora** o no ([ver abajo](#pagar-ahora)).
12. Si tenés la factura en el celular, sacale foto o subí el PDF en **Fotos de la factura** ([guía 26](26-fotos-de-la-factura.md)).
13. Tocá **Guardar la compra**. Con el teclado, **Ctrl + Enter** también la guarda.

## Línea por unidad o por bulto

### Por unidad (o por kilo)

Se carga lo que se compró, en unidades (o en kilos, para los productos por peso):

- **Cantidad** (o **Kilos**).
- **Costo sin IVA por unidad** (o **Costo sin IVA por kg**): el precio de una unidad, sin IVA.

Ejemplo: 20 alfajores a $ 450 sin IVA, cada uno. Escribís `20` y `450`. El subtotal sin IVA es **$ 9.000,00**.

### Por bulto (caja, pack)

Se carga cuántos bultos llegaron, cuántas unidades trae cada uno, y cuánto cuesta **un bulto**:

- **Bultos**: cuántas cajas llegaron.
- **Unidades por bulto**: cuántas unidades trae cada caja. Viene precargado con el dato del producto: revisalo.
- **Costo sin IVA de un bulto**: lo que dice la factura por **una** caja.

Ejemplo: 2 cajas de 12 gaseosas a $ 10.000 cada una, sin IVA. Escribís `2` en **Bultos**, `12` en **Unidades por bulto** y `10000` en **Costo sin IVA de un bulto**. Debajo de la línea aparece:

> Entran 24 unidades · $ 833,33 cada una sin IVA · Subtotal sin IVA: $ 20.000,00

El sistema calcula solo las unidades (2 × 12 = **24**) y el costo de cada una ($ 10.000 ÷ 12 = **$ 833,33**). El subtotal de la línea es lo que dice la factura: 2 × $ 10.000 = **$ 20.000**. Por eso, 24 por $ 833,33 da $ 19.999,92: son 8 centavos de redondeo, y la deuda queda en $ 20.000, como la factura.

> [!NOTE]
> Si una caja trae medio bulto, o cantidades que no son cajas enteras, cargalo **por unidad**.

## Los totales

A la derecha, los **Totales** se actualizan mientras cargás:

- **Neto (sin IVA)**: la suma de los subtotales de las líneas.
- **IVA 21 %** (y otras alícuotas si las hay): el IVA de la factura, calculado por alícuota sobre el neto.
- **Otros cargos**: lo que escribiste en ese campo.
- **Total a pagar**: lo que se le debe al proveedor.

Siguiendo el ejemplo, con las 2 cajas de 12 y otros 20 alfajores a $ 450 sin IVA, el neto es $ 29.000,00, el IVA 21 % es $ 6.090,00 y el total es **$ 35.090,00**.

> [!NOTE]
> Compará el **Total a pagar** con el total de la factura. Si no coincide, casi siempre hay un costo mal escrito: revisá las líneas antes de guardar.

## Otros cargos

En **Otros cargos (opcional)** van las percepciones de IIBB o IVA, el flete, y otros cargos que la factura suma al total. Por ejemplo, una percepción de $ 600 y un flete de $ 500: escribís `1.100`.

- Sí suman a la **deuda** con el proveedor.
- **No** cambian el **costo** de los productos.
- No llevan IVA propio.

Si querés aclararlo, escribilo en **Notas** (por ejemplo: "percepción IIBB $ 600 y flete $ 500").

## Pagar ahora

Por defecto, el total de la compra queda como **deuda** con el proveedor. Si lo pagás en el momento, marcá **Pagar ahora**.

1. **De dónde sale la plata**: elegí una de las cuatro opciones. Ver la tabla de la [guía 28](28-cuenta-corriente-y-pagos.md#los-cuatro-origenes-del-pago).
2. **Monto que pagás ahora**: viene con el total. Podés cambiarlo para pagar solo una parte: el resto queda como deuda.
3. **Referencia** (opcional): por ejemplo, el número de la transferencia.

Aunque se pague en el momento, la compra **siempre** suma la deuda por el total, y el pago la resta. Si elegiste **Efectivo de la caja**:

- Tiene que haber una **caja abierta**. Si no, aparece "No hay ninguna caja abierta. Abrí la caja para seguir." y la compra no se guarda.
- La salida de plata queda en la caja abierta, como un pago a proveedor.

Si el monto que pagás es mayor que la deuda, el sistema pregunta antes de guardar: "Estás pagando más de lo que se debe". Tocá **Guardar igual** solo si es a propósito.

## Qué pasa con el stock y con el costo

Al guardar la compra:

| Qué | Qué pasa |
|---|---|
| **Stock** | Sube por la cantidad de cada línea (en el ejemplo, **+24** de la gaseosa). |
| **Costo** | El costo del producto pasa a ser el **último costo pagado**: el de la línea, sin IVA y con IVA. El sistema calcula el costo con IVA solo. |
| **Costo en cero** | Si una línea tiene costo $ 0 (una bonificación, por ejemplo "12 + 1 sin cargo"), suma stock pero **no** cambia el costo. |
| **Producto repetido** | Si el mismo producto está en dos líneas, queda el costo de la última línea con costo mayor a $ 0. |
| **Unidades por bulto** | Si el bulto trae otra cantidad que la del producto, queda la última que usaste. |
| **Precio de venta** | **No cambia.** El precio se revisa aparte, en **Precios**. |
| **Proveedor habitual** | **No cambia** ([guía 24](24-proveedores.md)). |
| **Deuda** | Sube por el total de la compra. |

Una compra que suma $ 0 no se puede guardar.

## Cuando cambió el costo

Después de guardar, la pantalla dice cuántos productos cambiaron de costo. En la lista aparecen:

- el **costo sin IVA** de antes y de ahora,
- el **porcentaje** de cambio,
- el **precio de venta de hoy**, que **no se toca solo**,
- el botón **Revisar precio**, que lleva a la pantalla de Precios del producto.

Si un costo subió y el precio de venta no, el margen del kiosco baja. Revisalo ahí.

## Avisos que pueden aparecer

| Aviso | Qué hacer |
|---|---|
| "Ese comprobante ya está cargado" | Ya hay una compra con ese número para ese proveedor. Si es la misma factura, **no** la cargues de nuevo: el stock y la deuda se sumarían dos veces. Si es otra factura con el mismo número, tocá **Cargar igual**. |
| "Este producto está en otra línea de la compra" | Si es a propósito (por ejemplo, una bonificación en otra línea), está bien. |
| "Su proveedor habitual es ... No se cambia solo." | Es un aviso. Si la compra es de otro proveedor, no pasa nada. |
| "Este producto está desactivado y no se puede comprar" | Reactivalo desde su ficha, o sacalo de la compra. |
| "Hay líneas incompletas o con errores" | Revisá las líneas marcadas abajo. |

## Ejemplo completo

Llegó una factura de Distribuidora Sur por **$ 35.090,00** (neto $ 29.000,00 más IVA 21 % de $ 6.090,00):

1. Compras > **Cargar una compra**.
2. Proveedor: **Distribuidora Sur**. Tipo: **Factura**. Número: `0003-00012345`. Fecha: la de la factura.
3. Buscás la gaseosa con el lector. **Por bulto**: 2 bultos, 12 unidades por bulto, $ 10.000 sin IVA el bulto, IVA 21 %.
4. Buscás el alfajor. **Por unidad**: 20, $ 450 sin IVA, IVA 21 %.
5. Compará: el **Total a pagar** tiene que dar $ 35.090,00, igual que la factura.
6. No pagás ahora. Sacás una foto de la factura.
7. **Guardar la compra**.

Resultado: la gaseosa sube 24 en stock, el alfajor sube 20, la deuda con el proveedor sube $ 35.090,00 y los costos cambian.
