# API — Login, sesión y usuarios

> Etapa 1, paso 1.2. Requisitos: USR-01 a USR-07, CFG-06, NF-08, NF-09, NF-15, NF-16; `requisitos.md` sección 3.
> Base: contrato común (`docs/api/README.md`) y **ADR 003** (puertas, cookies, CSRF, límite de intentos).
> Modelo: `User` y `AuditLog` (`docs/modelo-datos.md` 2.1 y 2.21).
> Las reglas marcadas **"Frenar y preguntar"** (sección 6) están pendientes del dueño: backend **no** las implementa hasta que se respondan, salvo que se indique un comportamiento provisorio.

## 1. Resumen de rutas

| Método y ruta | Qué hace | Sesión | Acceso | Roles |
|---|---|:---:|:---:|---|
| `POST /api/auth/login` | Entrar | No | `any` (empleado: solo local) | Todos |
| `POST /api/auth/logout` | Salir | No (si hay, la cierra) | `any` | Todos |
| `GET /api/auth/me` | Quién soy | Sí | `any` | Todos |
| `GET /api/users` | Listar usuarios | Sí | `any` | OWNER |
| `GET /api/users/:id` | Ver un usuario | Sí | `any` | OWNER |
| `POST /api/users` | Crear usuario | Sí | **`local`** | OWNER |
| `PATCH /api/users/:id` | Editar, desactivar o reactivar | Sí | `any` | OWNER |
| `POST /api/users/:id/reset-password` | Resetear contraseña | Sí | **`local`** | OWNER |

**"Cambiar usuario"** no es una ruta: es **logout + login** (sección 3.4).

Todos los pedidos que cambian datos llevan `X-Kiosco: 1` y `Origin` válido (README 1.1). Las respuestas de `/api/auth/*` llevan `Cache-Control: no-store`.

## 2. Esquemas (van a Zod en `@kiosco/shared`)

### 2.1 Campos

| Esquema | Tipo y reglas |
|---|---|
| `UserRoleSchema` | `"OWNER"` \| `"MANAGER"` \| `"EMPLOYEE"` |
| `AccessChannelSchema` | `"LOCAL"` \| `"REMOTE"` (por qué puerta entró la sesión) |
| `UsernameSchema` | string; se le quitan espacios de los extremos y se pasa a **minúsculas**; `^[a-z0-9._-]{3,30}$` (letras sin acento, números, punto, guion y guion bajo). Es **único** entre todos los usuarios, activos o no. |
| `FullNameSchema` | string con `trim`; de 1 a 80 caracteres. |
| `PasswordSchema` (al crear o resetear) | string **sin** `trim` (los espacios cuentan); mínimo **8 caracteres** (provisorio, ver 6.4); máximo **72 bytes** en UTF-8 (límite de bcrypt). |
| `UserIdParamSchema` | `:id` entero positivo (si no, `400`). |

### 2.2 Objetos

```ts
// Lo que ve cualquier usuario de su propia sesión.
SessionUserSchema = { id: number; username: string; fullName: string; role: UserRole }

// Respuesta de login y de "quién soy".
SessionResponseSchema = {
  user: SessionUser;
  access: 'LOCAL' | 'REMOTE';   // puerta de esta sesión: el frontend oculta venta, caja, etc. si es REMOTE
  expiresAt: string;            // ISO UTC; vencimiento fijo de la sesión (12 h local, 4 h remota)
}

// Usuario visto por el dueño en el ABM. Nunca incluye passwordHash ni tokenVersion.
UserSchema = {
  id: number; username: string; fullName: string; role: UserRole; isActive: boolean;
  lastLoginAt: string | null; createdAt: string; updatedAt: string;
}

UserListResponseSchema = { items: User[] }   // lista corta, sin paginar (README punto 5)

LoginRequestSchema = {
  username: string;   // trim + minúsculas; 1 a 30 caracteres (sin validar el formato: un nombre raro da 401, no 400)
  password: string;   // 1 a 72 bytes; sin trim
}

CreateUserRequestSchema = { username: Username; fullName: FullName; role: UserRole; password: Password }

// Todos opcionales, al menos uno. Estricto: role, isActive, etc. solo por acá; nunca password.
UpdateUserRequestSchema = { username?: Username; fullName?: FullName; role?: UserRole; isActive?: boolean }

ResetPasswordRequestSchema = { newPassword: Password }

UserListQuerySchema = { isActive?: 'true' | 'false'; role?: UserRole }
```

Todos los esquemas de request son **estrictos** (campos desconocidos → `400`, README 3).

## 3. Login, logout y sesión

### 3.1 `POST /api/auth/login` — Entrar

- **Sesión:** no (pública). **Acceso:** `any`, pero un **empleado** solo entra por la puerta local. **Roles:** todos.
- **Request:** `LoginRequestSchema`.
- **Response 200:** `SessionResponseSchema` + `Set-Cookie` de la puerta (`kiosco_sid` o `__Host-kiosco_sid`, ADR 003 punto 4). Si ya había una sesión en esa puerta (otro usuario), queda reemplazada.
- **Qué hace el servidor, en orden:**
  1. Valida el formato (`400`).
  2. **Reserva el intento** (de forma atómica, antes de tocar bcrypt): si el par (usuario escrito, puerta) está **bloqueado**, o si sus fallos recientes **más los intentos en curso** ya llegan a `LOGIN_MAX_ATTEMPTS` → `429 LOGIN_LOCKED`, sin mirar la contraseña. Si se superó el tope de intentos por minuto de la puerta (`LOGIN_MAX_PER_MINUTE`) o, en la puerta local, de la IP del socket (`LOGIN_MAX_PER_MINUTE_IP`) → `429 LOGIN_RATE_LIMITED`. Así una ráfaga en paralelo no puede probar más de `LOGIN_MAX_ATTEMPTS` contraseñas.
  3. Busca el usuario por `username`. Compara la contraseña con bcrypt **siempre** (contra un hash de relleno si el usuario no existe, con el costo de los hashes guardados), así tarda lo mismo. bcrypt corre de a 2 a la vez con una cola corta: si la cola se llena → `503 SERVER_BUSY`.
  4. Usuario inexistente, contraseña incorrecta o usuario desactivado → suma un fallo y responde `401 INVALID_CREDENTIALS`. Si ese fallo llega a `LOGIN_MAX_ATTEMPTS` dentro de `LOGIN_WINDOW_MINUTES`, empieza el bloqueo de `LOGIN_LOCK_MINUTES` y responde `429 LOGIN_LOCKED` en lugar del `401`.
  5. Contraseña correcta, rol `EMPLOYEE` y puerta **remota** → `403 LOCAL_ONLY` (no suma fallo).
  6. Éxito: borra el contador de ese par, guarda `lastLoginAt`, crea la **sesión** (fila en `sessions`) y audita `LOGIN` (todo en la misma transacción) y arma la cookie con el JWT. Si el hash guardado tenía otro costo que `BCRYPT_COST`, lo recalcula. Si el pedido traía una sesión de esa puerta, la revoca.
- **Errores:**

| HTTP | `code` | Cuándo | `details` |
|---|---|---|---|
| `400` | `VALIDATION_ERROR` | Falta usuario o contraseña, o superan el largo máximo. | `fields` |
| `401` | `INVALID_CREDENTIALS` | Usuario inexistente, contraseña incorrecta o usuario desactivado. **Mismo mensaje para los tres:** "Usuario o contraseña incorrectos." | `{ "remainingAttempts": 3 }` (se calcula igual exista o no el usuario) |
| `403` | `LOCAL_ONLY` | Empleado con contraseña correcta por la puerta remota. "Tu usuario solo puede entrar desde el local." | — |
| `429` | `LOGIN_LOCKED` | Demasiados intentos fallidos con ese usuario en esa puerta. "Demasiados intentos. Probá de nuevo en N minutos." | `{ "retryAfterSeconds": 840 }` + encabezado `Retry-After` |
| `429` | `LOGIN_RATE_LIMITED` | Demasiados intentos por minuto en la puerta o desde la misma IP (puerta local). "Demasiados intentos de entrada. Esperá un momento y probá de nuevo." | `{ "retryAfterSeconds": 20 }` + encabezado `Retry-After` |
| `503` | `SERVER_BUSY` | La cola de bcrypt está llena (el sistema está ocupado). No suma fallo. "El sistema está ocupado. Probá de nuevo en unos segundos." | `{ "retryAfterSeconds": 5 }` + `Retry-After` |
| `403` | `CSRF_CHECK_FAILED`, `HOST_NOT_ALLOWED`, `NETWORK_NOT_ALLOWED` | Controles comunes (README 1.1). | — |

- **Auditoría:**

| Caso | `action` | `userId` | `details` |
|---|---|---|---|
| Éxito | `LOGIN` | el usuario | `{}` (en la remota, `tailscaleUser` si llega) |
| Fallo | `LOGIN_FAILED` | el usuario si existe; si no, `null` | Usuario existente: `{ "username": "<máx. 30>", "reason": "BAD_PASSWORD" \| "USER_INACTIVE" \| "REMOTE_ROLE_NOT_ALLOWED" }`. **Usuario inexistente:** `{ "usernameHmac": "<16 hex>", "reason": "UNKNOWN_USER" }` (ver abajo) |
| Empieza un bloqueo | `LOGIN_LOCKED` | el usuario si existe; si no, `null` | `{ "username" o "usernameHmac", "lockMinutes": 15 }`. **Máximo 1 fila por minuto** por usuario (o por IP si el nombre no existe); el resto va solo al log |
| Intento durante el bloqueo | — (solo log del servidor) | | |

  `entityType` = `User`, `entityId` = id del usuario o `null`. `channel` e `ipAddress` según ADR 003 punto 8. **Nunca** se guarda la contraseña escrita. Con `UNKNOWN_USER` **tampoco se guarda lo escrito en "usuario"** (alguien pudo pegar ahí su contraseña): se guarda `usernameHmac` = primeros 16 hex de `HMAC-SHA256(clave derivada de JWT_SECRET, lo escrito)`; sirve para ver si el mismo nombre se repite, sin poder recuperarlo. `ACCESS_DENIED` también se escribe como máximo 1 vez por minuto por usuario o IP.
- **Ejemplo:**

```http
POST /api/auth/login
X-Kiosco: 1
Origin: http://localhost:3000
Content-Type: application/json

{ "username": "Maria", "password": "********" }
```

```json
{
  "user": { "id": 3, "username": "maria", "fullName": "María Gómez", "role": "MANAGER" },
  "access": "LOCAL",
  "expiresAt": "2026-11-19T10:30:00.000Z"
}
```

### 3.2 `POST /api/auth/logout` — Salir

- **Sesión:** no hace falta (es idempotente). **Acceso:** `any`. **Roles:** todos.
- **Request:** sin cuerpo.
- **Response 204:** borra la cookie de la puerta (mismos `Path` y nombre con que se creó). Responde `204` aunque no hubiera sesión o estuviera vencida.
- **Revoca la sesión** (`sessions.revokedAt`): el token deja de valer aunque alguien lo haya copiado. Las sesiones del mismo usuario en otros dispositivos siguen abiertas. Para cortar todas, el dueño resetea la contraseña (3.5) o desactiva al usuario.
- **Errores:** solo los comunes (`403 CSRF_CHECK_FAILED`, etc.).
- **Auditoría:** `LOGOUT` (`entityType` `User`), solo si había una sesión válida.

### 3.3 `GET /api/auth/me` — Quién soy

- **Sesión:** sí. **Acceso:** `any`. **Roles:** todos.
- **Response 200:** `SessionResponseSchema` (el `role` es el actual de la base, no el del momento del login).
- **Errores:** `401 UNAUTHENTICATED` si no hay sesión o ya no es válida (sección 3.5). El frontend lo usa al abrir la app para saber si muestra el login.
- **Auditoría:** no.

### 3.4 "Cambiar usuario" (USR-07)

Es **logout + login**, sin ruta propia:
1. El botón "Cambiar usuario" llama a `POST /api/auth/logout`.
2. El frontend **borra toda la caché de datos** (TanStack Query) para que el que entra no vea nada del anterior, y muestra el login vacío.
3. El nuevo usuario entra con `POST /api/auth/login`.

- **Pro:** no hay una ruta más que proteger; la auditoría queda como `LOGOUT` + `LOGIN`. **Contra:** ninguno; si el login falla, la PC queda sin sesión (que es lo correcto en una PC compartida).
- Un carrito sin cobrar se pierde al cambiar de usuario (PA-18: no hay ventas en espera). La pantalla de venta (etapa 3) avisa antes de salir si hay un carrito armado.

### 3.5 Cuándo deja de valer una sesión

En **cada pedido** con sesión el servidor valida el JWT (firma HS256, `exp` obligatorio, `sid`), consulta la fila de `sessions` (existe, no revocada, no vencida, de esa puerta y de ese usuario) y relee el usuario (ADR 003 punto 4). La sesión deja de valer (`401 UNAUTHENTICATED` y se borra la cookie) si:

| Situación | Efecto |
|---|---|
| Pasaron 12 h (local) o 4 h (remota) desde el login | Vence |
| Logout | La sesión queda **revocada** en la base y se borra la cookie de ese dispositivo |
| El dueño **resetea la contraseña** del usuario (o `owner:reset`) | Se **revocan todas** sus sesiones (y `tokenVersion` + 1 como respaldo) |
| El dueño **desactiva** al usuario | `isActive = false`, se revocan todas sus sesiones y `tokenVersion` + 1 |
| Token sin `exp`, sin `sid` o con un `sid` que no existe | `401` |
| El dueño le cambia el rol | Vale desde el pedido siguiente, sin cortar la sesión. Si pasa a `EMPLOYEE`, sus sesiones **remotas** se cortan (un empleado no puede estar adentro desde afuera). |
| La cookie de una puerta se usa en la otra (`ch` distinto) | `401` |
| Cambia `JWT_SECRET` | Se cortan todas las sesiones de todos |

El frontend, ante un `401 UNAUTHENTICATED` en cualquier pedido, borra la caché y vuelve al login.

## 4. Usuarios (solo dueño)

Para encargado y empleado, todas estas rutas responden `403 FORBIDDEN` (README 4: no se finge que no existen).

### 4.1 `GET /api/users` — Listar

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER.
- **Query:** `UserListQuerySchema` (`isActive`, `role`; los dos opcionales). Sin paginar; orden por `fullName` ascendente.
- **Response 200:** `UserListResponseSchema`.
- **Errores:** `400` (filtro inválido), `401`, `403 FORBIDDEN`.
- **Auditoría:** no.

### 4.2 `GET /api/users/:id` — Ver uno

- **Sesión:** sí. **Acceso:** `any`. **Roles:** OWNER.
- **Response 200:** `UserSchema`.
- **Errores:** `400` (id inválido), `401`, `403 FORBIDDEN`, `404 NOT_FOUND`.
- **Auditoría:** no.

### 4.3 `POST /api/users` — Crear

- **Sesión:** sí. **Acceso:** **`local`** (decisión del dueño: desde afuera no se crean usuarios). **Roles:** OWNER.
- **Request:** `CreateUserRequestSchema`. Se puede crear cualquier rol, incluido otro `OWNER` (PA-37: puede haber más de un dueño).
- **Response 201:** `UserSchema` (`isActive: true`, `lastLoginAt: null`).
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato de usuario, nombre, rol o contraseña. |
| `403` | `FORBIDDEN` | No es dueño. |
| `403` | `LOCAL_ONLY` | Dueño por la puerta remota. "Los usuarios se crean desde el local." |
| `409` | `USERNAME_TAKEN` | Ya existe ese nombre de usuario (activo o desactivado). `details: { "field": "username" }` |

- **Auditoría:** `USER_CREATE`, `entityType` `User`, `entityId` = nuevo id, `details: { "after": { "username", "fullName", "role", "isActive" } }`. Sin contraseña ni hash.
- **Ejemplo:**

```json
{ "username": "juan.p", "fullName": "Juan Pérez", "role": "EMPLOYEE", "password": "********" }
```

```json
{
  "id": 7, "username": "juan.p", "fullName": "Juan Pérez", "role": "EMPLOYEE", "isActive": true,
  "lastLoginAt": null, "createdAt": "2026-11-18T22:30:00.000Z", "updatedAt": "2026-11-18T22:30:00.000Z"
}
```

### 4.4 `PATCH /api/users/:id` — Editar, desactivar o reactivar

- **Sesión:** sí. **Acceso:** `any` (el dueño solo bloqueó crear y resetear; ver 6.2). **Roles:** OWNER.
- **Request:** `UpdateUserRequestSchema` (al menos un campo). La contraseña **no** se cambia por acá (4.5).
- **Response 200:** `UserSchema` actualizado.
- **Desactivar** = `{ "isActive": false }` (USR-06: los usuarios no se borran). Efecto: no puede entrar y **se cortan todas sus sesiones** (se revocan en `sessions` y `tokenVersion` + 1). Sus ventas y movimientos siguen mostrando su nombre.
- **Reactivar** = `{ "isActive": true }`. Entra con la contraseña que tenía.
- **Cambiar de rol:** vale al instante (sección 3.5).
- **Errores:**

| HTTP | `code` | Cuándo |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Formato, cuerpo vacío o campo desconocido (por ejemplo `password`). |
| `403` | `FORBIDDEN` | No es dueño. |
| `404` | `NOT_FOUND` | El usuario no existe. |
| `409` | `USERNAME_TAKEN` | El nuevo nombre de usuario ya existe. |
| `422` | `LAST_ACTIVE_OWNER` | **Reservado, pendiente de 6.1:** el cambio dejaría al sistema sin ningún dueño activo (desactivar o bajar de rol al último). |

- **Auditoría:** `USER_UPDATE`, `details: { "before": {...}, "after": {...} }` **solo con los campos que cambiaron** (por ejemplo `{ "before": { "isActive": true }, "after": { "isActive": false } }`). Si no cambió nada, responde `200` sin auditar.

### 4.5 `POST /api/users/:id/reset-password` — Resetear contraseña (USR-03)

- **Sesión:** sí. **Acceso:** **`local`** (decisión del dueño). **Roles:** OWNER. Sirve para cualquier usuario, incluido otro dueño o uno mismo.
- **Request:** `ResetPasswordRequestSchema`. El dueño elige la contraseña nueva y se la pasa a la persona.
- **Response 200:** `UserSchema`.
- **Efecto:** nuevo `passwordHash` (con `BCRYPT_COST`) y `tokenVersion` + 1: **se cortan todas las sesiones** de ese usuario (la del celular perdido, por ejemplo). Si el dueño se resetea a sí mismo, también se corta la suya y vuelve al login. Revoca todas sus sesiones y borra el contador de intentos fallidos de ese usuario en las dos puertas. Renombrar a un usuario o cambiarle el rol también borra su contador.
- Funciona también sobre un usuario desactivado (queda desactivado).
- **Errores:** `400 VALIDATION_ERROR`, `403 FORBIDDEN`, `403 LOCAL_ONLY` (por la puerta remota), `404 NOT_FOUND`.
- **Auditoría:** `PASSWORD_RESET`, `entityType` `User`, `entityId` = usuario reseteado, `details: {}`. Nunca la contraseña ni el hash.

## 5. Fuera de la API: `npm run owner:reset` (USR-04)

- Script de **consola** que se corre en la PC del kiosco. **No existe** una ruta HTTP equivalente (ADR 003 punto 6).
- Pide el nombre de usuario y la contraseña nueva dos veces (sin mostrarla en pantalla; nunca por argumentos de la línea de comandos, que quedan en el historial).
  - Si el usuario **no existe**: lo crea como `OWNER` (pide también el nombre completo). Audita `USER_CREATE`.
  - Si existe y es `OWNER`: resetea la contraseña, sube `tokenVersion` y, si estaba desactivado, lo reactiva (es el procedimiento de recuperación). Audita `PASSWORD_RESET` (y `USER_UPDATE` si lo reactivó).
  - Si existe y **no** es `OWNER`: no hace nada y lo explica (no sube a nadie de rol en silencio).
- Auditoría con `channel = SCRIPT`, `userId = null`, `ipAddress = null`.
- Usa la misma validación de usuario y contraseña que la API (`UsernameSchema`, `PasswordSchema`).

## 6. Frenar y preguntar (pendientes del dueño)

| # | Pregunta | Recomendación | Mientras tanto |
|---|---|---|---|
| 6.1 (H-19) | **¿Puede quedar el sistema sin dueño activo?** No está en `requisitos.md`. | No: el **último dueño activo** no se puede desactivar ni bajar de rol (`422 LAST_ACTIVE_OWNER`). Igual existe `owner:reset` como salida de emergencia. | No se implementa hasta la respuesta (agregarlo después es chico). El código `LAST_ACTIVE_OWNER` queda reservado. |
| 6.2 (H-20) | **Desde afuera, ¿se puede subir de rol a alguien o reactivar un usuario?** El dueño bloqueó crear usuarios y resetear contraseñas; subir de rol o reactivar también "da acceso" a alguien. | Desde afuera, permitir desactivar y cambiar nombres, pero **no** subir de rol ni reactivar (`403 LOCAL_ONLY`). | `PATCH` es `any` sin restricciones extra (lo que decidió el dueño). |
| 6.3 (H-21) | **¿Cada usuario puede cambiar su propia contraseña? ¿Se obliga a cambiarla después de un reseteo?** No está en `requisitos.md`. Hoy el dueño elige y conoce la contraseña de todos. | Sí a las dos: una ruta `POST /api/auth/change-password` (pide la contraseña actual, sube `tokenVersion`) y un campo `mustChangePassword` que se activa al crear o resetear. | No se implementa. Si se aprueba, se agrega al contrato y al modelo (`User.mustChangePassword`). |
| 6.4 (H-22) | **Largo mínimo de la contraseña.** En la PC compartida se cambia de usuario muchas veces por turno. | 8 caracteres para todos (el sistema es alcanzable desde afuera). | Se usa 8. |

## 7. Notas para frontend

- Mostrar los mensajes por `code`: `INVALID_CREDENTIALS` (con `remainingAttempts` si viene), `LOGIN_LOCKED` (con los minutos de `retryAfterSeconds`), `LOCAL_ONLY` (aviso de acceso remoto).
- Con `access: "REMOTE"`: ocultar venta, anulación, caja, "crear usuario" y "resetear contraseña", y mostrar un aviso claro de acceso remoto (etapa 9). El servidor bloquea igual.
- El menú de usuarios solo aparece para `OWNER`.
