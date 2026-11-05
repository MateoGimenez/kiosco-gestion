# Relevamiento del negocio (Fase 2)

Respuestas del dueño del proyecto, ronda por ronda. Es la fuente para `docs/requisitos.md`.
Lo marcado como **A confirmar** todavía no es una regla firme.

## Ronda 1: Ventas / punto de venta

| Tema | Decisión |
|---|---|
| Código de barras | Sí: lector USB (funciona como teclado) **y** búsqueda por nombre para productos sin código. Hoy no hay un lector físico para probar, así que se prueba tipeando el código. |
| Medios de pago | Efectivo, transferencia, QR (Mercado Pago) y posnet (tarjeta). |
| Pago mixto | Sí: una venta puede pagarse con más de un medio. |
| Recargos | Sí: crédito con recargo de aproximadamente 10%. **A confirmar:** el porcentaje exacto y si débito tiene recargo. El recargo debe ser configurable por medio de pago. |
| Mercado Pago | Solo se registra el medio de pago; sin integración con la API de Mercado Pago (posible mejora futura). |
| Descuentos | Descuento manual en la venta, solo para usuarios con permiso. Sin promos automáticas por ahora. |
| Ticket | No se imprime; solo queda registrada la venta. |
| Anulaciones | Se anula la venta completa; solo dueño o encargado. Sin devoluciones parciales. |
