# 16. Cobrar una venta

Para: todo el personal.
Necesitás: un carrito con productos ([guía 14](14-vender.md)) y la caja abierta.

Para cobrar tocá **Cobrar** o apretá **Ctrl+Enter**. Se abre la ventana **Cobrar**, que tiene arriba el **Total a cobrar**.

> [!IMPORTANT]
> En la ventana de cobro, el **Total a cobrar** puede ser más alto que el **Total sin recargo** de la pantalla de venta. La diferencia es el **recargo de crédito**.

## Cobrar todo en efectivo

Es el caso más simple.

1. Apretá **Ctrl+Enter** (o tocá **Cobrar**).
2. La ventana ya trae el monto completo en **Efectivo**.
3. Si el cliente te da billetes y querés saber el vuelto, escribí cuánto entrega en **Efectivo que entrega el cliente (opcional)**. Aparece **"Vuelto $ ..."**.
4. Tocá **Cobrar $ [total]**.
5. Aparece el resumen **"Venta #[número] cobrada"**. Tocá **Cerrar**.

El carrito queda vacío y el cursor vuelve al buscador.

Si no tocaste **Todo en efectivo** y cambiaste el pago, podés volver a todo en efectivo con el botón **Todo en efectivo** de arriba.

## Pago mixto (dos o más medios)

Ejemplo: dos productos por $ 10.000, con un descuento de $ 1.000 (ver [guía 17](17-descuentos.md)). Queda **Total sin recargo $ 9.000**. El cliente paga $ 4.500 en efectivo y el resto con crédito.

1. En la fila del **Efectivo**, escribí `4500` en **Monto del pago 1 (sin recargo)**.
2. En **Resto con:** tocá **Crédito**. Se agrega una fila con lo que falta: `4500`.
3. Arriba, el **Total a cobrar** pasa a **$ 9.500**: los $ 4.500 de crédito tienen un recargo de $ 500.
4. Debajo de la fila de crédito aparece **"Cobrá $ 5.000 en el posnet"**.
5. La línea de estado dice **"Los pagos cubren el total."** cuando está completo.
6. Tocá **Cobrar**.

Cada fila tiene:

- El **medio de pago** (la lista de arriba de la fila).
- El **monto sin recargo**: lo que corresponde a ese medio dentro de la venta.
- **Quitar**: saca la fila. No se puede quitar la última.

Para repetir un medio (por ejemplo, dos tarjetas de crédito), tocá otra vez el botón del medio en **Resto con:**.

## "Resto con…"

Los botones **Resto con:** agregan una fila con el monto que falta, con el medio que elijas. Solo se pueden usar si todavía falta cobrar.

Lo que muestra la línea de estado:

- **"Falta cobrar $ X."**: todavía falta plata. Agregá otra fila o cambiá un monto.
- **"Los pagos cubren el total."**: está completo, se puede cobrar.
- **"Los pagos se pasan del total por $ X."**: sobra plata. Bajá un monto.

Después de tocar un botón de **Resto con**, el cursor queda en el monto que se agregó y **Ctrl+Enter** sigue cobrando si el cobro está completo.

## Qué hace Enter en la ventana de cobro

**Enter en un monto o en la lista de medios no cobra**: solo pasa al campo siguiente (el efectivo que entrega el cliente o el botón **Cobrar**). Así no se cobra por error antes de terminar de cargar el segundo pago.

Se cobra con **Ctrl+Enter** (desde cualquier lugar de la ventana), con **Enter** en **Efectivo que entrega el cliente** o con **Enter** sobre el botón **Cobrar**. Solo cobra si los pagos cubren el total.

## Pago con crédito: el recargo

El crédito tiene un **recargo del 10 %** (lo configura el dueño, ver [guía 19](19-medios-de-pago.md)). Es lo que el banco o el posnet le suma al cliente.

**Por qué el sistema calcula el recargo:** así el total cobrado siempre es el mismo en todos lados. Vos escribís la parte de la venta que va con crédito, **sin recargo**, y el sistema calcula cuánto hay que tipear en el posnet. Si lo calculás a mano, es fácil equivocarse por unos pesos.

El recargo se calcula sobre el **precio sin descuento** de lo que se paga con crédito. Si hay descuento, el recargo no se achica.

Cuando hay crédito o débito, debajo de la fila aparece:

> **Cobrá $ 5.000 en el posnet** ($ 4.500 + $ 500 de recargo)

Eso es lo que tenés que tipear en el posnet. Lo que se registra en la venta es ese monto.

> [!NOTE]
> El débito aparece también con **"Cobrá $ ... en el posnet"**, pero sin recargo (el débito no lleva recargo).

## Vuelto

El vuelto **solo sale de la parte en efectivo**, aunque haya otros medios.

Con el ejemplo anterior: total $ 9.500 (con recargo), $ 4.500 en efectivo y $ 4.500 en crédito, que se cobran $ 5.000 en el posnet. Si el cliente entrega $ 5.000 en efectivo:

- Vuelto: $ 5.000 − $ 4.500 = **$ 500**.

Si escribís en **Efectivo que entrega el cliente** un monto menor que la parte en efectivo, aparece: **"No alcanza para la parte en efectivo ($ X)."**

## QR y transferencia

- **QR Mercado Pago** y **Transferencia** tienen que cubrir **exacto** la parte que les toca. No pueden pasarse del total.
- Si el cliente transfirió **de más**, la diferencia **se le devuelve por fuera del sistema** (por Mercado Pago o por la banca). El sistema no lo registra.
- Si intentás poner más, aparece: **"No puede pasar del total. Si el cliente transfirió de más, se le devuelve por fuera del sistema."**

Ejemplo: total $ 4.800. El cliente paga por transferencia. Escribí `4800` en la fila de **Transferencia**. Si el cliente transfirió $ 5.000, devolvé $ 200 por fuera.

## Qué pasa si "el total cambió"

Si cambió un precio, o el porcentaje del recargo, mientras armabas la venta, el sistema **no cobra**. Aparece el aviso:

> **El total cambió: antes era $ X y ahora es $ Y** (se actualizó un precio o el recargo). Revisá el carrito y confirmá para cobrar de nuevo.

Qué hacer:

1. Mirá el carrito: los precios ya están actualizados.
2. Si el cliente está de acuerdo con el total nuevo, tocá **Confirmar y cobrar $ Y**.
3. Si no, tocá **Volver al carrito** y revisá la venta.

Nada se cobra hasta que confirmes.

## Otros avisos al cobrar

- **"Hay productos desactivados"**: un producto se desactivó con la venta armada. Quitalo del carrito y volvé a cobrar.
- **"Esa venta ya se había cobrado (venta #N)"**: la venta ya se guardó (por ejemplo, se cortó la conexión y después se volvió a intentar). Revisá antes de cobrar de nuevo. Si la venta ya está cobrada, tocá **Dejarla como cobrada y empezar otra**.
- **"No se pudo confirmar el cobro por un problema de conexión"**: la venta puede haberse guardado. Tocá **Reintentar cobro**. Se usa el mismo número de venta, así que **no se cobra dos veces**.
- **"No se pudo cobrar"**: aparece el motivo. Si no entendés el mensaje, avisale al encargado.

> [!WARNING]
> No cierres la ventana ni apagues la PC mientras aparece **Cobrando…**. Si pasa, esperá y revisá si la venta quedó guardada antes de volver a cobrar.

## Volver sin cobrar

Tocá **Volver al carrito** o apretá **Esc**. No se guarda nada, y el carrito queda como estaba.

Si la ventana de cobro no entra en la pantalla, desplazate dentro de ella hasta el final: ahí están los botones **Volver al carrito** y **Cobrar**.
