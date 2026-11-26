# 18. Anular una venta

Para: **encargado y dueño**. El empleado no puede anular ventas.
Necesitás: estar en el local, la **caja abierta** ([guía 13](13-abrir-la-caja.md)) y el motivo de la anulación.

Anular una venta la deja sin efecto: vuelven los productos al stock y, si se cobró en efectivo, el efectivo sale de la caja. Es para un error o un arrepentimiento, no para corregir una cantidad: para eso, vendé de nuevo lo que corresponda.

## Quién puede anular y desde dónde

| Quién | ¿Puede anular? |
|---|---|
| Dueño | Sí, desde el local. |
| Encargado | Sí, desde el local. |
| Empleado | No. |

> [!NOTE]
> **Solo desde el local.** Si entrás desde afuera, el botón dice **"Anular: solo desde el local"** y está apagado.

## Qué hace falta

- **Caja abierta.** Siempre, aunque la venta no haya tenido efectivo. Si no hay caja abierta, la anulación no se hace.
- **Motivo obligatorio** (hasta 200 caracteres).
- **No hay límite de antigüedad**: se puede anular una venta de un turno ya cerrado.

## Cómo se anula

1. Entrá a **Ventas** en el menú de arriba.
2. Por defecto aparecen las ventas del día de trabajo de hoy. Si necesitás otro día, cambiá **Desde** y **Hasta**.
3. Tocá el número de la venta, por ejemplo **#1024**.
4. Revisá los productos, el cobro y los medios de pago.
5. Tocá **Anular esta venta**.
6. Aparece la ventana **"Anular la venta #1024"**, que dice:
   - "Vuelven los productos al stock y el efectivo se devuelve desde la caja abierta" (si la venta tuvo efectivo).
   - "Lo cobrado con otros medios se devuelve por fuera, en el posnet o en Mercado Pago."
7. Escribí el **Motivo (obligatorio)**. Por ejemplo: `El cliente se arrepintió`.
8. Tocá **Sí, anular la venta**.

## Qué aparece después

La venta queda con la etiqueta **Anulada** y aparece el aviso **"La venta se anuló y el stock volvió."**, con lo que hay que hacer con la plata:

- **"Salieron $ 4.500 en efectivo de la caja abierta: ya quedó registrado."**: ese efectivo ya quedó anotado como salida de la caja abierta. No hace falta anotarlo a mano.
- **"Devolvé por fuera: Crédito $ 5.000"**: lo que se cobró con otros medios tiene que devolverse **fuera del sistema**, en el posnet (crédito o débito) o en Mercado Pago (QR). El sistema no hace esa devolución.

Si la venta ya estaba anulada, no aparece el botón. Dice **"Anulada el [fecha] por [nombre]. Motivo: [motivo]."**

## Puntos importantes

- **El efectivo sale de la caja que está abierta en ese momento**, aunque la venta original sea de otro turno o de una caja ya cerrada. La caja vieja no se toca.
- **Si no hay caja abierta**, la pantalla dice: **"Para anular hay que abrir la caja primero. Abrila desde «Vender» y probá de nuevo."** Abrí la caja y volvé a intentar.
- **Productos "Varios"**: no tienen stock, así que no vuelve nada al stock por ellos.
- **Si el producto se desactivó después de la venta**, igual vuelve al stock.
- **El sistema no revisa** si hay efectivo suficiente en la caja para la devolución. Si no alcanza, la diferencia aparece en el cierre de caja.
- **Una venta anulada no se puede volver a anular ni "reactivar".**

## Ejemplo

Venta #1024: $ 9.500 con $ 4.500 en efectivo y $ 4.500 en crédito (se cobraron $ 5.000 en el posnet).

1. Encargado entra a **Ventas**, abre **#1024** y toca **Anular esta venta**.
2. Motivo: `El cliente se arrepintió`. Toca **Sí, anular la venta**.
3. Los productos vuelven al stock.
4. Sale **$ 4.500 en efectivo** de la caja abierta.
5. Aviso: **"Devolvé por fuera: Crédito $ 5.000"**. Se hace la devolución en el posnet.
