# 17. Descuentos

Para: **encargado y dueño**. El empleado no ve el botón de descuento.
Necesitás: productos en el carrito de la pantalla **Vender** ([guía 14](14-vender.md)).

Un descuento baja el precio de **esta venta**. Se puede hacer en **porcentaje** (por ejemplo, 10 %) o en **pesos** (por ejemplo, $ 1.000).

## Cómo se aplica

1. Con productos en el carrito, apretá **F8** o tocá **Descuento** en la lista de atajos.
2. Se abre la ventana **Descuento**. El cursor queda en el campo de la cantidad, así que podés escribir enseguida.
3. En **Descontar en**, elegí:
   - **Porcentaje (%)**: el campo se llama **Cuántos %**. Por ejemplo, `10`.
   - **Pesos ($)**: el campo se llama **Cuántos pesos**. Por ejemplo, `1000`.
4. Opcional: en **Motivo (opcional)**, escribí por qué se descuenta. Por ejemplo, `Cliente habitual`. Hasta 200 caracteres.
5. Tocá **Aplicar**.

En el panel de la derecha aparece **Descuento** con el monto, y debajo: **"Descuento aplicado: [motivo]. Sacar"**.

> [!NOTE]
> El **Total sin recargo** de la pantalla ya tiene descontado el monto.

## Para sacar un descuento

Hay dos formas:

- Tocá **Sacar** debajo de **"Descuento aplicado"**.
- Apretá **F8**, dejá el campo **vacío** y tocá **Aplicar**. Así se saca el descuento.

## Reglas

- **El descuento es solo para la venta que estás armando.** Cuando cobrás, el descuento se borra. La venta siguiente empieza sin descuento.
- **Si vaciás el carrito** (F9), también se saca el descuento.
- **Quitar o cambiar cantidades** no borra el descuento: se recalcula sobre el nuevo subtotal.
- El descuento en **porcentaje** tiene que ser **menor al 100 %**. Con 100 % aparece: **"El descuento tiene que ser menor al 100 %."**
- El descuento en **pesos** tiene que ser **mayor a $ 0**.
- El descuento tiene que ser **menor que el subtotal**. Si es igual o mayor, la pantalla avisa: **"El descuento tiene que ser menor que el subtotal. Cambialo o sacalo."**
- Si el descuento es tan chico que da $ 0 (por ejemplo, 0,01 % sobre $ 500), avisa: **"El descuento es tan chico que da $ 0. Cambialo o sacalo."**
- Los descuentos en pesos se redondean al peso entero.

## Qué queda registrado

Cada venta con descuento guarda:

- El monto descontado.
- El porcentaje, si se pidió en %.
- El motivo, si se escribió.

Además, el sistema deja un registro de auditoría con quién aplicó el descuento y cuándo. En el detalle de la venta, en **Ventas**, aparece el motivo junto al descuento.

## Ejemplo

Dos productos por $ 6.000 y $ 4.000 (subtotal $ 10.000). Encargado aplica **10 %** con el motivo "Cliente habitual".

- Descuento: $ 1.000.
- **Total sin recargo**: $ 9.000.
- Al cobrar con crédito, el recargo se calcula sobre lo que vale esa parte antes del descuento ([guía 16](16-cobrar.md)).
