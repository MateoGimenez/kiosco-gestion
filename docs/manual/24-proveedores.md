# 24. Proveedores

Para: **encargado y dueño**. El empleado no ve la pantalla de Proveedores.
Necesitás: los datos del proveedor (nombre, teléfono, CUIT si lo tiene).

Un **proveedor** es a quien le comprás: el distribuidor, el preventista, el mayorista. Cada proveedor tiene su **cuenta**: lo que le compraste, lo que le pagaste y lo que le debés. Las compras se cargan en [la guía 25](25-cargar-una-compra.md) y los pagos en [la guía 28](28-cuenta-corriente-y-pagos.md).

## Dar de alta un proveedor

1. Entrá a **Proveedores** en el menú de arriba.
2. Tocá **Nuevo proveedor**.
3. Completá los datos:
   - **Nombre** (obligatorio, hasta 80 caracteres). No puede repetirse: si ya existe otro con ese nombre, aunque esté desactivado, el sistema pide que elijas otro.
   - **Teléfono / WhatsApp** (opcional). Ver la sección de abajo.
   - **CUIT** (opcional). Ver la sección de abajo.
   - **Email** (opcional).
   - **Cuándo viene**: marcá los días en que pasa el repartidor o el preventista (opcional).
   - **Notas** (opcional, hasta 500 caracteres). Por ejemplo: `Preventista: Carlos. Pedido hasta las 10.`
4. Tocá **Crear proveedor**.

Después de guardarlo, aparece la cuenta del proveedor, con saldo $ 0.

## Cómo escribir el teléfono

El teléfono sirve para mandarle el pedido por WhatsApp. WhatsApp necesita el número **sin el 0 y sin el 15**, y con el código de área. Por eso el sistema pide:

- **Código de área sin el 0.** Buenos Aires es `11`; Córdoba, `351`.
- **Número sin el 15.** Si el proveedor te dio el número con el 15 (por ejemplo, `011 15 2345-6789`), sacalo.
- **10 números en total.**

Podés escribirlo con espacios, guiones, paréntesis o con `+54`. El sistema lo entiende y lo guarda en 10 números.

| Lo que escribís | ¿Se acepta? | Cómo queda guardado |
|---|---|---|
| `11 2345-6789` | Sí | `11 2345-6789` |
| `+54 9 11 2345-6789` | Sí | `11 2345-6789` |
| `0351 555-1234` | Sí (el 0 se saca solo) | `351 555-1234` |
| `011 15 2345-6789` | No: tiene el 15 | Hay que escribirlo como `11 2345-6789` |
| `2345-6789` | No: falta el código de área | Hay que agregar el código de área, por ejemplo `11 2345-6789` |

Si el número no se puede entender, el sistema responde: "Escribí el código de área sin el 0 y el número sin el 15 (10 números en total). Ej.: 11 2345-6789 o 351 555-1234."

> [!NOTE]
> Solo sirve para celulares argentinos. Un teléfono fijo se puede guardar, pero el botón **Abrir WhatsApp** no va a funcionar con él.

## CUIT

El CUIT tiene 11 números. Podés escribirlo con guiones (`30-71234567-1`) o sin guiones. El sistema revisa que sea un CUIT válido: si tiene un número mal escrito, responde "El CUIT no es válido. Revisá los números."

Si el CUIT ya lo tiene otro proveedor, aparece el aviso **"Ese CUIT ya está cargado"**. Es normal cuando la misma empresa tiene dos preventistas, con días de visita o WhatsApp distintos. Si es el mismo proveedor, tocá **Revisar el CUIT**. Si está bien, tocá **Guardar igual**.

## Editar un proveedor

1. Entrá a **Proveedores** y tocá el nombre del proveedor.
2. Tocá **Editar**.
3. Cambiá lo que haga falta y tocá **Guardar cambios**.

## Desactivar y reactivar

Un proveedor que ya no le comprás se **desactiva**. No se borra: su historial queda.

1. Entrá al proveedor y tocá **Desactivar**.
2. Confirmá con **Sí, desactivar**.

Qué pasa cuando está desactivado:

- No se le pueden cargar **compras nuevas**. El botón **Cargar una compra** no aparece.
- Sí se le pueden **registrar pagos** y corregir la cuenta, para cancelar la deuda.
- Sus productos **siguen teniéndolo como proveedor habitual**.
- Se puede desactivar aunque tenga deuda.

Para volver a comprarle, tocá **Reactivar** en su ficha. En la lista, los proveedores desactivados se ven con la etiqueta **Desactivado** (podés filtrar **Solo desactivados** o **Todos**).

## Asignar el proveedor habitual

El **proveedor habitual** es a quien le comprás normalmente un producto. Sirve para que el **pedido sugerido** ([guía 29](29-pedido-sugerido.md)) incluya ese producto. Cada producto tiene **un solo** proveedor habitual.

Se puede asignar de dos formas.

### Desde el proveedor (varios productos a la vez)

1. Entrá al proveedor.
2. En **Productos habituales**, tocá **Asignar productos**.
3. Buscá los productos por nombre o código de barras, y tildá los que le compres.
   - Si querés ver solo los productos que todavía no tienen proveedor habitual, tildá **Solo los que no tienen proveedor habitual**.
   - Los que ya son de ese proveedor aparecen con la etiqueta **Ya es de ...** y no se pueden tildar.
   - Se pueden asignar hasta 200 productos por vez.
4. Tocá **Asignar a ...**.

Si un producto tenía otro proveedor habitual, se reemplaza. El aviso lo dice: por ejemplo, "Coca-Cola 500 ml estaba con Distribuidora Norte".

### Desde la ficha del producto

1. Entrá a **Productos** y abrí el producto. Para un producto nuevo, tocá **Nuevo producto**.
2. En la sección **Proveedor**, elegí en **Proveedor habitual (opcional)**.
3. Guardá el producto.

El producto **Varios** no tiene proveedor habitual, porque no lleva stock.

> [!NOTE]
> Cargar una compra con otro proveedor **no cambia** el habitual. Si el producto tiene otro habitual, la compra lo avisa: "Su proveedor habitual es ... No se cambia solo." El habitual se cambia a mano, desde una de las dos formas de arriba.

## Qué ve el empleado

El empleado no ve proveedores, compras ni pedidos: en el menú no aparecen esas opciones, y el sistema no le deja ver esa información aunque escriba la dirección a mano.
