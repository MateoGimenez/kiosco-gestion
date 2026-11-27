# 21. Registrar gastos, retiros y aportes de efectivo

Para: **encargado y dueño**. El empleado no ve esta pantalla.
Necesitás: estar en el local, con la caja abierta ([guía 13](13-abrir-la-caja.md)).

Cuando sale plata de la caja para algo que no es una venta (pagar limpieza, sacar tu parte) o entra plata que no es una venta (poner cambio en la caja), lo anotás como **ingreso** o **salida**. Así el cálculo de lo que debería haber en la caja queda bien ([guía 22](22-arqueo-y-diferencias.md)).

> [!NOTE]
> Los pagos a proveedores no se cargan desde acá: se registran desde la cuenta de cada proveedor ([guía 28](28-cuenta-corriente-y-pagos.md)). Si pagás con efectivo de la caja, la salida aparece sola en el arqueo.

> [!NOTE]
> **Solo desde el local.** Si entrás desde afuera, el botón **Registrar ingreso o salida** está apagado y dice "Los movimientos y el cierre se hacen solo desde el local."

## Cómo se registra

1. Entrá a **Caja** en el menú de arriba.
2. En el recuadro **Caja abierta**, tocá **Registrar ingreso o salida**.
   - También podés tocarlo desde **Ver el detalle** de la caja abierta.
3. En **¿Qué pasó con el efectivo?**, elegí primero el sentido:
   - **Entra plata**, o
   - **Sale plata**.
   El sistema no te pide el signo: el sentido lo elegís vos y el resto sale solo.
4. En **Motivo**, elegí uno. Solo aparecen los motivos que corresponden a ese sentido.
5. En **Descripción**, escribí qué fue, en pocas palabras (hasta 200 caracteres). Por ejemplo: `Pago limpieza`.
6. En **Monto ($)**, escribí cuánto fue, mayor a $ 0. Por ejemplo: `500`.
   - Debajo aparece: "Según el sistema, hasta ahora debería haber $ X en la caja." Es solo una referencia.
7. Tocá **Revisar**.
8. Aparece una confirmación con el monto, el motivo y la descripción. Revisala y tocá **Sí, registrar la salida** (o **Sí, registrar la ingreso**, según el sentido que elegiste). Si te equivocaste, tocá **No, corregir**.
9. Aparece **"Listo, el movimiento quedó registrado."**

## Los motivos

| Motivo | Entra o sale | Cuándo usarlo | Ejemplo |
|---|---|---|---|
| **Gasto** | Sale plata | Algo que se pagó con efectivo de la caja. | Pago limpieza: $ 500. |
| **Retiro del dueño** | Sale plata | Cuando el dueño saca plata de la caja. | Retiro del dueño: $ 3.000. |
| **Aporte de cambio** | Entra plata | Cuando se pone plata en la caja para tener cambio. | Entran $ 1.000 en billetes chicos. |
| **Otro** | Entra o sale | Lo que no encaja en los otros motivos. En la descripción, explicá qué fue. | Sale $ 300: corrección de un vuelto mal dado. |

Hay tres motivos que **no** se cargan a mano:

- **Devolución por anulación:** la hace sola el sistema cuando se anula una venta ([guía 18](18-anular-una-venta.md)).
- **Pago a proveedor:** se registra desde la cuenta del proveedor ([guía 28](28-cuenta-corriente-y-pagos.md)). Aparece en la caja como "Pago a proveedor".
- **Devolución del proveedor:** cuando un proveedor te devuelve plata, se registra desde su cuenta ([guía 28](28-cuenta-corriente-y-pagos.md)). Aparece en la caja como "Devolución del proveedor".

## Lo que hay que saber

- **Solo con caja abierta.** Si no hay caja abierta, aparece "No hay ninguna caja abierta. Abrí la caja para seguir." Abrila primero ([guía 13](13-abrir-la-caja.md)).
- **No se edita ni se borra.** Si te equivocaste, no se corrige el movimiento: se carga otro en sentido contrario, con motivo **Otro** y una descripción que diga qué pasó. Por ejemplo, si cargaste un gasto de $ 500 por error, cargás un **Ingreso** de $ 500 con motivo **Otro** y la descripción "Corrección: gasto cargado por error".
- **El sistema no revisa si hay plata suficiente.** Si sacás más de lo que debería haber, el esperado de la caja puede quedar en negativo. Esa diferencia aparece en el arqueo.
- **Cada movimiento queda con tu nombre y la hora.** Se ven en el detalle de la caja, en el recuadro **Ingresos y salidas**.

## Ejemplo

Hay una caja tarde abierta con $ 5.000 de inicio y $ 3.000 cobrados en efectivo.

1. Encargado entra a **Caja** y toca **Registrar ingreso o salida**.
2. Elige **Sale plata** y el motivo **Gasto**.
3. Descripción: `Pago limpieza`. Monto: `500`.
4. Toca **Revisar**, después **Sí, registrar la salida**.
5. En el detalle, el efectivo que debería haber baja de $ 8.000 a $ 7.500.

## Quién no puede hacerlo

- **El empleado** no tiene el menú **Caja**. Si intenta registrar un movimiento, el sistema lo rechaza.
