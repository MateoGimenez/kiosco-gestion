# Manual de uso del sistema del kiosco

Este manual explica, paso a paso, cómo usar el sistema. Está escrito para el personal del kiosco, sin conocimientos técnicos.

> [!NOTE]
> El manual crece con el sistema. Hoy cubre la **etapa 1** (entrar, contraseñas y usuarios). Las guías de ventas, caja, compras, precios y reportes se agregan en cada etapa.

## Guías

| Guía | Para quién | Qué resuelve |
|---|---|---|
| [01. Entrar al sistema](01-entrar-al-sistema.md) | Todos | Cómo entrar, qué significan los mensajes y el bloqueo por intentos fallidos. |
| [02. Elegir y cambiar tu contraseña](02-cambiar-contrasena.md) | Todos | La contraseña que te dieron es temporal: cómo elegir la tuya, y cómo cambiarla cuando quieras. |
| [03. Cambiar de usuario en el mostrador](03-cambiar-usuario.md) | Todos | Cómo pasar la PC del mostrador a otra persona. |
| [04. Usuarios](04-usuarios-dueno.md) | Dueño | Crear, editar, desactivar, reactivar y resetear contraseñas. |
| [05. Si el dueño olvidó su contraseña](05-si-el-dueno-olvido-la-contrasena.md) | Dueño, con quien administre la PC | Cómo recuperar el acceso de dueño desde la PC del kiosco. |

## Roles

| Rol | Qué puede hacer en la etapa 1 |
|---|---|
| **Dueño** | Todo lo que hace el sistema, incluida la gestión de usuarios (menú **Usuarios**). |
| **Encargado** | Entrar, cambiar su contraseña y cambiar de usuario. No ve el menú **Usuarios**. |
| **Empleado** | Entrar, cambiar su contraseña y cambiar de usuario. No ve el menú **Usuarios**. Solo entra desde el local. |

Los permisos de cada parte del sistema (ventas, caja, costos, reportes) se suman en las etapas siguientes. El servidor es el que controla los permisos de verdad: esconder un botón no alcanza.

## Antes de empezar

- Necesitás tu **usuario** y tu **contraseña**. Los da el dueño.
- El usuario se escribe con letras sin acento, números, punto, guion o guion bajo (por ejemplo, `juan.p`). Da igual si escribís en mayúsculas: el sistema lo guarda en minúsculas.
- Si no tenés usuario, pedíselo al dueño.

> [!NOTE]
> Para quien prueba el sistema en desarrollo: la pantalla de entrada se abre en <http://localhost:5173>. La dirección definitiva de la PC del kiosco se define en la instalación (etapa 8).
