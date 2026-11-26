# 19. Medios de pago (recargo del crédito y activar o desactivar)

Para: **dueño**, en el menú **Configuración**.
Necesitás: entrar como dueño. Los demás roles ven los medios de pago al cobrar, pero no los pueden cambiar.

Los medios de pago son los que aparecen en el cobro: **Efectivo**, **Débito**, **Crédito**, **QR Mercado Pago** y **Transferencia**. No se pueden agregar, borrar ni renombrar desde la pantalla.

## Dónde está

1. Entrá a **Configuración** en el menú de arriba.
2. Bajá hasta la sección **Medios de pago**.

En cada medio aparece el nombre, una etiqueta **Activo** o **Desactivado**, y los botones para cambiarlo.

## Cambiar el recargo del crédito

El recargo solo se aplica al **Crédito**. Los demás medios no tienen recargo (la pantalla dice "Sin recargo").

1. En la fila de **Crédito**, en **Recargo (%)**, escribí el nuevo porcentaje. Por ejemplo: `10`. Podés usar coma: `12,5`.
2. Tocá **Guardar recargo**. Aparece **"Se guardó el recargo."**

Reglas:

- El recargo tiene que estar entre **0 y 100 %**.
- Si dejás el campo vacío, aparece: **"Escribí el recargo. Con 0 no se cobra recargo."**
- **Las ventas ya hechas no cambian.** Cada venta guarda el porcentaje que tenía al cobrarse.
- **Un carrito armado con el porcentaje anterior** no se puede cobrar tal cual: al cobrar aparece **"El total cambió"** y hay que confirmar ([guía 16](16-cobrar.md)).

> [!NOTE]
> El porcentaje inicial del sistema es **10 %**. Lo que corresponde a su negocio se define en la instalación.

## Activar o desactivar un medio

1. En la fila del medio, tocá **Desactivar** (si está activo) o **Activar** (si está desactivado).
2. La etiqueta cambia a **Desactivado** o **Activo**.

Efectos:

- Un medio **desactivado no aparece** en la lista de **Resto con:**.
- Las ventas viejas que lo usaron **siguen mostrándolo** en su detalle.
- El servidor no acepta cobrar con un medio desactivado: si se intenta, el cobro no se guarda.

Los medios que se pueden desactivar son **Débito**, **Crédito**, **QR Mercado Pago** y **Transferencia**.

> [!IMPORTANT]
> **El Efectivo nunca se desactiva.** Aparece como **"Siempre activo"**. Siempre tiene que haber una forma de cobrar en efectivo y de calcular el vuelto.

## Cambiar el orden

Los botones **Subir** y **Bajar** cambian el orden en que aparecen los medios en el cobro. Es solo una cuestión de comodidad: no cambia ningún cálculo.

Para subir un medio, tocá **Subir** en su fila. Se intercambia con el de arriba.

## Quién puede hacer qué

| Qué | Empleado | Encargado | Dueño |
|---|:---:|:---:|:---:|
| Ver los medios de pago y su recargo | Sí | Sí | Sí |
| Cambiar el recargo del crédito | No | No | Sí |
| Activar o desactivar un medio | No | No | Sí |
| Cambiar el orden | No | No | Sí |

Cada cambio queda registrado en la auditoría del sistema, con quién lo hizo y cuándo.
