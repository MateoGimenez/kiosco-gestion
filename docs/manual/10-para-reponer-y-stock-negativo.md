# 10. Para reponer y stock negativo

Para: encargado y dueño.
Necesitás: haber cargado productos con su stock mínimo ([guía 06](06-productos.md)).

En el menú **Para reponer** hay dos listas, que se eligen con dos pestañas:

- **Para reponer**: lo que está en el mínimo o por debajo.
- **Stock negativo**: lo que figura con menos de cero.

## Para reponer

1. Entrá al menú **Para reponer**. Se abre la pestaña **Para reponer**.
2. Dice: "Productos con el stock en el mínimo o por debajo. Los que más faltan, primero."
3. Cada fila muestra:
   - **Hay**: cuánto hay ahora.
   - **Mínimo · Falta**: el stock mínimo que cargaste y lo que falta para llegar a ese mínimo.
   - El botón **Ajustar**, para corregir el stock si hace falta.

Ejemplo: un producto tiene un mínimo de 12 y hay 10. En la lista dice **Hay 10**, **Mínimo 12 · Falta 2**.

### Qué entra en la lista

- Productos **activos** con stock **igual o menor** que su mínimo.
- Un producto con **mínimo 0** aparece solo si su stock es **0 o negativo**. Así no quedan fuera los productos que se vendieron y no tienen mínimo cargado.
- Los productos con **stock negativo** también aparecen acá (y en la pestaña **Stock negativo**).
- **"Varios"** nunca aparece.

Si no hay nada, dice "No hay nada para reponer por ahora. Todo está en orden."

> [!TIP]
> Para ver un producto puntual, usá el buscador de la pantalla: "Buscar por código de barras o nombre".

## Stock negativo

El stock queda en negativo cuando se vende algo que no estaba cargado. El sistema lo permite a propósito: no frena la venta. Después hay que corregirlo.

1. Entrá a **Para reponer** y tocá la pestaña **Stock negativo**.
2. Dice: "Productos que figuran con menos de cero. Se corrigen con un ajuste, por ejemplo una corrección por conteo."
3. Cada fila muestra **Hay** en rojo, con el número negativo, y **Mínimo**.
4. Tocá **Ajustar**. Se abre la pantalla de ajuste con el motivo **Corrección por conteo** ya elegido.
5. Escribí **cuántos hay realmente** en el local (**¿Cuántos contaste?**) y confirmá. Ver [guía 09](09-ajustar-stock.md).

Si no hay productos en negativo, dice "No hay productos con stock negativo. Todo está en orden."

> [!NOTE]
> La lista de stock negativo también muestra los productos **desactivados**, con la etiqueta **Desactivado**. Así no queda ninguno sin corregir: un producto desactivado también se puede ajustar.

## Cómo evitar que aparezcan negativos

- Cargá el **stock inicial** al dar de alta cada producto ([guía 06](06-productos.md)).
- Cuando algo se rompe, se pierde o se consume, hacé el ajuste en el momento ([guía 09](09-ajustar-stock.md)).
- Contá el stock de vez en cuando con una **corrección por conteo**.

## Relación con las compras

Estas listas son la base para saber qué falta comprar. El pedido a proveedores llega con la parte de compras del sistema.
