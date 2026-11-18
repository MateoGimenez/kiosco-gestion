# Producto: sistema de gestión del kiosco

Superficie de trabajo (modo Operar), no de marketing.

## Qué es

Sistema web para un kiosco argentino de una sola sucursal: ventas, stock, proveedores, compras, precios,
caja por turno, usuarios y reportes. No hay fiado. Fuente de las reglas: `docs/requisitos.md`.

## Quién lo usa y dónde

- **Mostrador:** PC compartida con teclado y lector de código de barras, fila de clientes esperando.
  Se cambia de usuario varias veces por turno. Todo tiene que poder hacerse sin mouse y con pocos toques.
- **Dueño y encargado:** también desde el celular, dentro del local (WiFi) o desde afuera (acceso remoto
  seguro). Desde afuera no se vende ni se maneja la caja.
- **Usuarios no técnicos.** Los textos hablan en español rioplatense con voseo, sin jerga.
- **Tres roles fijos:** Empleado, Encargado y Dueño. Solo el dueño gestiona usuarios.

## Condiciones

- Funciona **sin internet** (servidor en la PC del kiosco): nada de CDN, fuentes ni íconos externos.
- Dinero y fechas en formato argentino (es-AR).
- Los permisos reales los valida el backend; la interfaz solo oculta lo que no corresponde.

## Tono

Directo y tranquilo. Los errores dicen qué pasó y qué hacer. Nada decorativo.
