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
| Margen | **A confirmar:** por producto con valor por defecto de la categoría (respuesta "4.A", probablemente 1.a). |
| Aumentos masivos | Por porcentaje, tanto por proveedor como por categoría. |
| Redondeo | **A confirmar.** |
| Caja | Por turno: cada empleado abre su caja con efectivo inicial y la cierra al irse. |
| Arqueo | Cierre a ciegas: el empleado carga lo contado sin ver lo esperado; la diferencia la ven dueño o encargado. |
| Movimientos de caja | Sí: ingresos y egresos de efectivo (pago a proveedor, retiro del dueño, gastos) con motivo y usuario. |
