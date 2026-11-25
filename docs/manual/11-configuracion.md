# 11. Configuración

Para: dueño.
Necesitás: estar logueado como dueño. El menú **Configuración** no aparece para el encargado ni para el empleado.

En **Configuración** se cambian tres cosas del negocio: el nombre, el redondeo de precios y la hora de corte del día.

## Cambiar la configuración

1. Entrá al menú **Configuración**.
2. Cambiá lo que necesites:
   - **Nombre del negocio**: aparece en los encabezados de reportes y pedidos. Hasta 80 caracteres.
   - **Redondeo de precios ($)**: ver la sección siguiente.
   - **Hora de corte del día de trabajo**: ver la sección siguiente.
3. El botón dice **Sin cambios para guardar** mientras no toques nada. Cuando cambiás algo, dice **Guardar configuración**.
4. Tocá **Guardar configuración**. Aparece el aviso "Se guardó la configuración."

Abajo se ve la última modificación: fecha, hora y el nombre de quien la hizo.

## Redondeo de precios

El **precio sugerido** siempre se redondea **hacia arriba** al múltiplo de este número.

- Con **10** (valor que viene de fábrica): $1.432 pasa a **$1.440**. Y $1.440 se queda en $1.440.
- Con **50**: $1.432 pasa a **$1.450**.
- Con **0**: no se redondea. El sugerido sale con los centavos del cálculo.

El máximo que acepta el sistema es $10.000.

> [!IMPORTANT]
> Cambiar el redondeo **no cambia los precios que ya están guardados**. Solo cambia el precio sugerido de ahí en adelante. Cada precio de venta lo decide una persona ([guía 07](07-precios.md)).

## Hora de corte del día de trabajo

El kiosco trabaja con turnos, y el turno de la noche pasa la medianoche. Por eso los reportes y la caja no usan el día del calendario, sino el **día de trabajo**.

La **hora de corte** es la hora en la que termina un día de trabajo. Lo que se vende **antes** de esa hora cuenta para el día anterior.

Ejemplo: con la hora de corte en **06:00**, una venta a las **02:30** del martes cuenta para el **lunes**.

Qué tener en cuenta:

- Elegí una hora en la que el kiosco esté **cerrado**.
- Cambiar la hora **no mueve** los registros que ya existen.
- **Solo se puede cambiar desde el local.** Si intentás cambiarla desde afuera (cuando esté activo el acceso remoto, etapa 9), el sistema no la guarda. El nombre del negocio y el redondeo sí se pueden cambiar desde afuera.

> [!NOTE]
> Si la hora de corte no tiene efecto en los reportes todavía, es porque los reportes llegan en una etapa posterior. El valor queda guardado y se usa desde que existan la caja y las ventas.
