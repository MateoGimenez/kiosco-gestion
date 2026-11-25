# Manual de uso del sistema del kiosco

Este manual explica, paso a paso, cómo usar el sistema. Está escrito para el personal del kiosco, sin conocimientos técnicos.

> [!NOTE]
> El manual crece con el sistema. Hoy cubre la **etapa 1** (entrar, contraseñas y usuarios) y la **etapa 2** (productos, precios, categorías, stock y configuración). Las guías de ventas, caja, compras y reportes se agregan en cada etapa.

## Guías

### Etapa 1: acceso y usuarios

| Guía | Para quién | Qué resuelve |
|---|---|---|
| [01. Entrar al sistema](01-entrar-al-sistema.md) | Todos | Cómo entrar, qué significan los mensajes y el bloqueo por intentos fallidos. |
| [02. Elegir y cambiar tu contraseña](02-cambiar-contrasena.md) | Todos | La contraseña que te dieron es temporal: cómo elegir la tuya, y cómo cambiarla cuando quieras. |
| [03. Cambiar de usuario en el mostrador](03-cambiar-usuario.md) | Todos | Cómo pasar la PC del mostrador a otra persona. |
| [04. Usuarios](04-usuarios-dueno.md) | Dueño | Crear, editar, desactivar, reactivar y resetear contraseñas. |
| [05. Si el dueño olvidó su contraseña](05-si-el-dueno-olvido-la-contrasena.md) | Dueño, con quien administre la PC | Cómo recuperar el acceso de dueño desde la PC del kiosco. |

### Etapa 2: productos y stock

| Guía | Para quién | Qué resuelve |
|---|---|---|
| [06. Productos](06-productos.md) | Todos (el empleado sin costos) | Buscar con el lector o por nombre, ver la ficha, dar de alta, editar, desactivar y reactivar. |
| [07. Precios y costos](07-precios.md) | Encargado y dueño | Costo con o sin IVA, margen, precio sugerido, precio a mano, margen real y el aviso de venta a pérdida. |
| [08. Categorías y subcategorías](08-categorias-y-subcategorias.md) | Encargado y dueño | Quién crea y quién cambia márgenes, y por qué no se desactiva una categoría con productos activos. |
| [09. Ajustar stock](09-ajustar-stock.md) | Encargado y dueño, desde el local | Los motivos del ajuste, cuándo suma o resta, la corrección por conteo y el historial. |
| [10. Para reponer y stock negativo](10-para-reponer-y-stock-negativo.md) | Encargado y dueño | Qué productos aparecen para reponer y cómo corregir el stock negativo. |
| [11. Configuración](11-configuracion.md) | Dueño | Nombre del negocio, redondeo de precios y hora de corte (la hora de corte, solo desde el local). |
| [12. Cómo escribir números](12-escribir-numeros.md) | Todos | Coma para los decimales, punto para los miles, y qué números no se aceptan. |

## Roles

| Rol | Qué puede hacer |
|---|---|
| **Dueño** | Todo lo que hace el sistema, incluida la gestión de usuarios (menú **Usuarios**), los márgenes y la **Configuración**. |
| **Encargado** | Entrar, cambiar su contraseña y cambiar de usuario. Cargar y editar productos, cambiar costos y precios, crear categorías (con margen inicial), ajustar stock y ver **Para reponer**. No cambia márgenes ni ve el menú **Usuarios** ni **Configuración**. |
| **Empleado** | Entrar, cambiar su contraseña y cambiar de usuario. Buscar y ver productos, sin costos. No ve el menú **Usuarios**. Solo entra desde el local. |

Los permisos de cada parte del sistema (ventas, caja, reportes) se suman en las etapas siguientes. El servidor es el que controla los permisos de verdad: esconder un botón no alcanza.

## Antes de empezar

- Necesitás tu **usuario** y tu **contraseña**. Los da el dueño.
- El usuario se escribe con letras sin acento, números, punto, guion o guion bajo (por ejemplo, `juan.p`). Da igual si escribís en mayúsculas: el sistema lo guarda en minúsculas.
- Si no tenés usuario, pedíselo al dueño.

> [!NOTE]
> Para quien prueba el sistema en desarrollo: la pantalla de entrada se abre en <http://localhost:5173>. La dirección definitiva de la PC del kiosco se define en la instalación (etapa 8).
