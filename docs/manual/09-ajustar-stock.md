# 09. Ajustar stock

Para: encargado y dueño.
Necesitás: estar en el local, con la PC del mostrador o una tablet conectada al WiFi del local.

El **stock** es la cantidad que hay de un producto. Cuando vende, el sistema lo baja solo. Cuando algo cambia fuera de una venta (se rompió, se perdió, se contó otra cantidad), lo cambiás con un **ajuste**.

> [!IMPORTANT]
> El stock **no se cambia** editando el producto. Siempre se cambia con un ajuste, para que quede registrado **qué pasó, quién lo hizo y cuándo**.

> [!NOTE]
> **Solo desde el local.** El ajuste de stock no se puede hacer desde afuera del local (por ejemplo, desde el celular con Tailscale, cuando esté activo). Si lo intentás desde afuera, aparece el aviso "Esto solo se puede hacer desde el local. Conectate al WiFi del local y probá de nuevo."

## Cómo se hace un ajuste

1. Buscá el producto en **Productos** y abrí su ficha. Tocá **Ajustar stock**.
   - También podés llegar desde **Para reponer** o **Stock negativo**, con el botón **Ajustar** de cada fila ([guía 10](10-para-reponer-y-stock-negativo.md)).
   - El título de la pantalla es **Ajustar stock** y debajo dice el nombre del producto y **Hay ahora** cuánto hay.
2. En **1. ¿Por qué cambia el stock?**, elegí el motivo (ver la tabla de abajo).
3. En **2. ¿Cuánto?**, escribí la cantidad. El campo cambia de nombre según el motivo:
   - **Cantidad a restar**
   - **Cantidad a sumar**
   - **¿Cuántos contaste?** (solo en la corrección por conteo)
4. Mirá el cuadro de la derecha, que dice **Va a quedar** y cuánto va a quedar el stock.
5. Si el motivo es **Otro**, escribí la **nota** (obligatoria). En los demás motivos la nota es opcional.
6. Tocá **Revisar ajuste**. Aparece la pregunta **¿Confirmás el ajuste?** con el resumen: motivo, cuánto hay ahora, cuánto se resta o se suma y cuánto va a quedar.
7. Tocá **Confirmar ajuste**. Vuelve a la ficha con el aviso "Stock ajustado. Ahora hay ...".

Para no confirmar algo sin querer, el sistema no guarda nada hasta que tocás **Confirmar ajuste**. Si querés cancelar, tocá **Cancelar** al final de la pantalla, o **Cancelar** en la pregunta de confirmación.

## Los motivos

| Motivo | Qué hace con el stock | Qué escribís |
|---|---|---|
| **Rotura** | **Resta** | Cuánto se rompió, sin signo. |
| **Faltante (robo o pérdida)** | **Resta** | Cuánto falta, sin signo. |
| **Consumo propio** | **Resta** | Cuánto se llevó o consumió el personal o el dueño, sin signo. |
| **Corrección por conteo** | Pone el stock en lo que contaste. El sistema calcula la diferencia | Cuántos contaste (todo lo que hay en el local). |
| **Carga inicial** | **Suma** | Cuánto hay hoy, al empezar a usar el sistema. |
| **Otro (con nota)** | Podés **sumar** o **restar** | Elegí **Restar** o **Sumar**, escribí la cantidad y la **nota** con lo que pasó. |

En los motivos de rotura, faltante y consumo propio, **escribís el número sin signo**: el sistema sabe que tiene que restar. Si escribís un número negativo, aparece el aviso "Escribí el número sin signo: el sistema sabe si suma o resta."

> [!NOTE]
> Un ajuste **puede dejar el stock en negativo**. No es un error, y se puede corregir después con una corrección por conteo ([guía 10](10-para-reponer-y-stock-negativo.md)).

## Corrección por conteo

Se usa cuando contaste lo que hay en el local y no coincide con lo que dice el sistema.

Ejemplo: el sistema dice que hay **22** alfajores de dulce de leche, pero contás **19**.

1. En el motivo, elegí **Corrección por conteo**.
2. En **¿Cuántos contaste?**, escribí **19**.
3. El cuadro dice: **Resta 3** y **Va a quedar 19**.
4. Escribí la nota si querés (por ejemplo, "Conteo de fin de mes") y tocá **Revisar ajuste** y **Confirmar ajuste**.

En el historial queda un movimiento de **-3** con la nota, y el stock queda en **19**.

> [!TIP]
> Escribí **lo que hay**, no la diferencia. El sistema calcula la diferencia solo.

> [!WARNING]
> El sistema toma el stock **del momento en que guardás**. Si durante el conteo se vende algo, la diferencia sale corrida en esa venta. Conviene contar y guardar enseguida, o contar con el kiosco tranquilo.

Si lo que contaste es igual a lo que dice el sistema, aparece "Lo contado es igual al stock actual: no hay nada que corregir." No se guarda nada.

## Ejemplos

| Qué pasó | Motivo | Qué escribís | Resultado |
|---|---|---|---|
| Hay 24 y se rompen 2 del exhibidor | Rotura | 2 | Resta 2, queda 22 |
| Hay 22 en el sistema y contás 19 | Corrección por conteo | 19 | Resta 3, queda 19 |
| Producto nuevo: hay 12 en el local | Carga inicial | 12 | Suma 12, queda 12 |
| Encontrás 3 que no estaban registrados | Otro | 3, elegís **Sumar**, nota "Encontrados al contar" | Suma 3 |
| Se llevan 0,350 kg de jamón (por peso) | Consumo propio | 0,350 | Resta 0,350 kg |

## Cantidades según el producto

- **Por unidad**: solo números enteros. Si escribís `2,5`, aparece "Este producto se vende por unidad: usá números enteros."
- **Por kg**: podés usar hasta 3 decimales, por ejemplo `0,350`. Ver [guía 12](12-escribir-numeros.md).

## Productos desactivados y "Varios"

- Un producto **desactivado** sí se puede ajustar. Por ejemplo, para corregir un stock negativo.
- El producto **"Varios"** no lleva stock. No tiene el botón **Ajustar stock**.

## Historial de movimientos

Cada ajuste queda registrado. Para verlo, en la ficha del producto tocá **Ver movimientos**. Cada fila muestra:

- Fecha y hora, y el nombre de quien lo hizo.
- El tipo de movimiento, por ejemplo **Ajuste: Rotura**, y la nota si la tiene.
- La cantidad, con signo: **-2** si restó, **+12** si sumó.
- **Quedó en**: cuánto hay después del movimiento.
- Solo el dueño ve además el **costo sin IVA** de ese movimiento.

Los movimientos de **ventas** y **compras** aparecen acá cuando esas partes del sistema estén terminadas.
