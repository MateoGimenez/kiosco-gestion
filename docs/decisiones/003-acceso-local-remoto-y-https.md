# ADR 003 — Acceso local y remoto, HTTPS y cookie de sesión

- **Estado:** aceptado
- **Fecha:** 2026-11-18
- **Etapa:** 1 (Base y login), paso 1.1. Se revisa con la instalación real en la etapa 9.
- **Cierra:** **H-01** (cómo sabe el servidor que un pedido viene de afuera) y **PA-39** (HTTPS dentro del local y cookie de sesión).
- **Autores:** `seguridad` (análisis) y `arquitecto` (redacción y contrato).
- **Relacionado:** `requisitos.md` sección 3, USR-07, NF-08 y NF-14 a NF-17; `relevamiento.md` ("Etapa 1: decisiones de acceso local/remoto"); ADR 001 (mismo origen, sin CORS); `docs/api/README.md`; `docs/api/auth-usuarios.md`.

## Contexto

- El sistema corre en **una PC con Windows** en el kiosco. Entran: la PC del mostrador, tablets y celulares por el **WiFi del local** (que es **solo del personal**: no hay WiFi para clientes) y, desde la etapa 9, el dueño y el encargado **desde afuera con Tailscale**.
- Desde afuera **no** se puede: vender ni anular ventas, manejar la caja (abrir, cerrar, ingresos y salidas), pagar a un proveedor con efectivo de la caja, crear usuarios ni resetear contraseñas. **Sí** se puede: cambiar la configuración, aumentos masivos, importar Excel, agregar notas a cierres de caja y todo lo demás que el rol permita. El empleado **no entra** desde afuera.
- La sesión dura **12 h** adentro y **4 h** desde afuera.
- **Regla fija (NF-17):** la venta en la PC del mostrador **nunca** depende de internet ni de Tailscale.
- El problema técnico: `tailscale serve` es un proxy que corre **en la misma PC**, así que la API ve los pedidos de afuera como si vinieran de `127.0.0.1`, **igual que el mostrador**. Mirar solo la IP no alcanza.

## Decisión (resumen)

1. La API escucha en **dos puertas** separadas: la **local** (HTTP) y la **remota** (solo para `tailscale serve`, HTTPS hacia afuera). **La puerta decide** si el pedido es local o remoto; nunca un encabezado.
2. En la puerta local, además, la **IP real del socket** tiene que estar en las redes del local (`LOCAL_CIDRS`); si no, se rechaza.
3. **PA-39 = opción c):** adentro HTTP con cookie sin `Secure`; afuera HTTPS con cookie `Secure`. Cada puerta tiene **su propia cookie**.
4. Contra pedidos falsos desde otras páginas (CSRF): cookie `SameSite=Strict` + encabezado **`X-Kiosco: 1`** + **`Origin`** válido en todo pedido que cambia datos. Contra "DNS rebinding": se valida el **`Host`**.
5. Cada ruta declara **`access: 'any' | 'local'`**. Es obligatorio y un test falla si falta.
6. La API **no arranca** si la configuración de redes es peligrosa (fail-closed).

## 1. Las dos puertas

| | Puerta **local** | Puerta **remota** |
|---|---|---|
| Para quién | PC del mostrador y WiFi del local | Celulares del dueño y del encargado, desde afuera (etapa 9) |
| Escucha en | `LOCAL_BIND:LOCAL_PORT` (por defecto `0.0.0.0:3000`) | `REMOTE_BIND:REMOTE_PORT` (por defecto `127.0.0.1:3001`), **solo loopback** |
| Quién le habla | El navegador, directo | **Solo** `tailscale serve --bg --https=443 http://127.0.0.1:REMOTE_PORT` |
| Protocolo que ve el navegador | HTTP | HTTPS (certificado de Tailscale) |
| Clasificación | `local`, **si** la IP del socket está en `LOCAL_CIDRS`; si no, `403 NETWORK_NOT_ALLOWED` (no se "degrada" a remoto) | **Todo** es `remote`, sin excepción |
| Prendida | Siempre | Solo con `REMOTE_ENABLED=true` (desde la etapa 9) |

- Es **un solo proceso de Node** con dos `listen` (ADR 001 punto 4): `createApp({ channel })` se llama una vez por puerta. El código ya está armado así (`apps/api/src/server.ts`).
- La puerta local **arranca aunque Tailscale no exista o esté caído**: no depende de nada externo.
- **Por qué dos puertas y no "por IP":** con `tailscale serve` la IP no distingue al mostrador de un celular de afuera (los dos son `127.0.0.1`). Con dos puertas, lo que llega a la remota **solo pudo pasar por Tailscale**, porque escucha en loopback y únicamente `tailscale serve` apunta ahí.
  - **Pro:** imposible de falsificar con encabezados; simple de probar (se elige la puerta al armar la app en el test).
  - **Contra:** un puerto más que configurar en la etapa 9.

## 2. Cómo se clasifica un pedido (H-01)

Un middleware, **el primero de todos**, fija `req.access` (`'local'` o `'remote'`) según la puerta. Todo lo demás (`requireLocal`, el login, la auditoría) **solo lee** ese valor.

Reglas:
- `app.set('trust proxy', false)` siempre. **No hay variable** para cambiarlo.
- **Nunca** se usan `req.ip`, `X-Forwarded-For`, `Forwarded`, `X-Real-IP` ni `Tailscale-User-*` para decidir nada. En la puerta remota esos encabezados se guardan **solo para la auditoría** (punto 8).
- En la puerta local se toma `req.socket.remoteAddress` y se normaliza con **`ipaddr.js`** (`ipaddr.process`, que convierte `::ffff:192.168.1.5` en `192.168.1.5`), quitando antes el sufijo de zona (`fe80::1%12` → `fe80::1`). Se compara contra cada rango de `LOCAL_CIDRS` con `match` de CIDR, **nunca** con `startsWith` ni comparando textos.
- Si la dirección no se puede interpretar → se trata como **fuera** de `LOCAL_CIDRS` (403).
- Un rechazo por red queda en la auditoría (`ACCESS_DENIED`, punto 8).

## 3. Validación de la configuración al arrancar (fail-closed)

La API **no arranca** (mensaje claro, sin mostrar valores secretos) si:

| Variable | Rechazo |
|---|---|
| `LOCAL_CIDRS` | Definida pero vacía o mal formada; incluye `0.0.0.0/0` o `::/0`; se superpone con la red de Tailscale (`100.64.0.0/10` o `fd7a:115c:a1e0::/48`). |
| `LOCAL_ALLOWED_HOSTS` | Definida pero vacía; algún valor con esquema, puerto o `/` (solo nombres o IP). |
| `REMOTE_BIND` | No es loopback (`127.0.0.1` o `::1`). |
| `REMOTE_HOST` | Falta con `REMOTE_ENABLED=true`; no es un nombre de host válido; es una IP; o figura también en `LOCAL_ALLOWED_HOSTS`. |
| `REMOTE_PORT` | Igual a `LOCAL_PORT`. |
| `JWT_SECRET` | Menos de 32 bytes o valor de ejemplo (ya implementado). |
| `SESSION_HOURS` / `REMOTE_SESSION_HOURS` | Fuera de 1 a 12 (USR-07: "hasta 12 horas"), o la remota mayor que la local. |
| `BCRYPT_COST` | Fuera de 10 a 14. Solo con `NODE_ENV=test` se acepta desde 4 (tests rápidos). |
| `LOGIN_*` | Fuera de rango (punto 7). |

Si `LOCAL_CIDRS` o `LOCAL_ALLOWED_HOSTS` **no están definidas**, se usan los valores por defecto, que son los **más cerrados**: solo la propia PC (loopback). Así un `.env` incompleto nunca abre de más; a lo sumo deja a las tablets afuera.

## 4. HTTPS y cookie de sesión (PA-39)

### Opciones evaluadas

| Opción | Qué es | Veredicto |
|---|---|---|
| a) Tailscale también adentro | Todos entran por el nombre `*.ts.net` con HTTPS. | **Descartada.** Rompe H-01 (adentro y afuera se ven iguales) y hace depender el mostrador de Tailscale, contra NF-17. |
| b) HTTPS en el local con certificado propio | Una autoridad certificante propia instalada en cada tablet y celular. | **Descartada por ahora.** Hay que instalar y renovar el certificado en cada dispositivo; mucho trabajo para el cliente. Queda como **mejora futura**: solo cambia configuración (cookie `Secure` también adentro), no la lógica. |
| c) HTTP adentro, HTTPS afuera | Cada puerta con su protocolo y su cookie. | **Elegida.** Lo más simple que cumple NF-15 y NF-17. |

### Cookies

| | Puerta local (y desarrollo) | Puerta remota |
|---|---|---|
| Nombre | `kiosco_sid` | `__Host-kiosco_sid` |
| `HttpOnly` | Sí | Sí |
| `Secure` | **No** (es HTTP) | **Sí** |
| `SameSite` | `Strict` | `Strict` |
| `Path` | `/` | `/` |
| `Domain` | Sin `Domain` | Sin `Domain` (lo exige el prefijo `__Host-`) |
| `Max-Age` y vencimiento del JWT | `SESSION_HOURS` (12 h) | `REMOTE_SESSION_HOURS` (**4 h**) |

- **Cada puerta lee solo su cookie.** El JWT lleva `ch: 'local' | 'remote'` y se compara con la puerta: un token de una puerta no sirve en la otra (`401`).
- `Secure` se decide **por la puerta**, nunca por `NODE_ENV`. Los nombres de cookie **no son configurables** a propósito.
- La sesión dura un tiempo fijo desde el login (no se "estira" con el uso): 12 h o 4 h, o hasta cerrar sesión.
- **Contenido del JWT** (firmado HS256 con `JWT_SECRET`; al verificar se fija `algorithms: ['HS256']`): `sub` (id del usuario), `tv` (`tokenVersion`), `ch` (puerta), `iat`, `exp`. **Nada más**: ni rol, ni nombre, ni datos sensibles.
- **En cada pedido** con sesión se lee el usuario de la base (es local y rápido) y se exige: que exista, `isActive = true`, `tokenVersion` igual a `tv`, `ch` igual a la puerta y, en la puerta remota, que su rol **no** sea `EMPLOYEE`. Si algo falla → `401 UNAUTHENTICATED` y se borra la cookie. Así un cambio de rol, una desactivación o un reseteo de contraseña valen **al instante**.
- `helmet`: en la puerta local, sin HSTS y sin `upgrade-insecure-requests` (ya implementado); en la remota, con HSTS. CSP sin fuentes externas (`default-src 'self'`, sin `https:` en `font-src`, `style-src` ni `img-src`): el frontend no carga nada de internet.
- **En desarrollo:** Vite en `http://localhost:5173` con proxy de `/api` a la puerta local (mismo origen, ADR 001). Se usa la cookie local.

### Riesgo de la cookie sin `Secure` en el WiFi y cómo se mitiga

Por HTTP, alguien **conectado al WiFi del local** que espíe el tráfico podría ver la cookie. Mitigaciones:
- El WiFi es **solo del personal** (no hay WiFi para clientes): WPA2 o WPA3 con clave fuerte, que se **cambia cuando se va un empleado** (manual de la etapa 8).
- `LOCAL_CIDRS` lleva solo la subred de ese WiFi.
- Las tareas sensibles (usuarios, configuración) se recomiendan desde la PC del mostrador, que usa `localhost` (el tráfico no sale de la PC).
- Si en el futuro hay WiFi para clientes, tiene que ser una **red de invitados aislada**, fuera de `LOCAL_CIDRS`. Si eso no se puede garantizar, se pasa a la opción b).

## 5. Pedidos falsos desde otras páginas (CSRF) y control de `Host`

Sin token CSRF de doble envío; alcanzan cuatro capas, todas obligatorias:

1. **Cookie `SameSite=Strict`.**
2. **`X-Kiosco: 1`** obligatorio en **todo** `POST`, `PUT`, `PATCH` y `DELETE` (incluido el login). Una página ajena no puede mandar un encabezado propio sin pedir permiso al servidor (CORS), y el servidor **no tiene CORS** (ADR 001): el permiso nunca se da. Funciona igual para JSON y para subidas de archivos (multipart).
3. **`Origin`** obligatorio en esos mismos métodos, y tiene que coincidir con la puerta:
   - Puerta local: `Origin` = `http://` + el `Host` del pedido (mismo origen exacto, con puerto).
   - Puerta remota: `Origin` = `https://` + `REMOTE_HOST` (exacto, sin puerto).
   Si falta o no coincide → `403 CSRF_CHECK_FAILED` (igual que si falta `X-Kiosco`).
4. **`GET` y `HEAD` nunca cambian datos.** Es una regla de diseño de todas las rutas (no se protegen con las capas 2 y 3).

**Control de `Host` (contra "DNS rebinding")**, en **todos** los pedidos, `GET` incluidos, y antes que cualquier otra cosa salvo la clasificación de puerta:
- Puerta local: el nombre del `Host` (sin el puerto) tiene que estar en `LOCAL_ALLOWED_HOSTS`. Las IPv6 se comparan sin corchetes.
- Puerta remota: el `Host` tiene que ser `REMOTE_HOST`. **A verificar en la etapa 9** qué `Host` reenvía `tailscale serve`; si lo reescribe, se ajusta solo esta comparación (el `Origin` del navegador no cambia y sigue protegiendo).
- Si no coincide → `403 HOST_NOT_ALLOWED`.

**Sin CORS:** no se instala `cors` ni se responde nunca `Access-Control-Allow-*`. Un test lo verifica (un `OPTIONS` con `Origin` ajeno no recibe esos encabezados).

### `Content-Type` y la tensión con los adjuntos (decidido)

`docs/api/README.md` proponía exigir `Content-Type: application/json` en **todo** pedido que cambia datos, como defensa CSRF. Pero en la etapa 5 hay **adjuntos** (fotos de facturas) que viajan como `multipart/form-data`. Decisión:

| Regla | Dónde aplica | Error |
|---|---|---|
| `X-Kiosco: 1` + `Origin` válido | **Todos** los métodos que cambian datos, sin excepción | `403 CSRF_CHECK_FAILED` |
| Si el pedido **trae cuerpo**, `Content-Type: application/json` | Rutas JSON (todas, salvo las que se declaran de subida) | `415 UNSUPPORTED_MEDIA_TYPE` |
| `Content-Type: multipart/form-data` | Solo las rutas que declaran `body: 'multipart'` (etapa 5) | `415 UNSUPPORTED_MEDIA_TYPE` |
| Tamaño del cuerpo | JSON: 100 KB. Multipart: `UPLOAD_MAX_MB` (etapa 5) | `413 PAYLOAD_TOO_LARGE` |

- La protección CSRF la dan `X-Kiosco` + `Origin`; el `Content-Type` ya **no** es una defensa, solo asegura que el cuerpo se interprete bien. Por eso un pedido **sin cuerpo** (por ejemplo, logout) no necesita `Content-Type`.
- El cliente del frontend (`apps/web/src/lib/api.ts`) ya manda `X-Kiosco: 1` y `Content-Type: application/json` en todo pedido que cambia datos. Para las subidas (etapa 5) se agrega una función aparte que manda `FormData` con `X-Kiosco` y **sin** fijar `Content-Type` (el navegador lo arma).
- **Pros:** una sola regla de seguridad para todo; las subidas no necesitan excepciones de seguridad. **Contra:** cada ruta de subida tiene que declararse (es parte de la declaración del punto 6).

### Orden de los controles en cada pedido

1. Puerta + red (`req.access`; `403 NETWORK_NOT_ALLOWED`).
2. `Host` (`403 HOST_NOT_ALLOWED`).
3. `helmet` y registro del pedido.
4. Si cambia datos: `X-Kiosco` y `Origin` (`403 CSRF_CHECK_FAILED`).
5. Cuerpo: tipo y tamaño (`415`, `413`, `400` si el JSON está roto).
6. Sesión, si la ruta la pide (`401 UNAUTHENTICATED`).
7. Rol (`403 FORBIDDEN`).
8. Puerta de la ruta: si es `access: 'local'` y el pedido es remoto → `403 LOCAL_ONLY`.
9. Validación del pedido con Zod (`400`) y reglas de negocio (`409`, `422`).

El rol va antes que la puerta: a quien nunca puede hacer algo se le dice `FORBIDDEN`, no "hacelo desde el local".

## 6. Qué se permite por puerta

**Cada ruta declara `access: 'any' | 'local'`** (además de si pide sesión y qué roles). Es **obligatorio**: un test recorre todas las rutas registradas en la app y **falla si alguna no lo declara**. Así nadie puede agregar una ruta de caja olvidándose del bloqueo. Sugerencia para backend: un helper tipo `route({ auth: 'session' | 'public', access, roles, body })` que marca el middleware, y el test revisa la pila de rutas de Express.

| Acción | Puerta local | Puerta remota | Cómo se bloquea |
|---|:---:|:---:|---|
| Login de **empleado** | ✅ | ❌ | En el login: `403 LOCAL_ONLY` (solo con contraseña correcta, ver contrato). Y en cada pedido remoto se rechaza una sesión de empleado (punto 4). |
| Login de encargado o dueño | ✅ | ✅ | — |
| Vender | ✅ | ❌ | `access: 'local'` |
| Anular una venta (H-02 a) | ✅ | ❌ | `access: 'local'` |
| Abrir y cerrar la caja | ✅ | ❌ | `access: 'local'` |
| Ingresos y salidas de caja | ✅ | ❌ | `access: 'local'` |
| Pago a proveedor **con efectivo de la caja** (`CASH_REGISTER`) | ✅ | ❌ | La ruta es `access: 'any'` y **el servicio** rechaza `source = CASH_REGISTER` desde afuera con `403 LOCAL_ONLY`. Vale también para el "pagar ahora" de una compra (PA-07). Tiene test propio. |
| Pago a proveedor con otro origen (efectivo de afuera, transferencia, otro) | ✅ | ✅ | — |
| Agregar notas a un cierre de caja | ✅ | ✅ | — (no mueve plata) |
| **Crear usuarios** | ✅ | ❌ | `access: 'local'` |
| **Resetear contraseñas** | ✅ | ❌ | `access: 'local'` |
| Ver, editar y desactivar usuarios | ✅ | ✅ | — (subir de rol o reactivar desde afuera: pendiente, H-20) |
| Configuración (recargos, márgenes, redondeo, hora de corte) | ✅ | ✅ | — |
| Aumentos masivos e importar Excel | ✅ | ✅ | — |
| Precios, productos, stock, compras, proveedores, reportes | ✅ | ✅ | — |
| `owner:reset` (recuperar al dueño) | Solo en la consola de la PC | ❌ | **No existe** como ruta HTTP. |

Todo, además, según lo que permita el rol (`requisitos.md` sección 3). Los módulos marcan cada ruta con su `access` en su documento de `docs/api/`.

## 7. Login

- **Límite de intentos por usuario y por puerta:** se cuentan los fallos de cada par (nombre de usuario escrito, puerta). Con `LOGIN_MAX_ATTEMPTS` fallos dentro de `LOGIN_WINDOW_MINUTES`, ese usuario queda bloqueado **en esa puerta** por `LOGIN_LOCK_MINUTES` (`429 LOGIN_LOCKED`). Valores iniciales: 5 fallos en 15 min → 15 min de bloqueo.
  - **Por qué por puerta:** alguien de afuera no puede dejar bloqueado al dueño **en el mostrador**.
  - Se cuenta igual para nombres que no existen, así la respuesta no revela si un usuario existe.
  - Se guarda **en memoria** del proceso: es lo más simple y no necesita tabla. **Contra:** se reinicia al reiniciar la API (la PC se apaga cada noche); un atacante de afuera no puede reiniciarla. Tope de 10.000 entradas, que se limpian solas al vencer.
- **Mensajes:** usuario inexistente, contraseña incorrecta y usuario desactivado dan **la misma respuesta** (`401 INVALID_CREDENTIALS`) y tardan lo mismo (si el usuario no existe se compara igual contra un hash de relleno).
- **Empleado por la puerta remota:** `403 LOCAL_ONLY`, **solo después** de verificar la contraseña (quien no la sabe recibe el `401` de siempre y no se entera de nada).
- **bcrypt:** `bcryptjs` (ADR 001) con costo `BCRYPT_COST` (12 por defecto). En la etapa 8 se mide en la PC real: si un login tarda más de 1 segundo, se baja a 11. Los hashes guardan su propio costo, así que cambiarlo no rompe las contraseñas existentes.
- **Contraseñas:** de 8 caracteres a 72 bytes (límite de bcrypt). El mínimo está **a confirmar** con el dueño (H-22 en `requisitos.md` 7.5).
- Detalle completo de rutas, esquemas y errores: `docs/api/auth-usuarios.md`.

## 8. Auditoría de accesos

- `AuditLog` suma el campo **`channel`** (`LOCAL`, `REMOTE` o `SCRIPT`): por qué puerta se hizo cada acción (`SCRIPT` = `owner:reset` en la consola). Ver `modelo-datos.md` 2.21.
- `ipAddress`: en la puerta local, la IP real del socket ya normalizada. En la remota, el **último** valor de `X-Forwarded-For` (el que agrega `tailscale serve`), si es una IP válida; si no, la del socket. Es **informativa**: nunca se usa para decidir. Se verifica en la etapa 9.
- En los eventos de login por la puerta remota, si llega `Tailscale-User-Login`, se guarda en `details.tailscaleUser` (informativo).
- Se auditan: `LOGIN`, `LOGIN_FAILED` (con el motivo), `LOGIN_LOCKED` (una vez, al empezar el bloqueo), `LOGOUT` y `ACCESS_DENIED` (puerta local con IP fuera de `LOCAL_CIDRS`, y cada `403 LOCAL_ONLY`: sirve para ver si alguien intentó vender o manejar la caja desde un celular, por ejemplo uno perdido). El `403 LOCAL_ONLY` del login de un empleado se audita como `LOGIN_FAILED` (motivo `REMOTE_ROLE_NOT_ALLOWED`).
- Los rechazos por `Host` y por CSRF van **solo al log** del servidor (no los genera un usuario del sistema y podrían llenar la tabla).

## 9. Cómo entra cada dispositivo

| Dispositivo | Dirección | Puerta | Resultado |
|---|---|---|---|
| PC del mostrador | `http://localhost:3000` | Local, IP `127.0.0.1` / `::1` | Local |
| Tablets y celulares en el WiFi | `http://<IP fija de la PC>:3000` (reserva de IP en el router, etapa 8) | Local, IP de la subred del WiFi | Local (si la subred está en `LOCAL_CIDRS` y la IP de la PC en `LOCAL_ALLOWED_HOSTS`) |
| Celular del dueño o encargado desde afuera | `https://<nombre>.<tailnet>.ts.net` | Remota, vía `tailscale serve` | Remoto |
| Celular adentro del local que usa el nombre `*.ts.net` | `https://<nombre>.<tailnet>.ts.net` | Remota | Remoto (**esperado**: tiene las restricciones de afuera) |
| Equipo de Tailscale que apunta directo a `http://100.x.y.z:3000` | — | Local, IP `100.x` | `403 NETWORK_NOT_ALLOWED` |

Si la IP de la PC cambia (sin reserva en el router), las tablets reciben `HOST_NOT_ALLOWED`, pero **el mostrador sigue andando** por `localhost`.

## 10. "Vende sin internet": diseño y pruebas

**Por diseño:** el frontend no carga nada externo (CSP `'self'`), el backend no llama a ningún servicio de internet, `DATABASE_URL` apunta a `127.0.0.1`, y la puerta local arranca aunque Tailscale no esté.

**Tests automáticos (qa):**
- Unitarios de clasificación: `::ffff:192.168.1.5` (local), `::ffff:100.64.0.1` (rechazo), `fd7a:115c:a1e0::5` (rechazo), `::1` (local), `fe80::1%12` (según `LOCAL_CIDRS`), dirección ilegible (rechazo), y un pedido a la puerta remota con `X-Forwarded-For: 192.168.1.5` falso (sigue siendo remoto).
- Unitarios de configuración: cada rechazo de la tabla del punto 3.
- Integración (supertest): se arma la app **eligiendo la puerta** y **la IP del socket** (backend expone una forma de inyectarla solo para tests). Casos: `X-Kiosco` y `Origin` faltantes o ajenos, `Host` ajeno, `415`, `413`, cookie de una puerta usada en la otra, cookies con los atributos de la tabla del punto 4, `OPTIONS` sin encabezados CORS, una ruta `local` desde la remota (`403 LOCAL_ONLY` + auditoría), y **el test que falla si una ruta no declara `access`**.
- e2e (Playwright): el guardián "sin internet" ya existe (`e2e/fixtures.ts`): corta todo pedido a hosts que no sean `localhost`/`127.0.0.1` y falla si hubo alguno.

**Prueba manual** (cierre de la etapa 1, etapa 9 e instalación): cortar internet del router con el WiFi prendido; reiniciar la PC sin internet; detener Tailscale. En el mostrador: entrar, abrir caja, vender, anular, cerrar y ver la copia local. Repetir desde una tablet.

## 11. Variables de `.env`

| Variable | Valor por defecto | Para qué |
|---|---|---|
| `LOCAL_BIND` | `0.0.0.0` | Dónde escucha la puerta local. |
| `LOCAL_PORT` | `3000` | Puerto de la puerta local. (`PORT` se acepta como nombre viejo mientras backend lo mantenga; no se documenta más.) |
| `LOCAL_CIDRS` | `127.0.0.1/32,::1/128` | Redes que cuentan como "el local". En la instalación se agrega la subred del WiFi (ej. `192.168.1.0/24`). |
| `LOCAL_ALLOWED_HOSTS` | `localhost,127.0.0.1,::1` | Nombres o IP con los que se entra por la puerta local. En la instalación se agrega la IP fija de la PC. |
| `REMOTE_ENABLED` | `false` | Prende la puerta remota (`true` en la etapa 9). |
| `REMOTE_BIND` | `127.0.0.1` | Solo loopback. |
| `REMOTE_PORT` | `3001` | Puerto al que apunta `tailscale serve`. |
| `REMOTE_HOST` | (vacío) | Nombre `*.ts.net` de la PC. Obligatorio con `REMOTE_ENABLED=true`. |
| `SESSION_HOURS` | `12` | Sesión local (1 a 12). |
| `REMOTE_SESSION_HOURS` | `4` | Sesión remota (1 a 12, no mayor que la local). |
| `LOGIN_MAX_ATTEMPTS` | `5` | Fallos permitidos (3 a 10). |
| `LOGIN_WINDOW_MINUTES` | `15` | Ventana en la que se cuentan los fallos (1 a 60). |
| `LOGIN_LOCK_MINUTES` | `15` | Duración del bloqueo (1 a 60). |
| `BCRYPT_COST` | `12` | Costo de bcrypt (10 a 14; en tests desde 4). |
| `JWT_SECRET` | (obligatoria) | Ya definida (ADR 001). |

**No configurables a propósito:** `trust proxy` y los nombres de las cookies.

## 12. Tailscale (etapa 9): reglas y prohibiciones

- Cuenta de Tailscale **a nombre del dueño del kiosco**, con verificación en dos pasos. El desarrollador, como administrador solo durante la instalación.
- Aprobación manual de dispositivos; los celulares con vencimiento de clave.
- Reglas de acceso (ACL): solo los usuarios dueño y encargado llegan a `tag:kiosco:443`. La PC con `tag:kiosco` y **sin** vencimiento de clave.
- **Prohibido:** usar la PC como *subnet router* de la red del kiosco, como *exit node*, Tailscale **Funnel** (publicaría el sistema en internet), Tailscale SSH y la auto-aprobación de rutas.
- Tailscale en Windows en modo "unattended"; verificar que `tailscale serve --bg` sobrevive al reinicio.
- MagicDNS + HTTPS con un nombre **neutro** para la PC (los nombres de los certificados son públicos).
- Firewall de Windows: el puerto 3000 solo desde la subred del local; PostgreSQL con `listen_addresses = 'localhost'`; router sin puertos abiertos y UPnP revisado.

## Consecuencias

**A favor**
- La distinción local/remoto no se puede falsificar con encabezados y no depende de que Tailscale funcione.
- El mostrador nunca depende de internet (NF-17).
- Una sola regla CSRF para JSON y para subidas.
- Las sesiones se cortan al instante al desactivar, cambiar de rol o resetear la contraseña.
- Pasar en el futuro a HTTPS adentro (opción b) es solo configuración.

**En contra / cuidados**
- Dos puertos y algo más de configuración en la instalación (`LOCAL_CIDRS`, `LOCAL_ALLOWED_HOSTS`, `REMOTE_HOST`).
- Cada ruta nueva tiene que declarar su `access` (lo controla un test).
- Un pedido más a la base por cada pedido con sesión (leer el usuario). En una base local, despreciable.

## Riesgos residuales

| Riesgo | Mitigación |
|---|---|
| Cookie sin `Secure` en el WiFi: alguien en esa red puede espiarla. | WiFi solo del personal, WPA2/WPA3 con clave fuerte que se cambia cuando se va alguien; tareas sensibles desde la PC; opción b) a futuro. |
| La IP real de afuera depende de los encabezados de `tailscale serve`. | Solo es informativa; se verifica en la etapa 9. |
| Celular perdido con sesión remota abierta. | Sesión de 4 h; quitar el celular de Tailscale y resetear la contraseña (sube `tokenVersion` y corta la sesión). Procedimiento en el manual de la etapa 9. |
| Probar muchas contraseñas rotando nombres de usuario (el límite es por usuario). | Desde afuera solo llegan los dispositivos aprobados en Tailscale; adentro, solo el personal. Si hiciera falta, se agrega un tope total por puerta (cambio chico). |
| El contador de intentos se pierde al reiniciar la API. | Aceptado: nadie de afuera puede reiniciarla. |
| Dentro del local, quien entra por `*.ts.net` queda como remoto. | Esperado; el manual indica entrar por la IP de la PC. |

## Pendientes

- **Etapa 9:** verificar con `tailscale serve` real el `Host` que reenvía y los encabezados `X-Forwarded-For` y `Tailscale-User-Login`; ajustar solo la configuración si hace falta (riesgo R5 del plan).
- **Etapa 5:** `UPLOAD_MAX_MB` y la primera ruta `body: 'multipart'`.
- **Etapa 8:** medir `BCRYPT_COST` en la PC real; cargar `LOCAL_CIDRS` y `LOCAL_ALLOWED_HOSTS` reales; reserva de IP en el router; firewall de Windows.
