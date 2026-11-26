# 29. Pedido sugerido

Para: **encargado y dueño**.
Necesitás: que los productos tengan cargado el **proveedor habitual** ([guía 24](24-proveedores.md)) y un **mínimo** de stock ([guía 06](06-productos.md)). Para enviarlo por WhatsApp: el celular con internet y el proveedor con su teléfono cargado.

El **pedido sugerido** arma, para un proveedor, la lista de lo que hay que reponer y el mensaje para mandarle. El sistema **no envía nada**: vos copiás el mensaje o abrís WhatsApp, y lo mandás vos. Tampoco guarda el pedido: cada vez que entrás, se arma con el stock de ese momento.

## Qué productos aparecen

Aparecen los productos que cumplen **las dos** condiciones:

- Tienen a ese proveedor como **proveedor habitual**.
- Su **stock** está **igual o por debajo del mínimo**. También aparecen los que tienen stock cero o negativo.

Es la misma regla que **Para reponer** ([guía 10](10-para-reponer-y-stock-negativo.md)), pero filtrada por proveedor. Los productos desactivados no aparecen.

## Cuánto se sugiere

La cantidad sugerida es **lo que falta para llegar al mínimo**. Si el stock ya es igual al mínimo, el sistema sugiere **1**, para que el pedido no quede vacío.

| Stock | Mínimo | Se sugiere | Por qué |
|---|---|---|---|
| 3 | 10 | **7** | Faltan 7 para llegar al mínimo. |
| 10 | 10 | **1** | Está justo en el mínimo: se sugiere 1. |
| −2 | 10 | **12** | Está en negativo: hay que sumar 12 para llegar a 10. |
| 0,750 kg | 2 kg | **1,250 kg** | Faltan 1,250 kg. |

Las cantidades se pueden cambiar (ver abajo). El sistema no agrega productos que no estén en la lista.

## Paso a paso

1. Entrá a **Proveedores** y tocá el proveedor.
2. Tocá **Pedido sugerido**.
3. Aparece la lista **Pedido sugerido para ...**, con cada producto:
   - **Hay · Mínimo**: el stock que hay y el mínimo.
   - **Pedir**: la cantidad sugerida. Es un campo que podés cambiar.
4. Cambiá las cantidades si hace falta:
   - Escribí la cantidad que vas a pedir. Para sacar un producto del pedido, poné **0**.
   - Los productos por peso se piden en kilos, con coma (`1,250`).
   - Si escribís algo que no se entiende, el sistema marca la cantidad y no deja copiar ni enviar hasta corregirla.
5. Mirá el **Mensaje**. Se arma solo, con las cantidades que ves en pantalla. No se escribe a mano: para cambiarlo, cambiá las cantidades.
6. Elegí cómo mandarlo:
   - **Copiar**: copia el mensaje. Después lo pegás en WhatsApp, en un mail o donde quieras. Aparece "Copiado. Ya lo podés pegar donde quieras."
   - **Abrir WhatsApp**: abre WhatsApp con el mensaje ya escrito, para el teléfono del proveedor. Vos lo revisás y lo enviás.

> [!NOTE]
> Si el equipo no deja copiar con el botón (pasa en algunas tablets), el sistema deja el mensaje seleccionado. Copialo con el menú del celular o con **Ctrl + C**.

## Ejemplo de mensaje

Con el proveedor Distribuidora Sur, el mensaje queda así:

```
Hola, Distribuidora Sur. Pedido de Kiosco La Esquina:
- 7 x Coca-Cola 500 ml
- 1 x Alfajor Jorgito
- 1,25 kg x Queso de máquina
Gracias.
```

El mensaje **no tiene precios**. Solo dice qué y cuánto pedís. Las líneas con 0 no aparecen.

## Casos especiales

| Situación | Qué pasa |
|---|---|
| **No hay nada para reponer** | Aparece "No hay nada para reponer de este proveedor." Si esperabas ver productos, revisá que tengan a ese proveedor como habitual ([guía 24](24-proveedores.md)). |
| **No tiene teléfono** | Se puede copiar el mensaje, pero **Abrir WhatsApp** no aparece. Aviso: "Este proveedor no tiene teléfono." Tocá **Cargá el teléfono** para completarlo. |
| **Proveedor desactivado** | Aparece el aviso "Este proveedor está desactivado. El pedido es solo para ver." Se puede ver, pero no es para mandar. |
| **Más de 500 productos** | Se muestran los primeros 500 y aparece un aviso. Es muy raro: en ese caso, armá el resto en otro pedido. |
| **El mensaje es muy largo** | Un mensaje con muchísimas líneas puede no abrirse bien con **Abrir WhatsApp**. En ese caso, usá **Copiar** y pegalo en WhatsApp. |

## Después de mandar el pedido

El pedido no queda guardado en el sistema. Cuando llegue la mercadería, cargá la factura como una compra ([guía 25](25-cargar-una-compra.md)): el stock sube y la cuenta con el proveedor se actualiza.
