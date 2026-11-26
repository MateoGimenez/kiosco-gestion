# 14. Vender

Para: todo el personal (empleado, encargado y dueño).
Necesitás: la caja abierta ([guía 13](13-abrir-la-caja.md)) y, si usás lector, el lector de códigos conectado a la PC o tablet.

La pantalla **Vender** está pensada para usarla con el teclado y el lector. El cursor queda siempre en el buscador, así que podés escanear sin tocar nada.

> [!TIP]
> Los atajos de teclado están en la [guía 15](15-atajos-de-teclado.md).

## Cómo es la pantalla

- **Arriba:** el buscador, con el texto "Código de barras o nombre del producto".
- **Al medio:** el carrito, con los productos de la venta.
- **A la derecha:** el **Total sin recargo**, el botón **Cobrar** y la lista de atajos.

El **Total sin recargo** es lo que vale la venta antes de cualquier recargo. Si pagás con crédito, el recargo aparece recién al cobrar ([guía 16](16-cobrar.md)).

## Agregar con el lector (escanear y listo)

1. Pasá el código de barras por el lector.
2. El producto se agrega solo al carrito y el cursor vuelve al buscador.
3. Si escaneás el mismo producto otra vez, **suma 1** a la cantidad. No hace falta tocar nada.

> [!NOTE]
> Si el código no existe, aparece: **"No encontramos «[código]». Probá con otra palabra o con el código."**
> Si el producto está desactivado, aparece: **"El código [código] es de un producto desactivado: no se puede vender."**

## Buscar por nombre

1. Escribí parte del nombre en el buscador. Por ejemplo, `coca`.
2. Apretá **Enter**. Aparece una lista con los productos que coinciden, con su precio y su stock.
3. Elegí el producto con las flechas **↑** y **↓** y apretá **Enter**, o tocalo con el mouse.

No importan los acentos: "cafe" encuentra "Café".

> [!TIP]
> Si la lista tiene un solo resultado, igual hay que elegirlo con **Enter**.
> Para cerrar la lista sin elegir nada, apretá **Esc**.

## Productos por peso (kilos)

Los productos que se venden por kilo (por ejemplo, "Queso de máquina por kg") **no tienen código de barras**. Se buscan por nombre.

1. Buscá el producto por nombre y apretá **Enter** para elegirlo.
2. Se abre la ventana **"Cuántos kilos"**.
3. Escribí los kilos **con coma**, hasta 3 decimales. Por ejemplo: `0,350` (350 gramos).
4. Debajo aparece cuánto da: por ejemplo, **"0,350 kg = $ 1.747"**.
5. Tocá **Aceptar**.

> [!IMPORTANT]
> Si el producto ya está en el carrito, la ventana muestra la cantidad que tiene y **la reemplaza**. No la suma.

Para cambiar los kilos de una línea que ya está en el carrito, tocá el número de kilos en la columna **Cantidad**.

> [!NOTE]
> Si escribís `0,3505`, el sistema no lo acepta: por kilo, el máximo son 3 decimales.
> Si escribís `2,5` para un producto por unidad, aparece: **"Este producto se vende por unidad: usá números enteros."**

## "Varios" (F4): productos sin código

"Varios" sirve para vender algo que no tiene código ni está cargado (por ejemplo, una pila suelta).

1. Apretá **F4** o tocá el botón **Varios** de la derecha.
2. En **Precio ($)**, escribí cuánto cuesta. Tiene que ser mayor a $ 0.
3. En **Qué es (opcional)**, escribí una descripción corta. Por ejemplo, `pila AA`.
4. Tocá **Agregar**.

La línea aparece como **"Varios: pila AA"**.

> [!NOTE]
> "Varios" **no descuenta stock**.
> Si necesitás dos productos "Varios" distintos, apretá F4 dos veces: cada uno es una línea aparte.
> Con "Varios" no se usa **F3** ni el botón **Cambiar cantidad**.

## Cambiar la cantidad

En las líneas del carrito:

- **Productos por unidad:** tocá **−** o **+** de la línea para restar o sumar 1. Si tocás el número, se abre la ventana **"Cantidad"** para escribirlo.
- **Productos por kilo:** tocá el número de kilos y escribí el nuevo valor.
- Con el teclado: elegí la línea con **↑** y **↓** (con el buscador vacío) y apretá **F3**.

La cantidad de un producto por unidad no puede bajar de 1. Para sacarlo, usá **Quitar**.

## Quitar productos

- Tocá **Quitar** en la línea.
- O elegí la línea con **↑** y **↓** y apretá **Supr** (con el buscador vacío).

## Vaciar el carrito

1. Apretá **F9** o tocá **Vaciar carrito**.
2. Aparece la pregunta **"Vaciar el carrito"**: "Se van a sacar todos los productos de esta venta. Esto no se puede deshacer."
3. Tocá **Sí, vaciar**.

Al vaciar también se saca el descuento que se hubiera aplicado ([guía 17](17-descuentos.md)).

## Stock insuficiente

Si vendés más de lo que hay en stock, el sistema **avisa, pero deja vender**:

- En la línea del carrito aparece: **"Stock insuficiente (hay [cantidad]). Se puede vender igual."**
- Después de cobrar, el resumen de la venta muestra el aviso **"Quedó con stock negativo (se vendió igual)"** con el producto.

En el buscador, un producto sin stock dice **"Sin stock"**.

Qué hacer: vendé normalmente. Después el encargado corrige el stock con un ajuste ([guía 09](09-ajustar-stock.md) y [guía 10](10-para-reponer-y-stock-negativo.md)).

## Cuando el carrito está listo

Tocá **Cobrar** o apretá **Ctrl+Enter**. Seguí con la [guía 16](16-cobrar.md).

Si el botón **Cobrar** está apagado, debajo del total aparece el motivo, por ejemplo:

- **"Hay productos desactivados: quitalos para cobrar."**
- **"Hay una línea en $ 0: corregila o quitala para cobrar."**
- **"Agregá al menos un producto para cobrar."**
