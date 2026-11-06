# Relevamiento del negocio (Fase 2)

Respuestas del dueño del proyecto, ronda por ronda. Es la fuente para `docs/requisitos.md`.
Lo marcado como **A confirmar** todavía no es una regla firme.

## Ronda 1: Ventas / punto de venta

| Tema | Decisión |
|---|---|
| Código de barras | Sí: lector USB (funciona como teclado) **y** búsqueda por nombre para productos sin código. Hoy no hay un lector físico para probar, así que se prueba tipeando el código. |
| Medios de pago | Efectivo, transferencia, QR (Mercado Pago), tarjeta de débito y tarjeta de crédito (con el posnet de Mercado Pago). |
| Pago mixto | Sí: una venta puede pagarse con más de un medio. |
| Recargos | Solo crédito, aproximadamente 10%. Débito sin recargo. El porcentaje debe ser configurable por medio de pago (sin tocar código). |
| Mercado Pago | Solo se registra el medio de pago; sin integración con la API de Mercado Pago (posible mejora futura). |
| Descuentos | Descuento manual en la venta, solo para usuarios con permiso. Sin promos automáticas por ahora. |
| Ticket | No se imprime; solo queda registrada la venta. |
| Anulaciones | Se anula la venta completa; solo dueño o encargado. Sin devoluciones parciales. |

## Ronda 2: Stock

| Tema | Decisión |
|---|---|
| Unidad de venta | Por unidad y algunos productos por peso (kg). |
| Stock mínimo | Sí: mínimo por producto, alerta y lista de "para reponer". |
| Vencimientos | No se controlan. |
| Venta sin stock | Se permite: el sistema avisa y el stock queda negativo para corregir después. |
| Categorías | Una categoría por producto (lista editable), con filtros más finos dentro de cada una (ej.: Bebidas → gaseosas, jugos, aguas). Cada producto tiene **una categoría y una subcategoría fija** (ej.: Coca-Cola → Bebidas → Gaseosas). |

## Ronda 3: Proveedores y compras

| Tema | Decisión |
|---|---|
| Datos del proveedor | Nombre, teléfono/WhatsApp, email, CUIT (opcional), días de visita y notas. |
| Pedidos | Sí: pedido sugerido por proveedor con lo que está bajo el mínimo; se ajusta y se copia o envía por WhatsApp. |
| Cuenta corriente | Sí: deuda, pagos y saldo con cada proveedor. |
| Carga de compras | Carga **manual** (proveedor, productos, cantidad, costo): al guardar suma stock y actualiza costos. Se puede **adjuntar la foto o el archivo** de la factura/remito y queda guardada con la compra. Sin lectura automática por ahora (posible mejora futura). |
| Cambio de costo | El sistema avisa y sugiere el nuevo precio de venta; el usuario lo confirma. |

## Ronda 4: Precios y caja

| Tema | Decisión |
|---|---|
| Margen | Margen % sobre el costo (costo $1.000 + 40% = $1.400). Cada producto puede tener su margen; si no tiene, usa el de su categoría. |
| Aumentos masivos | Por porcentaje, tanto por proveedor como por categoría. |
| Redondeo | Sí, a $10 (ej.: $1.437 → $1.440). Configurable. |
| Caja | Por turno: cada empleado abre su caja con efectivo inicial y la cierra al irse. |
| Arqueo | Cierre a ciegas: el empleado carga lo contado sin ver lo esperado; la diferencia la ven dueño o encargado. |
| Movimientos de caja | Sí: ingresos y egresos de efectivo (pago a proveedor, retiro del dueño, gastos) con motivo y usuario. |

## Ronda 5: Clientes/fiado y usuarios/roles

| Tema | Decisión |
|---|---|
| Fiado | **No se fía.** No hay cuenta corriente de clientes ni registro de clientes. |
| Acceso | Cada persona con su usuario y contraseña. |

### Permisos por rol (aprobados)

| Acción | Empleado | Encargado | Dueño |
|---|:---:|:---:|:---:|
| Vender, abrir y cerrar su caja | ✅ | ✅ | ✅ |
| Aplicar descuento manual | ❌ | ✅ | ✅ |
| Anular una venta | ❌ | ✅ | ✅ |
| Ver la diferencia del arqueo | ❌ | ✅ | ✅ |
| Registrar salidas de caja (gastos, pagos a proveedor) | ❌ | ✅ | ✅ |
| Cargar compras y ajustar stock (roturas, faltantes) | ❌ | ✅ | ✅ |
| Cambiar precios y hacer aumentos masivos | ❌ | ✅ | ✅ |
| Proveedores, pedidos y pagos a proveedores | ❌ | ✅ | ✅ |
| Ver reportes de ventas | ❌ | ✅ | ✅ |
| Ver costos, ganancia y stock valorizado | ❌ | ❌ | ✅ |
| Usuarios y configuración (recargos, márgenes, redondeo) | ❌ | ❌ | ✅ |

## Ronda 6: Reportes y otros

| Tema | Decisión |
|---|---|
| Reportes | Todos: ventas por día/turno/medio de pago; más vendidos y sin movimiento; ganancia por período y categoría (solo dueño); stock valorizado (solo dueño); diferencias de caja por turno y empleado; deuda con proveedores. Con filtro de fechas. |
| Exportar | Sí, a Excel. |
| Facturación ARCA | No en la primera versión, pero **sí en el futuro**: el diseño debe dejarlo preparado. |
| Sin internet | El sistema corre en la PC del kiosco (servidor local). Tablets o celulares se conectan por el WiFi del local. Se puede vender sin internet. Copias de seguridad automáticas. |
| Sucursales | Una. |
| Dispositivos | PC en el mostrador (para vender). El dueño también entra desde el celular, **dentro del local y desde afuera** (casa, calle), con un acceso remoto seguro (tipo Tailscale o Cloudflare Tunnel) hacia la PC del local. Se implementa como etapa aparte, al final. Si se corta internet en el local, se sigue vendiendo; solo se pierde el acceso remoto mientras dure el corte. |

## Ronda 7: Preguntas abiertas del arquitecto (ver sección 7 de `requisitos.md`)

| Pregunta | Decisión |
|---|---|
| PA-02 Cajas abiertas | Una sola en todo el kiosco; cualquier usuario vende en ella y queda registrado quién. |
| PA-03 Costos para el encargado | Los ve solo en las pantallas de compras y precios. |
| PA-04 Proveedores por producto | Uno habitual (se puede ampliar más adelante). |
| PA-07 Deuda con proveedor | Toda compra suma deuda; en el mismo paso se puede marcar "pagar ahora". |
| PA-13 Condición fiscal | Probablemente responsable inscripto. **A confirmar con el cliente** (el sistema es para un cliente). Se guarda el IVA de cada producto como campo opcional (21% por defecto); en la v1 no cambia ningún cálculo. |
| PA-01 Acceso remoto | Con **Tailscale**. Entran desde afuera **dueño y encargado**. Desde afuera pueden hacer todo **menos vender y manejar la caja**. |
| PA-05 Costo al comprar | Queda el último costo pagado. |
| PA-06 Cantidades en compras | Se puede cargar **por unidad o por bulto**, eligiendo en cada línea. Las "unidades por bulto" se pueden cambiar en cada compra (el producto puede tener un valor sugerido). |
| PA-08 Origen del pago a proveedor | Efectivo de la caja, efectivo de afuera de la caja, transferencia u otro. Solo el efectivo de la caja afecta el arqueo. |
| PA-09 Productos por peso | El peso se escribe a mano al vender (ej.: 0,350 kg). |
| PA-10 Producto no cargado | Se vende como "Varios" con precio escrito a mano; queda registrado para revisar en reportes. |
| PA-11 Códigos de barras | Uno por producto. |
| PA-12 Recargo de crédito | Un único % configurable (sin cuotas). |
| PA-14 Recargo y descuento | El recargo se calcula **antes** del descuento y **solo sobre la parte pagada con crédito**. |
| PA-15 Descuento manual | Sobre el total de la venta, en $ o %, con motivo opcional. |
| PA-16 Autorizar permisos | El encargado o el dueño lo hacen desde su propia sesión (sin autorización con contraseña en la pantalla del empleado). |
| PA-17 Anular venta de turno cerrado | Se permite; la devolución sale de la caja abierta en ese momento. La caja vieja no cambia. |
| PA-18 Ventas en espera | No: el carrito queda solo en pantalla y no se puede cerrar la caja con un carrito sin cobrar. |
| PA-19 Redondeo de precios | Siempre hacia arriba, a $10. |
| PA-20 Centavos en el cobro | Se redondea al peso entero. |
| PA-21 Precio cambiado a mano | El margen guardado queda igual; el sistema muestra el "margen real" que da ese precio. |
| PA-23 Aumentos masivos | En cada aumento se elige si se aplica sobre el costo o sobre el precio, con vista previa antes de confirmar. **Solo aumentos** (no bajas masivas). |
| PA-24 Impuestos en compras | Se carga el costo final por unidad, con todo incluido (IVA y percepciones). |
| PA-22 Margen por subcategoría | Sí. El margen se busca en este orden: producto → subcategoría → categoría. |
| PA-25 Compra mal cargada | Se anula (revierte stock y deuda) y se carga de nuevo. No se edita. |
| PA-26 Pedido sugerido | Sugiere lo que falta para llegar al mínimo (stock ≤ mínimo); la cantidad se puede cambiar. |
| PA-28 Cierre a ciegas | El empleado cuenta solo el efectivo. |
| PA-27 Motivos de ajuste de stock | Rotura, faltante (robo o pérdida), corrección por conteo, carga inicial, consumo propio, otro. |
| PA-29 Ingresos y salidas de caja | Los registran encargado y dueño. Motivos: pago a proveedor, retiro del dueño, gasto, aporte de cambio, devolución por anulación, otro. |
| PA-30 Detalles de la caja | El efectivo inicial lo escribe el empleado al abrir. Las diferencias del arqueo solo se informan. Un cierre hecho no se corrige; solo se le agrega una nota. |
| PA-31 Recargo en reportes | El recargo de crédito se muestra aparte, no se suma a la ganancia. |
| PA-33 Categorías | Las crean y editan encargado y dueño; el margen de categoría y subcategoría solo lo cambia el dueño. |

### Resto de preguntas: se aceptan las recomendaciones del arquitecto

| Pregunta | Decisión |
|---|---|
| PA-32 "Día" en reportes | Día calendario (zona horaria de Buenos Aires). **A confirmar con el cliente** si el kiosco cierra después de medianoche. |
| PA-34 "Sin movimiento" | Productos sin ventas en el rango del filtro de fechas, sin configuración extra. |
| PA-35 Backups | Automáticos, diarios y al cerrar cada caja, guardando 30 copias e incluyendo los adjuntos. Copia en la nube (y en pendrive si se puede). **A confirmar:** qué servicio de nube. |
| PA-36 PC del kiosco | **A confirmar con el cliente:** sistema operativo, RAM, si tiene UPS y si queda prendida. En Windows conviene PostgreSQL instalado directo (sin Docker). |
| PA-37 Usuarios | Contraseña olvidada: la resetea el dueño. Si el dueño olvida la suya: procedimiento documentado en la PC del kiosco. Puede haber más de un dueño. La sesión dura hasta 12 h, con botón visible de "cambiar usuario". |
| PA-38 Carga inicial de productos | Importación desde Excel (además de la carga manual). |
| PA-39 HTTPS dentro del local | Lo decide `seguridad` antes de la etapa de login. Regla fija: la venta en la PC del mostrador nunca puede depender de internet. |

### Respuestas del cliente (a confirmar → confirmado)

| Pregunta | Decisión |
|---|---|
| PA-13 Condición fiscal | **Responsable inscripto.** Se guarda el IVA por producto. **A confirmar:** si en las compras conviene cargar costo neto + IVA (crédito fiscal) en lugar del costo final de PA-24. |
| PA-32 "Día" en reportes | El kiosco tiene tres turnos (mañana, tarde y noche) y el de noche **pasa la medianoche**, así que los reportes usan "día de trabajo" y no día calendario. **A confirmar:** cómo se define el corte. |
| PA-35 Backups en la nube | **Google Drive.** **A confirmar:** el mecanismo (carpeta sincronizada con la app de Google Drive o subida desde el sistema). |
| PA-36 PC del kiosco | **Windows, 8 GB de RAM.** PostgreSQL instalado directo en Windows (sin Docker) en producción. **A confirmar:** si tiene UPS y si queda prendida de noche. |
