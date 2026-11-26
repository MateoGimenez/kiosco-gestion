# 27. Anular una compra

Para: **encargado y dueño**. El empleado no puede anular compras.
Necesitás: el motivo de la anulación. No hace falta tener la caja abierta: la anulación no toca la caja.

Una compra mal cargada **no se edita**. Se **anula** y, si hace falta, se vuelve a cargar bien. Por ejemplo: cargaste 10 cajas en vez de 2, o el proveedor te dijo que la factura era de otra fecha.

Se puede anular desde el local o desde afuera.

## Cómo se anula

1. Entrá a **Compras** en el menú de arriba.
2. Buscá la compra (podés filtrar por proveedor, fechas o número de comprobante) y tocá **Ver**.
3. Tocá **Anular la compra**.
4. Aparece la ventana **"Anular la compra"**, que dice:
   - "El stock baja lo que había sumado la compra y la deuda baja su total."
   - "Los costos y precios **no** vuelven atrás."
5. Escribí el **Motivo** (obligatorio, hasta 200 caracteres). Por ejemplo: `Cargué mal las cantidades`.
6. Tocá **Anular la compra** para confirmar.

Después de anularla, la compra aparece con la etiqueta **Anulada** y un aviso con la fecha, quién la anuló y el motivo. El aviso también dice cuál es el saldo con el proveedor.

Si la compra ya está anulada, el botón no aparece.

## Qué pasa con el stock, la deuda y los costos

| Qué | Qué pasa |
|---|---|
| **Stock** | Baja lo que había sumado la compra. Por ejemplo, si la compra sumó 24 gaseosas, baja 24. |
| **Stock negativo** | Puede quedar en negativo si ya vendiste parte de esa mercadería. No es un error: el sistema lo avisa, y ese producto aparece en **Para reponer** ([guía 10](10-para-reponer-y-stock-negativo.md)). |
| **Deuda** | Baja por el total de la compra. |
| **Costo y precio** | **No vuelven atrás.** Quedan como los dejó la compra anulada. Si estaban mal, corregilos en **Precios**. |
| **Pagos** | **No se deshacen.** Ver abajo. |
| **Caja** | No cambia. |
| **Fotos** | Quedan con la compra anulada, como respaldo. |

## Si la compra ya estaba pagada

Los pagos no se anulan. Si pagaste la compra al cargarla, o le pagaste al proveedor después, esos pagos quedan registrados. Entonces el saldo con el proveedor puede quedar **a favor del kiosco** hasta que cargues la compra corregida.

Ejemplo: la deuda con Distribuidora Sur es de $ 25.300. Anulás una compra de $ 40.300. El saldo baja a **−$ 15.000**: el proveedor te debe $ 15.000 (esa plata ya la pagaste). Cuando cargues de nuevo la compra bien, por $ 40.300, el saldo vuelve a $ 25.300.

> [!WARNING]
> Si el pago fue con **efectivo de la caja**, la salida de plata **no vuelve sola** a la caja. La caja no se toca al anular. Si el proveedor te devuelve esa plata en efectivo, anotala en la caja abierta como **ingreso** con motivo **Otro**, desde el local ([guía 21](21-gastos-retiros-y-aportes.md)). Si hay que corregir el saldo de la cuenta, lo hace el dueño con una **corrección** ([guía 28](28-cuenta-corriente-y-pagos.md)).

## Después de anular

1. Si la compra estaba mal, **cargala de nuevo** con los datos correctos ([guía 25](25-cargar-una-compra.md)).
2. Si quedó stock negativo, revisalo en **Para reponer** ([guía 10](10-para-reponer-y-stock-negativo.md)).
3. Si el costo de algún producto quedó mal, corregilo en **Precios** ([guía 07](07-precios.md)).

## Qué no se puede hacer

- No se puede **editar** una compra cargada. Para cambiar algo, se anula y se carga de nuevo.
- No se puede **volver a activar** una compra anulada.
