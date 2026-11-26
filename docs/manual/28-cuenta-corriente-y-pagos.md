# 28. Cuenta corriente y pagos a proveedores

Para: **encargado y dueño**. Registrar pagos lo hacen el encargado y el dueño. **Cargar el saldo inicial** y **corregir la cuenta** los hace **solo el dueño**.
Necesitás: entrar a la ficha del proveedor ([guía 24](24-proveedores.md)). Para pagar con **efectivo de la caja**: estar en el local, con la caja abierta ([guía 13](13-abrir-la-caja.md)).

Cada proveedor tiene una **cuenta corriente**: es la historia de lo que le compraste, lo que le pagaste y lo que le debés.

## Ver la cuenta

1. Entrá a **Proveedores** y tocá el nombre del proveedor.
2. Arriba aparece el **saldo**:
   - **Le debemos** $ X (en rojo): el kiosco le debe esa plata.
   - **A favor del kiosco** $ X: el proveedor nos debe, o le pagamos de más.
   - **Sin deuda**: está en cero.
3. Abajo están los **Movimientos**, del más nuevo al más viejo. Cada uno muestra:
   - el tipo: **Saldo inicial**, **Compra**, **Compra anulada**, **Pago** o **Corrección**,
   - la fecha, de qué origen salió la plata (si es un pago), la referencia y quién lo cargó,
   - el **importe** (con signo) y el **saldo** que quedó después de ese movimiento.

Lo que sube la deuda: una **compra** y una **corrección** que sube la deuda.
Lo que la baja: un **pago**, una **compra anulada** y una **corrección** que la baja.

Si el saldo no cuadra con lo que esperabas, revisá los movimientos uno por uno. Si un movimiento es de una compra, el número de comprobante es un link a esa compra.

## Registrar un pago

1. En la ficha del proveedor, tocá **Registrar un pago**.
2. Completá:
   - **Monto pagado**: cuánto pagaste. Si le debés, el sistema lo carga con el total de la deuda, pero podés poner una parte: el resto queda como deuda.
   - **De dónde sale la plata**: elegí una de las cuatro opciones (ver la tabla de abajo).
   - **Referencia** (opcional). Por ejemplo, el número de la transferencia: `Op. 778812`.
3. Tocá **Registrar pago**.

Aparece "Pago registrado. Saldo con ...", con el saldo que queda.

### Los cuatro orígenes del pago

| De dónde sale la plata | Qué significa | ¿Resta del arqueo de la caja? | ¿Se puede desde afuera del local? |
|---|---|---|---|
| **Efectivo de la caja** | Sale del cajón del mostrador. | **Sí.** Aparece en la caja abierta como "Pago a proveedor". | **No**, solo desde el local. |
| **Efectivo de afuera de la caja** | Plata que no sale del cajón (por ejemplo, de tu billetera). | No | Sí |
| **Transferencia** | Pagado por transferencia bancaria. | No | Sí |
| **Otro (cheque, Mercado Pago…)** | Cualquier otro medio. Explicalo en la referencia. | No | Sí |

**Solo el efectivo de la caja** se descuenta de lo que debería haber en el cajón (el arqueo, [guía 22](22-arqueo-y-diferencias.md)). Los otros tres bajan la deuda con el proveedor, pero no tocan la caja.

Ejemplo: en la caja hay $ 20.000 esperados. Pagás $ 5.000 a un proveedor con **efectivo de la caja**: el esperado baja a $ 15.000 y el pago aparece en la caja como "Pago a proveedor". Si el mismo pago es por transferencia, la caja no cambia.

### Efectivo de la caja

- Necesita una **caja abierta**. Si no hay ninguna, aparece "No hay ninguna caja abierta. Abrí la caja para seguir." Abrila desde **Vender** ([guía 13](13-abrir-la-caja.md)) y volvé a registrar el pago.
- El pago queda con la **fecha de hoy**.
- Si la caja se cierra después, el pago ya quedó anotado en esa caja.

### Si pagás más de lo que debés

Si el monto es mayor que la deuda, el sistema pregunta antes de guardar: **"El pago es mayor que la deuda"**. Muestra cuánto le debés y cuánto estás pagando. Si seguís, el proveedor queda con un **saldo a favor del kiosco** por la diferencia.

- Tocá **Registrar igual** solo si es a propósito (por ejemplo, un pago adelantado).
- Tocá **Revisar el monto** si fue un error de tipeo, como un cero de más.

### Si apretás dos veces o se corta la conexión

Si apretás dos veces **Registrar pago** o la conexión se corta y el pedido se repite, el sistema reconoce que es el mismo pago y **no lo cuenta dos veces**. Igual, si no estás seguro de si el pago quedó, mirá los movimientos antes de cargarlo de nuevo.

### Los pagos no se borran

Un pago registrado no se edita ni se borra. Si te equivocaste, el dueño lo corrige con una **corrección** (ver abajo).

## Saldo inicial (solo dueño)

Cuando empezás a usar el sistema, el kiosco ya le debe plata a algunos proveedores (o el proveedor nos debe a nosotros). Esa deuda de partida se carga **una sola vez** por proveedor.

1. Entrá a la ficha del proveedor y tocá **Cargar saldo inicial**. Este botón aparece solo si el proveedor todavía no tiene saldo inicial.
2. Completá:
   - **¿Quién le debía a quién?**: **Le debíamos nosotros al proveedor** o **Nos debía el proveedor a nosotros**.
   - **Monto**: el importe, en pesos.
   - **Fecha a la que corresponde**: el día al que corresponde el saldo. Puede ser hoy o una fecha anterior, no futura.
   - **Detalle** (opcional). Por ejemplo: `Deuda al instalar el sistema`.
3. Tocá **Cargar saldo inicial**.

Si el saldo inicial se cargó mal, no se puede cargar de nuevo. Se corrige con una **corrección** (abajo).

## Corregir la cuenta (solo dueño)

Sirve para arreglar un error de carga, una nota de crédito del proveedor, o un pago cargado dos veces.

1. Entrá a la ficha del proveedor y tocá **Corregir la cuenta**.
2. Completá:
   - **¿Qué pasa con la deuda?**: **La deuda sube** o **La deuda baja**.
   - **Monto**.
   - **Motivo** (obligatorio). Por ejemplo: `Nota de crédito 0003-00000456 por mercadería vencida`.
3. Tocá **Guardar corrección**.

Ejemplo: el proveedor te hace una nota de crédito de $ 1.500 por mercadería vencida. Elegís **La deuda baja**, Monto `1500` y de motivo escribís la nota de crédito. El saldo baja $ 1.500 y queda registrado quién lo hizo y por qué.

> [!NOTE]
> Una corrección no tiene control de "pago mayor que la deuda": el saldo puede quedar a favor del kiosco. Revisalo bien antes de guardar.

> [!NOTE]
> Si el error también movió **efectivo de la caja**, la corrección de la cuenta no lo arregla. Ese movimiento de caja se corrige aparte, desde el local, con un ingreso o una salida ([guía 21](21-gastos-retiros-y-aportes.md)).

## Proveedor desactivado

Un proveedor desactivado no recibe compras nuevas, pero **sí** se le pueden registrar pagos y corregir la cuenta. Así se puede cancelar la deuda que quedó ([guía 24](24-proveedores.md)).
