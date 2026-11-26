# Changelog

Lo que se agrega en cada etapa del proyecto. El plan completo está en [`docs/plan.md`](docs/plan.md).

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
- El cierre de caja llega en la etapa 4. Mientras tanto, una caja abierta solo se cierra recreando la base o por SQL (README, desarrollo).

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
