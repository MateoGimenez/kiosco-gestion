# 05. Si el dueño olvidó su contraseña

Para: el dueño, o la persona que administra la PC del kiosco.

Si nadie puede entrar como dueño, no se puede resetear la contraseña desde la aplicación. Por eso existe un comando que se corre **en la PC del kiosco**, desde su consola. Solo sirve desde esa PC: no hay forma de hacerlo desde un celular ni desde afuera del local.

> [!NOTE]
> Este procedimiento describe cómo funciona hoy el comando `npm run owner:reset`. El procedimiento final para la PC del kiosco (con Windows y el sistema instalado como servicio) se documenta en la etapa 8, en el manual de instalación.

## Qué necesitás

- Estar frente a la PC del kiosco.
- El usuario del dueño (por ejemplo, `dora.d`).
- Una contraseña nueva, de al menos 8 caracteres.

## Pasos

1. Abrí una **terminal** (consola) en la PC del kiosco, en la carpeta del proyecto.
2. Escribí el comando y apretá **Enter**:

   ```bash
   npm run owner:reset
   ```

3. Aparece el título: "Dueño del kiosco: crear o resetear la contraseña (se corre solo en la PC)."
4. Te pregunta **Nombre de usuario del dueño:**. Escribí el usuario y apretá **Enter**.
5. Según el caso:

   **Si el usuario existe y es dueño:**
   - Te pide **Contraseña nueva:**. Al escribir, no se ven los caracteres: es normal.
   - Te pide **Repetí la contraseña:**. Escribila de nuevo.
   - Si no coinciden, aparece "Las contraseñas no coinciden." y vuelve a pedir la contraseña.

   **Si el usuario no existe:**
   - Te pide **Nombre completo:** (por ejemplo, "Dora Dueña").
   - Después te pide la contraseña nueva, dos veces, como arriba.
   - El comando crea al dueño.

   **Si el usuario existe pero no es dueño:**
   - El comando no cambia nada y muestra: "El usuario [nombre] existe pero no es dueño (es [rol]). No se cambió nada." Este comando no sube a nadie de rol.

6. Si todo sale bien, aparece uno de estos avisos:
   - "Listo: se cambió la contraseña de [usuario]. Sus sesiones abiertas se cerraron." Si el dueño estaba desactivado, dice además que se reactivó.
   - "Listo: se creó el dueño [usuario]." (cuando el usuario no existía).

7. Entrá al sistema con el usuario y la contraseña nueva ([guía 01](01-entrar-al-sistema.md)).

## Puntos a tener en cuenta

- **Cada campo tiene tres intentos.** Si te equivocás tres veces seguidas en el mismo campo (por ejemplo, el usuario), el comando termina y no cambia nada. Volvé a correrlo.
- **La contraseña que elegís acá no pide cambio.** Como la elegís vos en la PC, el sistema no te obliga a cambiarla al entrar.
- **Se cierran las sesiones abiertas** del dueño, en todos los dispositivos.
- **Queda registrado** en la auditoría del sistema, como un cambio hecho desde la consola de la PC.
- **La contraseña nunca se escribe en la línea de comandos**, para que no quede en el historial de la consola. Por eso el comando la pide después, en un paso aparte.
