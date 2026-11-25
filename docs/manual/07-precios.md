# 07. Precios y costos

Para: encargado y dueño. El empleado no ve costos ni precios sugeridos.
Necesitás: un producto cargado ([guía 06](06-productos.md)).

En el menú **Precios** se ve, para cada producto, cuánto cuesta, con qué margen se calcula, cuál sería el precio sugerido y cuál es el precio de venta que tiene hoy.

## Las palabras que tenés que conocer

- **Costo sin IVA (neto)**: lo que pagás por el producto, sin IVA.
- **Costo con IVA (final)**: el costo neto más el IVA del producto. Lo calcula el sistema.
- **Margen**: el porcentaje que se suma al costo para ganar. Con costo de $1.000 y margen de 50 %, la base es $1.500.
- **IVA**: el impuesto del producto (21 %, 10,5 %, 0 % u otro). Cada producto tiene el suyo.
- **Precio sugerido**: el precio que propone el sistema con el costo, el margen y el IVA. Es solo una sugerencia.
- **Precio de venta**: el precio que se cobra, con IVA. Lo decide una persona. **Nunca cambia solo.**
- **Margen real**: cuánto gana de verdad el kiosco con el precio de venta que tiene puesto.

## De dónde sale el margen

El sistema busca el margen en este orden:

1. **Propio del producto**, si tiene uno cargado.
2. **De la subcategoría**, si no tiene propio.
3. **De la categoría**, si la subcategoría tampoco tiene.

En la pantalla dice cuál se usa: "propio del producto", "de la subcategoría" o "de la categoría". Por ejemplo, los Chocolates tienen margen de subcategoría, así que todos los chocolates usan ese margen, salvo que uno tenga su propio margen.

## Cómo se calcula el precio sugerido

Fórmula:

> **Costo sin IVA × (1 + margen) × (1 + IVA)**, y después se redondea **hacia arriba** al múltiplo de $10.

Ejemplo, paso a paso (un chocolate):

1. Costo sin IVA: **$1.000**.
2. Margen de la subcategoría Chocolates: **50 %**. $1.000 × 1,50 = **$1.500**.
3. IVA del producto: **21 %**. $1.500 × 1,21 = **$1.815**.
4. Redondeo hacia arriba a $10: **$1.820**.

El redondeo siempre sube: $1.811 pasa a $1.820, y $1.820 se queda en $1.820. El valor del redondeo se puede cambiar en [Configuración](11-configuracion.md); viene en $10.

> [!NOTE]
> Si el costo es $0 (o no hay costo cargado), el sistema no calcula precio sugerido. Lo mismo pasa con "Varios".

## Cómo se carga el costo

En **Precios**, arriba del todo, elegís cómo cargás el costo:

- **Sin IVA (neto)**: escribís lo que te factura el proveedor, sin IVA.
- **Con IVA (final)**: escribís el costo con IVA y el sistema le saca el IVA del producto para guardar el costo sin IVA.

Debajo, el sistema muestra los dos valores: **Sin IVA** y **Con IVA**.

## Ver y cambiar el precio (encargado o dueño)

1. Entrá al menú **Precios** y buscá el producto por nombre o código de barras. Tocá su nombre.
2. Revisá cada bloque:
   - **Costo**: cargalo como se explicó arriba.
   - **Margen**: dice cuál se usa. Solo el dueño puede escribir un margen propio de este producto. El encargado ve el aviso "Solo el dueño cambia los márgenes."
   - **Precio de venta**: muestra el **Precio actual** y el **Precio sugerido**. Si el sugerido es distinto, aparece el botón **Aplicar el sugerido**. Si ya es igual, dice "Es igual al actual."
3. Para poner un precio a mano, escribilo en **Precio de venta (con IVA)**. Abajo aparece **Margen real con este precio**.
4. Tocá **Guardar cambios**. Aparece "Se guardó. Cada cambio queda registrado en el historial de precios."

> [!NOTE]
> Si cambiás solo el costo o el margen, el precio de venta **no cambia**. Aparece el aviso "Cambiar el costo o el margen no cambia el precio de venta. Si querés que cambie, aplicá el sugerido o escribí uno nuevo."

### Ejemplo: precio a mano y margen real

Un chocolate con costo sin IVA de $1.000 e IVA de 21 %:

- Si el precio es el sugerido, **$1.820**, el margen real es de 50 %, como el margen de la subcategoría.
- Si lo ponés a mano en **$1.900**, el margen real da **57,02 %**. El margen guardado sigue siendo 50 %: el margen real solo muestra cuánto gana con ese precio.

## Qué cambia y qué no

| Si cambiás... | ¿Cambia el precio de venta? | ¿Cambia el precio sugerido? |
|---|:---:|:---:|
| El costo | No | Sí |
| El margen (del producto, de la subcategoría o de la categoría) | No | Sí |
| El IVA del producto | No | Sí |
| El redondeo (en Configuración) | No | Sí |
| El precio de venta a mano | Sí | No: cambia el margen real que se muestra |

Los precios que ya se cobraron no cambian. Solo cambia el precio que se cobra desde el momento en que lo guardás.

## Quién cambia qué

| Qué | Encargado | Dueño |
|---|:---:|:---:|
| Ver el costo, el margen y el precio sugerido | Sí | Sí |
| Cambiar el costo | Sí | Sí |
| Cambiar el precio de venta | Sí | Sí |
| Cambiar el margen de un producto | No | Sí |
| Cambiar el margen de una subcategoría o categoría | No | Sí |

En la lista de **Precios**, el dueño ve la columna **Sugerido** y la etiqueta **Distinto del sugerido** cuando el precio de venta no coincide con el sugerido. El encargado ve solo el precio actual.

## Aviso de venta a pérdida

Se **vende a pérdida** cuando el precio de venta es menor que lo que te cuesta el producto (el costo con IVA), o cuando el margen real da negativo.

Ejemplo: costo sin IVA de $1.000 e IVA de 21 %. El costo con IVA es **$1.210**. Si ponés el precio en **$1.000**, el margen real da **−17,36 %**: por cada venta se pierde plata.

Cuando intentás guardar un precio así (en **Precios** o al dar de alta un producto), aparece la ventana **Estás vendiendo a pérdida**:

- Dice "El precio de venta es menor que lo que te cuesta el producto."
- Muestra el **precio de venta**, el **costo con IVA** y el **margen real**.
- Tenés dos botones:
  - **Revisar precio**: vuelve al formulario para corregirlo. **No se guarda nada.** Es la opción que queda marcada al abrir la ventana.
  - **Vender igual a pérdida**: guarda el precio. Usalo solo si es a propósito.

> [!NOTE]
> El aviso no aparece si el costo es $0, si el producto es "Varios", ni si cambiás solo el margen.

## Varios

El producto **"Varios"** no tiene costo ni precio guardado. En **Precios** aparece el aviso: "'Varios' no tiene costo ni precio guardado: el precio se escribe en cada venta."
