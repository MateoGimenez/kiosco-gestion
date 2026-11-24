# 04. Usuarios (solo el dueño)

Para: el dueño.

El menú **Usuarios** aparece solo si entrás como dueño. Encargados y empleados no lo ven.

## La lista de usuarios

Al abrir **Usuarios** ves una fila por persona, con:

- El nombre. Al lado del tuyo aparece **(vos)**.
- El usuario (por ejemplo, `juan.p`).
- El rol: **Dueño**, **Encargado** o **Empleado**.
- El estado: **Activo** o **Desactivado**.
- El último ingreso, por ejemplo "Último ingreso: 18/11/2026 19:30", o "Todavía no entró".
- Los botones **Editar** y **Desactivar** (o **Reactivar**, si está desactivado).

## Crear un usuario

1. Entrá a **Usuarios** y tocá **Nuevo usuario**.
2. Completá el formulario:
   - **Usuario**: de 3 a 30 letras sin acento, números, punto, guion o guion bajo. Por ejemplo, `juan.p`.
   - **Nombre**: el nombre completo, por ejemplo "Juan Pérez".
   - **Rol**: elegí **Dueño**, **Encargado** o **Empleado**.
   - **Contraseña inicial**: mínimo 8 caracteres. Es la contraseña temporal.
3. Tocá **Crear usuario**.
4. Vuelve la lista con el aviso: "Se creó el usuario Juan Pérez. Pasale su contraseña en persona."
5. Pasale la contraseña en persona. No la mandes por mensaje ni la dejes escrita en la PC.
6. La persona entra con esa contraseña, y el sistema le pide que elija la suya (ver [guía 02](02-cambiar-contrasena.md)).

Si el nombre de usuario ya existe, aparece: "Ese nombre de usuario ya existe (puede ser de alguien desactivado). Elegí otro."

## Editar un usuario

1. En la fila de la persona, tocá **Editar**.
2. Podés cambiar el **Nombre** y el **Rol**. El **Usuario** aparece fijo y no se cambia desde esta pantalla.
3. Tocá **Guardar cambios**. Aparece el aviso "Los cambios se guardaron."

Puntos a tener en cuenta:

- Si cambiás el rol de alguien que está usando el sistema, el cambio vale desde su próxima acción, sin cerrarle la sesión.
- Si te cambiás el rol a vos mismo, el sistema te lleva a Inicio con el aviso "Ahora sos [rol]. Ya no podés administrar usuarios."
- Si es el único dueño activo, no se puede cambiar su rol. Aparece el aviso "Tiene que quedar al menos un dueño activo, por eso no se puede cambiar."

## Desactivar un usuario

Cuando alguien deja de trabajar en el kiosco, lo desactivás. **No se borra**: sus ventas y movimientos se conservan.

1. En la fila de la persona, tocá **Desactivar**.
2. Aparece la pregunta **¿Desactivar a Juan Pérez?** con el texto: "No va a poder entrar y se le cierran todas las sesiones abiertas. Sus ventas y movimientos se conservan. Lo podés reactivar cuando quieras."
3. Tocá **Desactivar** para confirmar, o **Cancelar** para volver atrás. El foco arranca en **Cancelar**, para no confirmar sin querer.

Si te desactivás a vos mismo, aparece: "Es tu propio usuario: se te cierra la sesión ahora mismo." El sistema te manda a **Entrar** con el aviso "Desactivaste tu propio usuario. Entrá con otro."

> [!WARNING]
> Si sos el único dueño activo, el botón **Desactivar** de tu fila aparece deshabilitado, con el texto "Tiene que quedar al menos un dueño activo." Para desactivarte, primero creá otro dueño.

## Reactivar un usuario

1. En la fila de una persona desactivada, tocá **Reactivar**.
2. No pide confirmación. Aparece el aviso "Se reactivó a Juan Pérez."
3. La persona vuelve a entrar con la misma contraseña que tenía.

## Resetear la contraseña

Se usa cuando alguien olvidó su contraseña, o cuando sospechás que otra persona la conoce.

1. Entrá a **Usuarios** y tocá **Editar** en la fila de la persona.
2. Bajá hasta la sección **Resetear contraseña**.
3. Escribí la **Contraseña nueva** (mínimo 8 caracteres) y tocá **Resetear contraseña**.
4. Aparece la pregunta **¿Resetear la contraseña de Juan Pérez?** con el texto: "Se le cierran todas las sesiones abiertas (por ejemplo, la del celular) y tiene que entrar con la contraseña nueva."
5. Tocá **Resetear contraseña** para confirmar, o **Cancelar**.
6. Aparece el aviso "Se cambió la contraseña. Pasásela a la persona."
7. La persona entra con esa contraseña. El sistema le pide que elija la suya.

Si reseteás tu propia contraseña, se cierra tu sesión y tenés que entrar de nuevo con la nueva.

## Reglas que el sistema cuida siempre

- **Tiene que quedar al menos un dueño activo.** No se puede desactivar ni bajar de rol al último. El sistema muestra: "Tiene que quedar al menos un dueño activo. Antes, dejá a otra persona como dueño."
- **Puede haber más de un dueño.** Para tener otro, creá un usuario con el rol **Dueño**.
- **Si no hay ningún dueño que pueda entrar**, el dueño recupera el acceso desde la PC del kiosco. Ver [guía 05](05-si-el-dueno-olvido-la-contrasena.md).

## Qué no se puede hacer desde afuera del local

El acceso desde afuera (con Tailscale, desde el celular) llega en la etapa 9. Cuando esté activo, desde afuera del local:

- **No se pueden crear usuarios ni resetear contraseñas.** Aparece "Solo desde el local."
- **No se puede subir de rol a nadie ni reactivar usuarios.** Aparece "Solo desde el local." Sí se puede bajar de rol, desactivar y cambiar el nombre.
- **Un empleado no puede entrar desde afuera.**
- Aparece un aviso fijo: "Estás entrando desde afuera del local. Desde acá no se puede vender ni manejar la caja."
