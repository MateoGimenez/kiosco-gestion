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
| Categorías | Una categoría por producto (lista editable), con filtros más finos dentro de cada una (ej.: Bebidas → gaseosas, jugos, aguas). **A confirmar:** subcategorías o etiquetas. |
