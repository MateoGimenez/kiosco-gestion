# 20. Cerrar la caja (cierre a ciegas)

Para: el empleado (solo la caja que abrió él), el encargado y el dueño (cualquier caja abierta).
Necesitás: estar en el local, la caja abierta ([guía 13](13-abrir-la-caja.md)) y el efectivo del cajón a mano.

Cerrar la caja es lo último que se hace al terminar el turno. Contás el efectivo, escribís cuánto hay y el sistema guarda el cierre.

> [!IMPORTANT]
> **Después de cerrar no se puede cambiar el número.** Contá bien antes de confirmar.

> [!NOTE]
> **Es un cierre a ciegas.** No vas a ver cuánto debería haber en la caja. Contá lo que hay de verdad. Más abajo está el motivo.

## Quién puede cerrar

| Quién | Qué puede cerrar |
|---|---|
| Empleado | Solo la caja que abrió él. |
| Encargado | Cualquier caja abierta, también la que abrió un empleado. |
| Dueño | Cualquier caja abierta. |

Si un empleado intenta cerrar una caja que abrió otra persona, aparece: **"Esta caja la abrió [nombre]. La puede cerrar quien la abrió, un encargado o el dueño."** En ese caso no aparece el botón para cerrar.

Desde afuera del local no se cierra la caja: aparece **"Solo desde el local. Desde afuera no se puede cerrar la caja."**

## Antes de empezar: el carrito

Si tenés productos armados en la pantalla **Vender**, el sistema no deja cerrar desde ahí. Aparece:

> **Tenés un carrito sin cobrar. Cobralo o vacialo antes de cerrar la caja.**

Hacé una de estas dos cosas:

- Cobrá la venta ([guía 16](16-cobrar.md)).
- Vaciá el carrito con **F9** (pide confirmación; ver [guía 15](15-atajos-de-teclado.md)).

Después, volvé a tocar **Cerrar caja**.

## Cómo se cierra

1. Entrá a **Vender** y tocá **Cerrar caja**, que está junto al texto "Caja abierta". Encargado y dueño también pueden entrar desde **Caja**, en el recuadro **Caja abierta**, con el botón **Cerrar caja**.
2. Se abre la pantalla **Cerrar la caja**. Arriba dice el turno, el día y quién la abrió, por ejemplo: "Turno tarde del 26/11 · abierta por Juan Ruiz a las 17:00".
3. Contá **todo** el efectivo del cajón (billetes y monedas).
4. Escribí el total en **Efectivo contado ($)**. Si no hay nada, escribí `0`.
5. (Opcional) Si te ayuda, abrí **Contar por billetes (ayuda)**:
   - Escribí cuántos billetes hay de cada valor: $ 20.000, $ 10.000, $ 2.000, $ 1.000, $ 500, $ 200 y $ 100.
   - En **Monedas y otros**, escribí el monto de las monedas.
   - Abajo aparece la **Suma**. Por ejemplo: 3 billetes de $ 2.000 (son $ 6.000), 1 de $ 1.000 y monedas por $ 400 dan **$ 7.400**.
   - Tocá **Usar este total** para pasar la suma al campo **Efectivo contado ($)**.
   - La ayuda no guarda nada: solo suma.
6. (Opcional) En **Nota**, escribí algo que el encargado tenga que saber del turno. Hasta 500 caracteres. Por ejemplo: "Se cortó la luz un rato a las 20:00."
7. Tocá **Revisar y cerrar**.
8. Aparece la pregunta **"¿Contaste $ 7.400?"**, con el monto que escribiste:
   - Si es correcto, tocá **Sí, cerrar la caja**.
   - Si no, tocá **No, corregir** y vuelve el formulario para cambiar el número.

> [!NOTE]
> La pregunta repite **el monto que escribiste**, no el que calcula el sistema.

## Qué ves al terminar

- **Si sos empleado:** aparece **"Caja cerrada"** y el texto **"Contaste $ 7.400."**. También dice a qué hora se cerró y que, para vender, hay que abrir una caja nueva. No ves ningún otro número. Tocá **Volver al inicio**.
- **Si sos encargado o dueño:** pasás al detalle de la caja, con el aviso "La caja quedó cerrada. Este es el resultado.". Ahí ves el esperado y la diferencia. Lo explica la [guía 22](22-arqueo-y-diferencias.md).

## Por qué no se ve el esperado

El sistema calcula cuánto efectivo debería haber en el cajón: lo que había al abrir, más lo cobrado en efectivo, más los ingresos, menos las salidas. Ese número **no se muestra a quien cuenta**, por dos razones:

- Si se viera antes, se podría contar hasta que coincida. El control no serviría.
- La caja puede haberla abierto otra persona, y el esperado depende de ese dato.

El encargado y el dueño lo ven después de cerrar, en el detalle de la caja.

Si falta o sobra plata, el cierre igual se guarda. Un faltante **no frena el cierre**: queda registrado y el encargado o el dueño pueden agregar una nota.

## Si se corta la conexión

Si se corta el WiFi justo al tocar **Sí, cerrar la caja**, puede que el cierre se haya guardado igual. No vuelvas a contar. Si tocás otra vez **Revisar y cerrar** y la caja ya la cerraste vos, aparece **"La caja ya quedó cerrada."**

## Errores frecuentes

| Qué ves | Qué hacer |
|---|---|
| **"Escribí cuánto efectivo contaste. Si no hay nada, poné 0."** | Escribí el total, o `0` si no hay efectivo. |
| **"La nota puede tener hasta 500 caracteres."** | Acortá la nota. |
| **"Tenés un carrito sin cobrar. Cobralo o vacialo antes de cerrar la caja."** | Cobrá la venta o vaciá el carrito con F9. |
| **"Esta caja la abrió [nombre]. La puede cerrar quien la abrió, un encargado o el dueño."** | Pedile a quien la abrió, a un encargado o al dueño que la cierre. |
| **"Solo desde el local"** | Cerrala desde la PC o la tablet del local. |
| **"Esta caja ya está cerrada."** | Ya se cerró. No hace falta hacer nada. |
| **"No hay nada para cerrar."** | No hay caja abierta. Para vender, abrí una caja ([guía 13](13-abrir-la-caja.md)). |

Si aparece otro mensaje, probá de nuevo. Si sigue, avisale al encargado.
