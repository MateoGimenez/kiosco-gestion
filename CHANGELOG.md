# Changelog

Lo que se agrega en cada etapa del proyecto. El plan completo está en [`docs/plan.md`](docs/plan.md).

## Etapa 5: Proveedores y compras

Pendiente de la prueba del dueño con los pasos de "Cómo probarlo" del plan.

### Agregado

- **Proveedores.** Dar de alta, editar, desactivar y reactivar. El teléfono se escribe con código de área, sin 0 y sin 15, y se guarda en 10 números para el link de WhatsApp. El CUIT se valida (dígito verificador); dos proveedores pueden tener el mismo CUIT, con confirmación. Días de visita y notas. Un proveedor desactivado conserva su saldo y no recibe compras nuevas, pero sí pagos y correcciones.
- **Proveedor habitual.** Un solo proveedor por producto. Se asigna desde el proveedor (varios productos a la vez) o desde la ficha del producto. Cargar una compra con otro proveedor no lo cambia.
- **Compras.** Carga con teclado, por unidad o por bulto (con unidades por bulto), costo sin IVA, IVA por alícuota y otros cargos (van a la deuda, no al costo). Totales en vivo para comparar con la factura. Al guardar: sube el stock, el costo pasa a ser el último pagado, sube la deuda por el total y se muestra qué costos cambiaron. Avisos por comprobante repetido y por producto desactivado o de otro proveedor. Una compra que suma $ 0 no se guarda.
- **Pagar ahora.** Al cargar la compra se puede pagar el total o una parte, con los cuatro orígenes. El efectivo de la caja genera la salida en la caja abierta y solo se puede desde el local.
- **Fotos de la factura.** JPG, PNG o PDF, hasta 10 MB cada uno y 10 por compra. Se sacan con la cámara del celular o se eligen de un archivo. Se verifica el tipo real del archivo, se guardan con nombre al azar en `UPLOADS_DIR` y se sirven solo a encargado y dueño. Los PDF siempre se descargan. Se pueden borrar (con auditoría).
- **Anulación de compras.** Motivo obligatorio. Revierte el stock y la deuda; no revierte los costos ni los precios, ni los pagos ya hechos.
- **Cuenta corriente.** Saldo y movimientos con saldo acumulado. Registrar pagos con cuatro orígenes; solo el efectivo de la caja descuenta del arqueo. Pago mayor que la deuda: pide confirmación. Saldo inicial y correcciones con motivo, solo dueño.
- **Pedido sugerido.** Productos del proveedor en el mínimo o por debajo; cantidad sugerida = mínimo menos stock, y al menos 1. Se puede editar. Botones "Copiar" y "Abrir WhatsApp". No se guarda nada: el sistema no envía mensajes.
- **Configuración de adjuntos.** Variables `UPLOADS_DIR` y `UPLOAD_MAX_MB` en `.env.example`. La API no arranca si no puede escribir en `UPLOADS_DIR`.
- **Datos de ejemplo.** `npm run db:seed` agrega 4 proveedores de ejemplo (teléfonos y mails inventados) y les asigna el proveedor habitual a los productos según su categoría.
- **Documentación.** Contrato de la API de proveedores (`docs/api/proveedores.md`) y de compras, adjuntos y anulación (`docs/api/compras.md`), decisión sobre adjuntos (ADR 005), manual de uso con las guías 24 a 29 (proveedores, cargar una compra, fotos de la factura, anular una compra, cuenta corriente y pagos, pedido sugerido). README actualizado.

### Cambios en guías anteriores

- La guía 21 (gastos, retiros y aportes) ya no dice que los pagos a proveedores llegan en esta etapa: se registran desde la cuenta del proveedor.

### Pendiente

- El aviso de cambio de costo con precio sugerido y la elección del precio desde la compra llegan en la etapa 6 (COM-06). Hasta entonces, la compra solo muestra el precio de venta actual y un link a Precios.
- **Para reponer por proveedor** (REP-07): la API acepta el filtro `supplierId`, pero la pantalla todavía no lo tiene.
- Deuda de seguridad de la etapa 4 (reintento de una venta al empleado): a verificar en la revisión de seguridad de esta etapa.
- Deuda de la etapa 1 (`npm audit` por `effect`) y copias de seguridad que incluyan `UPLOADS_DIR`: etapa 8.

## Etapa 4: Caja

Pendiente de la prueba del dueño con los pasos de "Cómo probarlo" del plan.

### Agregado

- **Cierre de caja a ciegas.** Desde **Vender** o **Caja**, se cuenta el efectivo y se escribe el total. Hay ayuda para contar por billetes y una confirmación ("¿Contaste $ X?") antes de cerrar. Después de cerrar no se puede cambiar el número. El empleado ve "Caja cerrada" y lo que contó; no ve el esperado ni la diferencia. No se cierra con un carrito sin cobrar en la pantalla de venta.
- **Esperado y diferencia.** Efectivo inicial, más lo cobrado en efectivo, más los ingresos, menos las salidas. Solo cuenta el efectivo: débito, crédito, QR y transferencia van al resumen por medio de pago. Se guardan al cerrar y no cambian después.
- **Gastos, retiros y aportes** (encargado y dueño, desde el local). Motivos: gasto, retiro del dueño, aporte de cambio y otro. Un movimiento no se edita ni se borra: el error se corrige con otro movimiento.
- **Detalle y arqueo de cada caja** (encargado y dueño). La cuenta del efectivo paso a paso, el resumen por medio de pago, las ventas y anulaciones, los movimientos y las notas.
- **Notas a cajas cerradas** (encargado y dueño, también desde afuera del local). Se agregan y no se editan.
- **Lista de cajas** con datos de cierre y filtros: día de trabajo, turno, estado, diferencia y diferencia de apertura.
- **Diferencia de apertura** (encargado y dueño). Se marca cuando el efectivo inicial no coincide con lo contado en el cierre anterior. Al abrir, el encargado y el dueño ven lo contado en el último cierre. El empleado no ve ninguno de los dos datos.
- **Aviso de caja de un día anterior abierta** en Inicio, Vender y Caja. Lo puede cerrar quien la abrió, el encargado o el dueño. El servidor lo deja registrado al arrancar.
- **Documentación.** Contrato de la API de caja (`docs/api/caja.md`), manual de uso de cierre, gastos, arqueo y caja de un día anterior (guías 20 a 23), y la guía de abrir la caja actualizada.

### Pendiente

- El pago a proveedor con efectivo de la caja llega en la etapa 5.
- La copia de seguridad después de cada cierre llega en la etapa 8.
- Deuda de seguridad a resolver en las etapas 5 y 8 (`docs/plan.md`).

## Etapa 3: Ventas

Pendiente de la prueba del dueño con los pasos de "Cómo probarlo" del plan.

### Agregado

- **Pantalla Vender.** Pensada para teclado y lector: el cursor queda siempre en el buscador. Con el lector, el producto se agrega solo; si el código ya está en el carrito, suma 1. Búsqueda por nombre sin importar los acentos, con lista para elegir con flechas y Enter.
- **Productos por peso.** Se piden los kilos con coma (`0,350`), hasta 3 decimales. Si el producto ya estaba en el carrito, la cantidad se reemplaza.
- **"Varios" (F4).** Producto sin código: se escribe el precio y, si se quiere, una descripción. No descuenta stock.
- **Carrito.** Cambiar cantidad (F3 o tocando el número), quitar (Supr o botón), vaciar (F9, con confirmación) y elegir líneas con las flechas. Aviso de stock insuficiente que **no frena** la venta; después de cobrar, el resumen avisa si quedó stock negativo.
- **Cobro.** Ctrl+Enter o botón **Cobrar**. Efectivo, pago mixto con varios medios (también el mismo medio dos veces), botón **Resto con** para agregar lo que falta, vuelto solo sobre la parte en efectivo, y QR o transferencia que no pueden pasarse del total.
- **Recargo del crédito.** Se calcula sobre el precio sin descuento de la parte que se paga con crédito. La ventana muestra "Cobrá $ X en el posnet" con el monto a tipear.
- **Total que cambió.** Si cambió un precio o el recargo con el carrito armado, el sistema no cobra: muestra el total nuevo y pide confirmar.
- **Cobro sin duplicados.** Cada carrito tiene un identificador: un doble clic o un reintento después de un corte de red no crea dos ventas.
- **Descuentos (encargado y dueño).** En porcentaje o en pesos, con motivo opcional (F8). Vale solo para la venta actual. Queda registrado en la auditoría.
- **Apertura de caja.** Turno (mañana, tarde, noche) y efectivo inicial. Una sola caja abierta para todo el kiosco, desde el local. El empleado no ve el efectivo inicial.
- **Ventas (encargado y dueño).** Lista por día de trabajo, caja y estado, con detalle de cada venta. Los costos y la ganancia solo los ve el dueño.
- **Anulación (encargado y dueño, desde el local).** Motivo obligatorio y caja abierta. Vuelve el stock; el efectivo sale de la caja abierta; lo cobrado con otros medios se devuelve por fuera, y el sistema lo indica.
- **Medios de pago (dueño).** Recargo del crédito (0 a 100 %), activar o desactivar, y orden. El efectivo no se puede desactivar. Las ventas viejas no cambian.
- **Worker de bcrypt (ADR 004).** Las contraseñas se verifican en un hilo aparte: una avalancha de logins fallidos ya no frena el mostrador. Herramienta de medición: `npm run bench:login -w @kiosco/api`.
- **Documentación.** Contrato de la API de ventas y caja, ADR 004, y manual de uso de caja, ventas, cobro, descuentos, anulaciones y medios de pago. README actualizado.

### Pendiente

- Deuda de seguridad a resolver en las etapas 7 y 8 (`docs/plan.md`): reporte de "Varios" por vendedor, tiempo máximo del worker de bcrypt y revisión de `failPending`.
- El cierre de caja llegó en la etapa 4 (ver arriba).

## Etapa 2: Productos y stock

Pendiente de la prueba del dueño con los pasos de "Cómo probarlo" del plan.

### Agregado

- **Categorías y subcategorías.** Crear, editar, desactivar y reactivar. Cada categoría tiene su margen, y cada subcategoría puede tener el suyo o usar el de la categoría. El encargado pone el margen inicial al crear una categoría; después, solo el dueño cambia los márgenes.
- **Productos.** Dar de alta, editar, desactivar y reactivar. Se busca con el lector de código de barras o por nombre, sin importar los acentos. Un producto desactivado no aparece para vender. El empleado ve los productos, el precio de venta y el stock, pero no los costos.
- **Precios.** Costo con IVA o sin IVA, margen (del producto, de la subcategoría o de la categoría) y precio sugerido. El sugerido siempre se redondea hacia arriba a $10. Si ponés un precio a mano, el sistema muestra el margen real que le queda al kiosco.
- **Aviso de venta a pérdida.** Si el precio queda por debajo del costo, el sistema avisa "Estás vendiendo a pérdida" y pide confirmar. Sin confirmación, no guarda nada.
- **Stock.** Ajustes con motivo (rotura, faltante, consumo propio, corrección por conteo, carga inicial y otro, con nota). Se puede contar lo que hay y el sistema calcula la diferencia. Cada cambio queda en el historial, con quién lo hizo y cuándo. Los ajustes se hacen solo desde el local.
- **Para reponer y stock negativo.** Lista de productos que están en el mínimo o por debajo, con cuánto falta. Lista aparte de los productos con stock negativo, para corregirlos.
- **Configuración** (solo dueño). Nombre del negocio, redondeo de precios y hora de corte del día de trabajo. La hora de corte se cambia solo desde el local.
- **Datos de ejemplo.** `npm run db:seed` carga 9 categorías, 51 productos y el producto especial "Varios", para probar el sistema.
- **Búsqueda sin acentos.** Usa las extensiones `unaccent` y `pg_trgm` de PostgreSQL. La migración las crea, o se crean a mano en la guía del README.
- **Documentación.** Contrato de la API de productos, precios, categorías, stock y configuración. Manual de uso con guías de productos, precios, categorías, ajustes de stock, "Para reponer", configuración y cómo escribir números.

## Etapa 1: Base y login

Pendiente de la prueba del dueño con los pasos de "Cómo probarlo" del plan.

### Agregado

- **Proyecto armado.** Una sola carpeta con la API, las pantallas y las funciones compartidas (por ejemplo, las de dinero y redondeo). Un solo comando instala todo.
- **Base de datos.** PostgreSQL 16, con Docker o instalado en la PC. Las tablas se crean con migraciones.
- **Entrar al sistema.** Pantalla de **Entrar** con usuario y contraseña. La sesión dura 12 horas en el local.
- **Cerrar sesión y cambiar de usuario.** El botón **Cambiar usuario** cierra la sesión y deja la pantalla lista para la siguiente persona.
- **Bloqueo por intentos fallidos.** Con 5 contraseñas mal escritas seguidas en 15 minutos, ese usuario queda bloqueado 15 minutos. Hay además un límite de intentos por minuto para frenar las pruebas masivas.
- **Contraseñas seguras.** Se guardan cifradas (bcrypt), nunca en texto. Mínimo 8 caracteres.
- **Tres roles:** Dueño, Encargado y Empleado. El servidor controla los permisos en cada pedido, no solo la pantalla.
- **Gestión de usuarios (solo dueño).** Crear, editar, desactivar y reactivar usuarios. Resetear la contraseña de alguien pide confirmación y cierra sus sesiones abiertas. No se borra a nadie. Tiene que quedar al menos un dueño activo.
- **Contraseña temporal.** Cuando se crea un usuario o se resetea su contraseña, la persona elige la suya al entrar.
- **Cambiar mi contraseña.** Cualquiera puede cambiar su contraseña cuando quiera. Se cierran sus sesiones en otros dispositivos.
- **Recuperar al dueño desde la PC.** Comando `npm run owner:reset`, para crear al dueño o cambiarle la contraseña desde la consola de la PC. No existe como pantalla ni como ruta de la API.
- **Registro de accesos y cambios.** Se guardan los ingresos, los intentos fallidos, los bloqueos y los cambios de usuarios, con quién los hizo y por dónde entró.
- **Puerta de acceso local y remota.** Lo que se hace desde el local y lo que llega desde afuera se distinguen en el servidor. La puerta remota (acceso desde afuera con Tailscale) queda apagada hasta la etapa 9.
- **Pantalla de inicio provisoria.** Muestra tu nombre y si el sistema está funcionando.
- **Protecciones básicas de la web.** Encabezados de seguridad y rechazo de pedidos hechos desde otras páginas. Ningún otro sitio puede hablar con la API.
- **Pruebas automáticas.** Unitarias, de integración y de navegador (Playwright). Se corren en cada cambio con GitHub Actions.
- **Documentación.** README con cómo levantar el proyecto, decisiones técnicas (ADR 001 a 003), contrato de la API de login y usuarios, y el manual de uso (entrar, contraseñas, cambiar de usuario y usuarios).
