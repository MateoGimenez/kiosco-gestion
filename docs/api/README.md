# API del kiosco — contrato común

> Reglas que valen para **todas** las rutas. Cada módulo tiene su propio documento (`docs/api/<modulo>.md`) que solo agrega lo particular.
> Origen: `docs/plan.md` 2.2, ADR 001 (estructura), ADR 002 (dinero y día de trabajo) y **ADR 003** (puertas local y remota, cookie de sesión, CSRF).
> **El contrato manda:** si backend o frontend necesitan cambiarlo, lo cambia el arquitecto y se avisa a los dos.

## 1. Generalidades

- Todas las rutas empiezan con **`/api`**. Lo demás lo sirve el frontend (mismo origen, ADR 001 punto 4).
- **JSON** en request y response (`Content-Type: application/json; charset=utf-8`). Excepción: las rutas de **subida de archivos** (etapa 5), que reciben `multipart/form-data` y lo declaran en su documento.
- Encabezados obligatorios y controles de cada pedido: punto 1.1.
- **Sin versión en la ruta** (`/api/v1`): la API y las pantallas se instalan siempre juntas, desde el mismo repo. Los cambios se hacen agregando campos, no cambiando ni quitando los existentes.
- Nombres en **inglés**, en `camelCase` (campos y parámetros) y recursos en **plural** (`/api/users`, `/api/products`). Los mensajes para el usuario, en **español**.
- Los esquemas Zod de cada request y response viven en **`@kiosco/shared`**: el backend valida con ellos y el frontend los usa en formularios y para tipar respuestas. El documento de cada módulo dice el nombre de cada esquema.

### 1.1 Encabezados obligatorios y controles de cada pedido (ADR 003)

| Control | Aplica a | Si falla |
|---|---|---|
| **`Host`** del pedido en la lista de la puerta (`LOCAL_ALLOWED_HOSTS` en la local, `REMOTE_HOST` en la remota) | **Todos** los pedidos | `403 HOST_NOT_ALLOWED` |
| IP del equipo dentro de las redes del local (`LOCAL_CIDRS`) | Todos los pedidos de la **puerta local** | `403 NETWORK_NOT_ALLOWED` |
| **`X-Kiosco: 1`** | Todo `POST`, `PUT`, `PATCH` y `DELETE`, **incluido el login** | `403 CSRF_CHECK_FAILED` |
| **`Origin`** presente y del mismo sitio: `http://` + `Host` en la local; `https://` + `REMOTE_HOST` en la remota | Todo `POST`, `PUT`, `PATCH` y `DELETE` | `403 CSRF_CHECK_FAILED` |
| `Content-Type: application/json` **si el pedido trae cuerpo** | Rutas JSON (todas, salvo las de subida) | `415 UNSUPPORTED_MEDIA_TYPE` |
| `Content-Type: multipart/form-data` | Solo rutas de subida (declaradas en su documento) | `415 UNSUPPORTED_MEDIA_TYPE` |
| Tamaño del cuerpo: JSON hasta **100 KB**; subidas hasta `UPLOAD_MAX_MB` (etapa 5) | Pedidos con cuerpo | `413 PAYLOAD_TOO_LARGE` |

- Un pedido **sin cuerpo** (por ejemplo, el logout) no necesita `Content-Type`, pero sí `X-Kiosco` y `Origin`.
- `GET` y `HEAD` **nunca** cambian datos (por eso no piden `X-Kiosco` ni `Origin`).
- El cliente de la API del frontend (`apps/web/src/lib/api.ts`) ya agrega `X-Kiosco` y `Content-Type` en todo pedido que cambia datos; el navegador agrega `Origin` solo. Los tests de integración tienen que mandar los tres.
- **Sin CORS:** la API nunca responde encabezados `Access-Control-Allow-*`.
- **Orden de los controles:** puerta y red → `Host` → `X-Kiosco` y `Origin` → tipo y tamaño del cuerpo → sesión (`401`) → rol (`403 FORBIDDEN`) → puerta de la ruta (`403 LOCAL_ONLY`) → validación (`400`) → reglas de negocio (`409`, `422`).

## 2. Métodos y códigos de éxito

| Operación | Método y ruta | Éxito |
|---|---|---|
| Listar | `GET /api/<recursos>` | `200` con lista paginada (punto 5) |
| Ver uno | `GET /api/<recursos>/:id` | `200` con el objeto |
| Crear | `POST /api/<recursos>` | `201` con el objeto creado |
| Modificar (parcial) | `PATCH /api/<recursos>/:id` | `200` con el objeto actualizado; solo cambian los campos enviados |
| Acción con efectos (anular, cerrar, resetear…) | `POST /api/<recursos>/:id/<accion>` (p. ej. `/api/sales/15/void`) | `200` con el objeto actualizado |
| Sin respuesta útil (p. ej. logout) | — | `204` sin cuerpo |

- **No hay `DELETE` de datos:** los datos maestros se **desactivan** (`isActive: false` con `PATCH`) y las operaciones se **anulan** con una acción (modelo de datos 1.6).
- Los `id` son **enteros** (`"id": 15`). Un `id` que no es un entero positivo → `400`; uno que no existe → `404`.

## 3. Formato de los datos

| Tipo | En la respuesta | En el request | Ejemplo |
|---|---|---|---|
| **Dinero** | string, **siempre 2 decimales**, punto decimal, sin separador de miles | string, hasta 2 decimales (`^\d{1,12}(\.\d{1,2})?$`) | `"1440.00"` |
| **Cantidad** | string, **siempre 3 decimales** | string, hasta 3 decimales (`^\d{1,9}(\.\d{1,3})?$`) | `"0.350"`, `"2.000"` |
| **Porcentaje** (margen, recargo, IVA, descuento) | string, **siempre 2 decimales** | string, hasta 2 decimales | `"21.00"`, `"10.50"` |
| **Fecha y hora** | string ISO 8601 en **UTC** con milisegundos | igual | `"2026-11-18T22:30:00.000Z"` |
| **Fecha sin hora** (día de trabajo, fecha de factura) | string `YYYY-MM-DD` | igual | `"2026-11-18"` |
| **Enum** | string en `UPPER_SNAKE_CASE` | igual | `"OWNER"`, `"VOIDED"` |
| **Booleano** | `true` / `false`, con prefijo `is`/`has`/`can` | igual | `"isActive": true` |
| **Sin valor** | `null` (el campo **siempre está**, no se omite) | se puede omitir o mandar `null` si es opcional | `"discountReason": null` |

Reglas:
- **Dinero, cantidades y porcentajes nunca viajan como número** de JSON (ADR 002). Un número (`1440`) en esos campos → `400`.
- Valores negativos solo donde el documento del módulo lo diga (por ejemplo, un ajuste de stock); en ese caso el patrón admite un `-` inicial.
- El frontend formatea en es-AR (`$ 1.440`, `18/11/2026 19:30`) con las funciones de `shared`; la API **nunca** manda texto ya formateado.
- **Campos desconocidos** en el request → `400` (los esquemas son estrictos). Así un campo mal escrito no se ignora en silencio y nadie puede "colar" campos que no debería tocar (por ejemplo, `role` o `passwordHash`).
- Los textos se guardan sin espacios al principio y al final (`trim`). Un texto obligatorio vacío → `400`.

## 4. Errores

Todos los errores tienen **el mismo formato**:

```json
{
  "error": {
    "code": "STOCK_ADJUST_REASON_REQUIRED",
    "message": "Indicá el motivo del ajuste de stock.",
    "details": {}
  }
}
```

- `code`: identificador fijo en inglés (`UPPER_SNAKE_CASE`). **El frontend decide por `code`, nunca por `message`.**
- `message`: texto en español, listo para mostrar al usuario. Puede cambiar de redacción sin aviso.
- `details`: opcional; datos extra útiles para la pantalla. Nunca trae datos internos (consultas SQL, stack, rutas de archivos).

### Códigos HTTP

| HTTP | Cuándo | `code` común | `details` |
|---|---|---|---|
| `400` | Datos inválidos: falta un campo, formato incorrecto, campo desconocido, `id` no numérico. | `VALIDATION_ERROR` | `{ "fields": [ { "path": "items.0.quantity", "message": "Tiene que ser mayor que 0." } ] }` |
| `401` | Sin sesión, sesión vencida o invalidada (por ejemplo, después de un reseteo de contraseña). | `UNAUTHENTICATED` | — |
| `403` | Con sesión, pero el rol no tiene permiso. | `FORBIDDEN` | — |
| `403` | La acción **no se permite desde afuera del local** (ruta `access: 'local'`, pago con efectivo de la caja desde afuera, login de un empleado por la puerta remota). | `LOCAL_ONLY` | — |
| `403` | Controles de la puerta (punto 1.1): red no permitida, `Host` no permitido, falta `X-Kiosco` u `Origin`. | `NETWORK_NOT_ALLOWED`, `HOST_NOT_ALLOWED`, `CSRF_CHECK_FAILED` | — |
| `404` | El recurso o la ruta no existe. | `NOT_FOUND` | — |
| `409` | Conflicto con el estado actual (por ejemplo, ya hay una caja abierta, código de barras repetido, nombre de usuario repetido). | Específico del módulo (`CASH_SESSION_ALREADY_OPEN`) | Según el caso |
| `413` | El cuerpo del pedido supera el tamaño máximo (punto 1.1). | `PAYLOAD_TOO_LARGE` | — |
| `415` | El pedido trae cuerpo con un `Content-Type` que la ruta no acepta (punto 1.1). | `UNSUPPORTED_MEDIA_TYPE` | — |
| `422` | Los datos tienen buen formato pero rompen una **regla de negocio** (por ejemplo, el descuento no puede ser igual o mayor que el subtotal). | Específico del módulo (`DISCOUNT_TOO_HIGH`) | Según el caso |
| `429` | Demasiados intentos de login fallidos (NF-16). Detalle en `docs/api/auth-usuarios.md`. | `LOGIN_LOCKED` | `{ "retryAfterSeconds": 840 }` (y encabezado `Retry-After`) |
| `500` | Error inesperado del servidor. Se registra completo en el log; al cliente solo le llega el mensaje genérico. | `INTERNAL_ERROR` | — |
| `503` | La base de datos no responde (solo `/api/health`, y cualquier ruta si se pierde la conexión). | `DATABASE_UNAVAILABLE` | — |

Reglas:
- **400 o 422:** `400` si el problema se ve mirando **solo** el pedido (formato); `422` si hace falta mirar la base o aplicar una regla de negocio.
- **404 y permisos:** si un rol no puede ver un tipo de recurso, la respuesta es `403` (no se finge que no existe). Dentro de lo que sí puede ver, un `id` inexistente es `404`.
- **`FORBIDDEN` o `LOCAL_ONLY`:** primero se mira el rol. Si el rol nunca puede hacer la acción, es `FORBIDDEN`; si el rol puede pero no desde afuera, es `LOCAL_ONLY` (el frontend muestra el aviso de "acceso remoto").
- Los códigos específicos de cada módulo se listan en su documento, y como constante en `shared` (`ERROR_CODES`), para que el frontend no escriba strings sueltos.
- Códigos comunes que suma el ADR 003 (backend los agrega a `ERROR_CODES`): `LOCAL_ONLY`, `NETWORK_NOT_ALLOWED`, `HOST_NOT_ALLOWED`, `CSRF_CHECK_FAILED`, `LOGIN_LOCKED`. `PAYLOAD_TOO_LARGE` y `UNSUPPORTED_MEDIA_TYPE` ya existen.

## 5. Listas, filtros y paginación

Request:

```
GET /api/products?page=1&pageSize=50&search=coca&isActive=true&sortBy=name&sortOrder=asc
```

| Parámetro | Default | Regla |
|---|---|---|
| `page` | `1` | Entero ≥ 1. |
| `pageSize` | `50` | Entero entre 1 y 200. |
| `sortBy` / `sortOrder` | Los define cada módulo | `sortOrder` = `asc` o `desc`. Solo campos permitidos por el módulo. |
| Filtros | — | Por nombre de campo (`isActive=true`, `role=EMPLOYEE`). Rangos de fechas con `from` y `to`, **ambos incluidos**, en `YYYY-MM-DD` (días de trabajo en ventas y caja). |

Response:

```json
{
  "items": [ { "id": 1, "name": "Coca-Cola 500 ml" } ],
  "page": 1,
  "pageSize": 50,
  "total": 132
}
```

Las listas cortas y fijas (por ejemplo, medios de pago o categorías para un desplegable) pueden devolverse sin paginar, como `{ "items": [...] }`; el documento del módulo lo aclara.

## 6. Sesión, permisos y respuestas según el rol

- La sesión viaja en una **cookie `httpOnly`** (el JavaScript de la página no la puede leer). La API **no** usa el encabezado `Authorization`. Cada puerta tiene la suya (ADR 003 punto 4):
  - puerta local: `kiosco_sid`, `SameSite=Strict`, sin `Secure`, **12 h** (`SESSION_HOURS`);
  - puerta remota: `__Host-kiosco_sid`, `SameSite=Strict`, `Secure`, **4 h** (`REMOTE_SESSION_HOURS`).
- **Todas las rutas requieren sesión**, salvo `POST /api/auth/login`, `POST /api/auth/logout` y `GET /api/health`.
- **Cada ruta declara `access: 'any' | 'local'`** (ADR 003 punto 6). Es obligatorio: un test falla si una ruta no lo declara.
- **Los permisos se verifican en el servidor, en cada ruta**, según el rol (`EMPLOYEE`, `MANAGER`, `OWNER`; `requisitos.md` sección 3). Ocultar un botón en la pantalla **no** es un permiso.
- Lo que no se puede hacer desde afuera (vender, anular ventas, caja, pagos a proveedor con efectivo de la caja, crear usuarios, resetear contraseñas) lleva `access: 'local'` o un control en el servicio, y responde `403 LOCAL_ONLY`. La tabla completa está en el ADR 003 punto 6. `GET /api/auth/me` devuelve `access` (`LOCAL` o `REMOTE`) para que el frontend oculte lo que no corresponde; ocultarlo es solo comodidad, el bloqueo real es del servidor.
- **Las respuestas se arman según el rol:** cada módulo define qué campos ve cada rol. Por ejemplo, **el costo nunca viaja a un empleado** (PA-03), ni siquiera oculto. El backend arma la respuesta campo por campo con el esquema del rol; **nunca** devuelve el objeto de la base tal cual (así `passwordHash` u otros campos internos no pueden salir por error).

## 7. Operaciones "todo o nada" y reintentos

- Cada pedido que cambia datos se guarda en **una sola transacción** (NF-11): o se guarda todo, o nada. Si devuelve error, no quedó nada a medias.
- Los `POST` **no son seguros de reintentar** a ciegas: reintentar una venta podría duplicarla. El frontend deshabilita el botón mientras espera la respuesta. Si algún módulo necesita reintentos seguros (por ejemplo, cobrar con WiFi inestable), su contrato define una clave de idempotencia (`Idempotency-Key`); se decide en la etapa 3 (ventas).
- Lo que calcula la pantalla (totales, recargos, precio sugerido) es solo para mostrar: **el servidor recalcula todo** con las funciones de `shared` y guarda su resultado (ADR 002).

## 8. Auditoría

Las acciones sensibles (NF-08) guardan un registro en `AuditLog` con quién, cuándo, qué, **por qué puerta** (`channel`: `LOCAL`, `REMOTE` o `SCRIPT`), desde qué IP y los valores antes/después, **en la misma transacción** que la acción. El documento de cada módulo indica qué rutas auditan y con qué `action`. Los rechazos `403 LOCAL_ONLY` y `403 NETWORK_NOT_ALLOWED` se auditan como `ACCESS_DENIED` (ADR 003 punto 8). Nunca se guardan contraseñas, hashes ni tokens.

## 9. Ruta de salud

`GET /api/health` — sin sesión, `access: 'any'`. La usan el instalador, el servicio de Windows y los tests para saber si el sistema está listo.

| Situación | Respuesta |
|---|---|
| API y base de datos andando | `200` `{ "status": "ok" }` |
| La base no responde | `503` `{ "error": { "code": "DATABASE_UNAVAILABLE", "message": "No se puede conectar con la base de datos." } }` |

No devuelve versiones, nombres de servidor ni otros datos internos.

## 10. Plantilla para los documentos de cada módulo

Cada `docs/api/<modulo>.md` describe cada ruta así:

```markdown
### POST /api/<recursos>/:id/<accion> — Qué hace

- **Sesión:** sí / no (pública)
- **Acceso:** `any` / `local` (ADR 003)
- **Roles:** OWNER, MANAGER
- **Request:** `NombreDelEsquemaZod` (campos, tipo, obligatorio, reglas)
- **Response 200:** `NombreDelEsquemaZod` (y qué campos cambian según el rol)
- **Errores:** `422 CODIGO` cuándo; `409 CODIGO` cuándo
- **Auditoría:** `ACTION` con qué valores antes/después
- **Ejemplo:** request y response en JSON
```

## Módulos

| Documento | Etapa |
|---|---|
| [`auth-usuarios.md`](auth-usuarios.md) — login, logout, sesión, cambiar usuario, usuarios | 1 |
| (los demás se agregan en cada etapa) | 2 a 9 |
