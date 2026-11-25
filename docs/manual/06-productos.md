# 06. Productos

Para: todo el personal (con lo que se indica para cada rol).
Necesitás: entrar al sistema ([guía 01](01-entrar-al-sistema.md)).

En el menú **Productos** están todos los artículos del kiosco: los que vendés, los que están desactivados y el producto especial **"Varios"**.

## Qué ve cada rol

| Qué podés hacer | Empleado | Encargado | Dueño |
|---|:---:|:---:|:---:|
| Buscar, ver la lista y la ficha de un producto | Sí | Sí | Sí |
| Ver el costo y el margen | No | No (los ve en **Precios**) | Sí |
| Dar de alta un producto (**Nuevo producto**) | No | Sí | Sí |
| Editar los datos de un producto | No | Sí | Sí |
| Desactivar y reactivar un producto | No | Sí | Sí |
| Ajustar el stock | No | Sí | Sí |

> [!NOTE]
> El **empleado no ve costos**, ni márgenes, ni el precio sugerido. Sí ve el precio de venta, el IVA, el stock y el mínimo, porque los necesita para vender.
>
> El encargado pone el costo al dar de alta un producto y en la pantalla **Precios**. En la ficha, el costo solo lo ve el dueño.

## Buscar un producto

1. Entrá al menú **Productos**. El cursor ya queda en el buscador, que dice **Buscar por código de barras o nombre**.
2. **Con el lector de código de barras:** pasá el producto por el lector. Si tiene código, el lector escribe el número y aprieta Enter, y el sistema abre directo la ficha de ese producto.
3. **Por nombre:** escribí una parte del nombre, por ejemplo `cola`. La lista se va actualizando sola mientras escribís. No hace falta tener en cuenta los acentos: `cafe` encuentra "Café".
4. Si querés, filtrá con estos desplegables:
   - **Categoría** y **Subcategoría**. Para elegir una subcategoría, primero elegí la categoría.
   - **Estado**: **Solo activos** (es el que aparece al entrar), **Solo desactivados** o **Todos**.
5. Si el código no existe en el sistema, aparece el aviso "No hay ningún producto con el código ...". El encargado y el dueño ven el enlace **Crear un producto con este código**.

> [!TIP]
> Los productos sin código de barras (por ejemplo, el jamón por kilo o el pan) se buscan por nombre.

### Cómo se lee la lista

Cada fila muestra el nombre, la categoría y la subcategoría, el precio de venta, el stock y una etiqueta si hace falta:

- **Desactivado**: el producto no se vende hasta que se reactive.
- **Stock negativo**: se vendió más de lo que había cargado. Ver [guía 10](10-para-reponer-y-stock-negativo.md).
- **Para reponer**: el stock está en el mínimo o por debajo.

El producto **"Varios"** aparece con el precio **A mano** (el precio se escribe al vender) y sin stock.

Si no hay productos para mostrar, aparece "No hay productos que coincidan con la búsqueda." Probá con otro nombre o quitá los filtros.

## Ver la ficha de un producto

Tocá el nombre de un producto en la lista. La ficha muestra:

- **Venta**: precio de venta, IVA, si se vende **Por unidad** o **Por kg**, código de barras (o **Sin código**) y categoría.
- **Stock**: **Hay ahora**, **Mínimo** y **Unidades por bulto** (o **Sin dato**).
- **Costo y margen**: solo para el dueño.
- **Precios**: enlace **Ir a precios** para el encargado y el dueño.

Desde la ficha, el encargado y el dueño tienen los botones **Editar datos**, **Ajustar stock** y **Ver movimientos**. Para el empleado, esos botones no aparecen.

## Dar de alta un producto (encargado o dueño)

1. Tocá **Nuevo producto**.
2. Completá **Datos del producto**:
   - **Nombre**: por ejemplo "Chocolate Águila 100 g". Dos productos pueden tener el mismo nombre; lo que tiene que ser único es el código de barras.
   - **Código de barras (opcional)**: pasá el lector o escribilo. Si lo dejás vacío, el producto no tiene código. No puede tener espacios.
   - **Se vende**: **Por unidad** o **Por kg**.
   - **IVA**: el IVA del producto. Viene de fábrica en 21 %.
   - **Categoría** y **Subcategoría**.
3. Completá **Stock**:
   - **Stock mínimo**: por debajo de este número, el producto aparece en **Para reponer**.
   - **Unidades por bulto (opcional)**: sirve para sugerir cuánto pedir.
   - **Stock inicial (opcional)**: lo que hay hoy en el local. Queda registrado como "carga inicial".
4. Completá **Costo y precio**:
   - **Costo sin IVA**: lo que pagás por unidad, sin el IVA.
   - **Margen propio (opcional)**: solo lo ve el dueño. Si queda vacío, se usa el margen de la subcategoría o de la categoría. El encargado ve el margen que se va a usar, pero no lo cambia.
   - El cuadro **Precio sugerido** se calcula solo mientras escribís. Ver [guía 07](07-precios.md).
   - **Precio de venta (con IVA)**: viene con el sugerido, pero lo confirmás vos. Si lo cambiás, aparece **Margen real con este precio**. Si querés volver al sugerido, tocá **Usar el sugerido**.
5. Tocá **Crear producto**. Aparece el aviso "Producto creado."

> [!WARNING]
> Si el precio de venta queda por debajo del costo, el sistema avisa que estás **vendiendo a pérdida** y te pide confirmar. Ver la sección "Aviso de venta a pérdida" de la [guía 07](07-precios.md).

> [!NOTE]
> Si el código de barras ya pertenece a otro producto, aparece "Ese código de barras ya es de otro producto." Revisá el código o buscá el producto que ya lo tiene.

> [!NOTE]
> Un producto sin costo cargado no tiene precio sugerido. Cargá el costo para verlo.

## Editar un producto (encargado o dueño)

1. Entrá a la ficha y tocá **Editar datos**.
2. Podés cambiar el nombre, el código de barras, si se vende por unidad o por kg, el IVA, la categoría y la subcategoría, el stock mínimo y las unidades por bulto.
3. Lo que **no** se cambia acá:
   - **El stock**: se cambia con **Ajustar stock**, para que quede registrado qué pasó. Ver [guía 09](09-ajustar-stock.md).
   - **El costo y el precio de venta**: se cambian en **Precios** ([guía 07](07-precios.md)).
   - **El margen**: lo cambia el dueño, en **Precios**.
4. Tocá **Guardar cambios**. Aparece "Cambios guardados."

Cosas para tener en cuenta:

- **Cambiar el IVA no cambia el precio de venta ni el costo guardado.** Sí cambian el precio sugerido y el margen real que se muestran.
- **Cambiar la subcategoría** puede cambiar el margen que se usa y, con eso, el precio sugerido. El precio de venta no cambia solo.
- **Pasar a "Por unidad"** un producto que tiene stock, mínimo o unidades por bulto con decimales (por ejemplo, 2,5) no se puede. Primero corregí el stock con un ajuste.
- **"Varios"** solo permite cambiar el nombre y el IVA.

## Desactivar un producto (encargado o dueño)

Se desactiva cuando dejás de vender un producto, pero querés conservar su historial.

1. Entrá a la ficha y tocá **Desactivar producto**.
2. Aparece la pregunta **¿Desactivar [nombre del producto]?** con el texto "Deja de aparecer para vender. Su historial se conserva y lo podés reactivar cuando quieras."
3. Tocá **Desactivar** para confirmar, o **Cancelar** para volver atrás.

Qué pasa después:

- El producto **no aparece** al vender ni en la búsqueda del mostrador.
- Si tenía stock, **el stock queda como está**, y lo podés seguir ajustando. El aviso lo dice con el número de stock.
- Aparece el aviso "Se desactivó el producto." y, en la lista, la etiqueta **Desactivado**.
- El producto **"Varios"** no se desactiva: no tiene el botón.

## Reactivar un producto (encargado o dueño)

1. En **Productos**, elegí **Estado: Solo desactivados** (o **Todos**) y abrí el producto.
2. Tocá **Reactivar producto**. No pide confirmación.
3. Aparece el aviso "Se reactivó el producto." y vuelve a aparecer al vender.

> [!WARNING]
> Un producto no se puede reactivar si su **subcategoría** o su **categoría** están desactivadas. Aparece el aviso "La categoría o la subcategoría están desactivadas. Elegí otra o reactivalas." Primero reactivá la categoría y la subcategoría ([guía 08](08-categorias-y-subcategorias.md)).

Un código de barras de un producto desactivado sigue siendo de ese producto: no se puede usar para otro.
