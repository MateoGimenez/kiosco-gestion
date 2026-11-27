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
   - el tipo: **Saldo inicial**, **Compra**, **Compra anulada**, **Pago**, **Devolución del proveedor** o **Corrección**,
   - la fecha, de qué origen salió o entró la plata (si es un pago o una devolución), la referencia y quién lo cargó,
   - el **importe** (con signo) y el **saldo** que quedó después de ese movimiento.

Lo que sube la deuda: una **compra**, una **devolución del proveedor** y una **corrección** que sube la deuda.
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

## Registrar una devolución del proveedor

Para: **encargado y dueño**. Se puede registrar también con el proveedor desactivado.
Necesitás: entrar a la ficha del proveedor ([guía 24](24-proveedores.md)). Si la plata entra al cajón: estar en el local, con la caja abierta ([guía 13](13-abrir-la-caja.md)).

Usala cuando el proveedor te **devuelve plata**. El caso más común: anulaste una compra que ya habías pagado ([guía 27](27-anular-una-compra.md)). Al anularla, el saldo queda **a favor del kiosco** (el proveedor te debe esa plata). Cuando te la devuelve, la registrás acá.

No es una devolución cuando el proveedor te descuenta algo de lo que le debés, por ejemplo con una nota de crédito por mercadería vencida. Eso se carga con una **corrección** del dueño (ver abajo).

### Cómo se registra

1. Entrá a **Proveedores** y tocá el nombre del proveedor.
2. Si el saldo es **a favor del kiosco**, aparece "Saldo a favor del kiosco" en destacado, con el botón **Registrar devolución** junto a **Registrar un pago**. Si el saldo está en 0 o le debés al proveedor, el botón queda en un lugar secundario. Igual se puede usar, con confirmación (ver más abajo).
3. Tocá **Registrar devolución**.
4. Completá:
   - **Monto**: viene cargado con el saldo a favor. Cambialo si te devuelve una parte.
   - **¿Cómo te devolvió la plata?**: elegí una opción (ver la tabla de abajo).
   - **Fecha**: aparece solo si la plata no entra a la caja. Si entra a la caja, es la de hoy.
   - **Referencia** (opcional). Por ejemplo, el número de la transferencia: `Op. 778812`.
   - **Descripción** (opcional). Por ejemplo: `Devuelve lo pagado de la compra #22 (anulada)`. Si llegaste desde la compra anulada, ya viene escrita.
5. Mirá el **resumen** que aparece mientras completás. Por ejemplo: "Saldo a favor: $ 15.000 → después: $ 0".
6. Tocá el botón para guardar. <!-- PENDIENTE: el texto del botón de guardar del formulario no está definido en docs/api/proveedores.md 15.9. -->
7. Aparece "Devolución registrada. Saldo: $ 0". Si la plata entró a la caja, también dice cuánto entró a la caja abierta.

### Cómo te devolvió la plata

| Opción en la pantalla | Qué significa | ¿Suma a la caja? | ¿Se puede desde afuera del local? |
|---|---|---|---|
| **Efectivo que entra a la caja** | Te la devolvió en efectivo y la dejás en el cajón. | **Sí.** Suma al arqueo, como un ingreso "Devolución del proveedor". | **No aparece**, solo desde el local. |
| **Efectivo que no va a la caja** | Te la devolvió en efectivo, pero no la dejás en el cajón (por ejemplo, va a tu billetera). | No | Sí |
| **Transferencia** | Te la transfirieron a tu cuenta. | No | Sí |
| **Otro** | Cheque, Mercado Pago u otro medio. Explicalo en la referencia o en la descripción. | No | Sí |

La opción **Efectivo que entra a la caja** es el mismo origen que **Efectivo de la caja** en los pagos. Solo esa opción toca la caja.

- Con **Efectivo que entra a la caja**, la devolución se guarda con la **fecha de hoy** y necesita una **caja abierta**. Si no hay ninguna, aparece "No hay ninguna caja abierta. Abrí la caja o elegí otro origen." Abrila desde **Vender** ([guía 13](13-abrir-la-caja.md)) o elegí otra opción.
- Con las otras tres opciones, podés poner una **fecha pasada** (no futura), y se pueden cargar desde afuera del local. Baja el saldo, pero no aparece en la caja.

Ejemplo: en la caja hay $ 20.000 esperados. Si te devuelven $ 5.000 en efectivo y los dejás en el cajón con **Efectivo que entra a la caja**, el esperado sube a $ 25.000 y la devolución aparece en la caja como ingreso "Devolución del proveedor". Si el mismo dinero llega por transferencia, la caja no cambia.

### Ejemplo: la compra de $ 40.300

1. Compraste a Distribuidora Sur por $ 40.300 y la pagaste: $ 10.000 por transferencia y $ 5.000 con efectivo de la caja.
2. Anulaste la compra. La deuda baja, pero como ya habías pagado $ 15.000, el saldo queda **a favor del kiosco por $ 15.000**.
3. El proveedor te devuelve los $ 15.000 en efectivo y los dejás en la caja abierta. Registrás una devolución de $ 15.000 con **Efectivo que entra a la caja**.
4. El saldo pasa de $ 15.000 a favor a **$ 0**. En la caja, el esperado sube $ 15.000.

Si en cambio te devuelve solo $ 10.000, registrás $ 10.000: el saldo queda **$ 5.000 a favor del kiosco**.

### Si devolvés más que el saldo a favor

Si el monto es mayor que lo que el proveedor te debe, el sistema pide confirmación antes de guardar. Muestra cuánto le vas a deber después: "Es más que lo que te debe: después le vas a deber $ X".

Esto pasa, por ejemplo, si ya cargaste la compra corregida de $ 40.300. En ese caso el saldo es de $ 25.300 que **le debés** al proveedor. Si después te devuelve $ 15.000, el sistema avisa que después le vas a deber $ 40.300. Confirmá solo si es la situación real: te devolvió lo que habías pagado, y la compra corregida sigue sin pagarse entera. Si fue un error de tipeo, cancelá y revisá el monto.

### Lo que no se hace

- **No se anula ni se edita.** Igual que un pago, una devolución no tiene botón para anularla ni para cambiarla. Si la cargaste mal:
  1. Avisale al dueño.
  2. El dueño hace una **corrección** en la cuenta por la diferencia (o por todo el monto) ([ver abajo](#corregir-la-cuenta-solo-dueño)). Por ejemplo, si cargaste $ 15.000 y el proveedor te devolvió $ 10.000, el dueño corrige "La deuda baja" por $ 5.000.
  3. Si la plata entró a la caja, con la caja abierta se registra una **salida** con motivo **Otro** por la diferencia, desde el local ([guía 21](21-gastos-retiros-y-aportes.md)). En el ejemplo, una salida de $ 5.000 con la descripción "Corrección: devolución cargada de más".
- **No se vincula a una compra.** La devolución no queda asociada a ninguna compra, porque el saldo a favor puede venir de varias compras anuladas o de otros movimientos. Para saber de qué compra es, escribí el número en la **descripción**, por ejemplo "compra #22".
- **No aparece en la lista de movimientos de caja a mano.** "Devolución del proveedor" solo se registra desde la cuenta del proveedor, no desde **Registrar ingreso o salida** en la caja.

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
