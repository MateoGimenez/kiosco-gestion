# 08. Categorías y subcategorías

Para: encargado y dueño. El empleado no ve este menú.
Necesitás: entrar al sistema ([guía 01](01-entrar-al-sistema.md)).

Cada producto tiene **una categoría** y **una subcategoría**. La categoría es el rubro grande y la subcategoría es un poco más fina dentro de ese rubro.

Ejemplo:

> **Golosinas** (categoría) → **Chocolates** (subcategoría) → **Chocolate con leche tableta 100 g** (producto)

El kiosco ya viene con estas categorías de ejemplo: Bebidas, Golosinas, Cigarrillos, Almacén, Lácteos, Fiambrería, Limpieza, Diarios y revistas, y **Varios**.

## Quién hace qué

| Qué | Encargado | Dueño |
|---|:---:|:---:|
| Crear una categoría | Sí, con su margen inicial | Sí |
| Crear una subcategoría | Sí, sin margen propio | Sí, con margen propio si quiere |
| Cambiar el nombre de una categoría o subcategoría | Sí | Sí |
| Cambiar el margen de una categoría | No | Sí |
| Cambiar el margen de una subcategoría | No | Sí |
| Desactivar y reactivar | Sí | Sí |

> [!NOTE]
> El **margen** es el número que se usa para calcular el precio sugerido ([guía 07](07-precios.md)). Solo el dueño lo cambia. La única excepción es el margen **inicial** de una categoría nueva: lo pone quien la crea, también el encargado. Después, solo el dueño lo puede cambiar.

## Crear una categoría

1. Entrá al menú **Categorías** y tocá **Nueva categoría**.
2. Escribí el **Nombre** (hasta 60 caracteres).
3. Escribí el **Margen inicial (%)**. Es obligatorio. Por ejemplo, `40`.
   - Si sos encargado, el campo dice: "Después solo el dueño lo puede cambiar."
4. Tocá **Crear categoría**. Aparece el aviso "Se creó la categoría ...".

Dos categorías no pueden tener el mismo nombre, aunque cambien las mayúsculas.

## Crear una subcategoría

1. En la categoría donde va, tocá **Agregar subcategoría a [nombre de la categoría]**.
2. Escribí el **Nombre** (hasta 60 caracteres).
3. Solo el dueño ve el campo **Margen propio (%)**. Si lo deja vacío, la subcategoría usa el margen de la categoría.
   - Si sos encargado, el aviso dice: "Usa el margen de la categoría (...). Solo el dueño cambia los márgenes."
4. Tocá **Crear subcategoría**.

> [!NOTE]
> Una subcategoría **no se puede pasar a otra categoría**. Para reorganizar, creá la subcategoría nueva en la categoría correcta y después cambiá la categoría y la subcategoría de cada producto (**Productos**, ficha, **Editar datos**).

## Cambiar un margen (solo dueño)

- **De una categoría**: tocá **Editar** en la categoría y cambiá **Margen (%)**. El aviso dice: "Cambiarlo no cambia los precios guardados, solo el precio sugerido."
- **De una subcategoría**: tocá **Editar** en la subcategoría y cambiá **Margen propio (%)**. Si lo dejás vacío, vuelve a usar el margen de la categoría.

Cambiar un margen no cambia ningún precio de venta. Cambia el precio **sugerido** de los productos que usan ese margen.

## Desactivar una categoría o una subcategoría

Se desactiva cuando ya no se usa, pero no se borra: su historial queda.

1. Tocá **Desactivar** en la categoría o subcategoría.
2. Aparece la pregunta **¿Desactivar la categoría [nombre]?** con el texto "Deja de aparecer al cargar productos nuevos. Lo podés reactivar cuando quieras."
3. Tocá **Desactivar** para confirmar.

Después de desactivarla, deja de aparecer en los desplegables para cargar o editar productos.

### Por qué no se puede desactivar con productos activos

Una categoría (o subcategoría) **no se desactiva si tiene productos activos** adentro. Aparece el aviso:

> Tiene **N productos activos**. Movelos a otra categoría o desactivalos primero.

Así nunca queda un producto a la venta dentro de una categoría apagada. Para resolverlo:

1. Tocá **Ver esos productos**. Se abre la lista de **Productos** filtrada por esa categoría.
2. Mové cada producto a otra categoría o subcategoría (**Editar datos**), o desactivalo ([guía 06](06-productos.md)).
3. Volvé a **Categorías** y desactivá la categoría o subcategoría.

> [!NOTE]
> La categoría **"Varios"** y su subcategoría **"Varios"** no se pueden desactivar. El botón aparece apagado, con la nota "Esta categoría es la de 'Varios': no se desactiva." El producto "Varios" tiene que estar siempre disponible para vender.

## Reactivar una categoría o subcategoría

1. Buscá la categoría o subcategoría desactivada. Aparece con la etiqueta **Desactivada**.
2. Tocá **Reactivar**. Aparece el aviso con el nombre.

Una subcategoría **no se reactiva mientras su categoría esté desactivada**. Primero reactivá la categoría.
