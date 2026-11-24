# Changelog

Lo que se agrega en cada etapa del proyecto. El plan completo está en [`docs/plan.md`](docs/plan.md).

## Etapa 1: Base y login (en cierre)

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
