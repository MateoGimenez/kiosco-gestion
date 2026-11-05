# Requisitos del sistema – Kiosco (versión 1)

> **Estado:** borrador para aprobación del dueño (Fase 2).
> **Fuente única de reglas de negocio:** `docs/relevamiento.md`.
> Lo que no está definido ahí **no se inventa**: figura como **PA-xx** en la sección 7 "Preguntas abiertas".

## Cómo leer este documento

- Cada requisito tiene un código: `VEN` ventas, `STK` stock y productos, `PRV` proveedores, `COM` compras, `PRE` precios, `CAJ` caja, `USR` usuarios, `REP` reportes, `CFG` configuración, `NF` no funcionales.
- La columna **Origen** dice de dónde sale cada requisito:
  - **R1 a R6**: ronda del relevamiento donde lo decidió el dueño.
  - **Propuesta**: lo propone el arquitecto porque hace falta para que el sistema funcione bien (por ejemplo, no borrar ventas). No es una regla del negocio: **se valida al aprobar este documento**.
  - **PA-xx**: depende de una pregunta abierta.

---

## 1. Resumen del sistema

Sistema web para gestionar un kiosco de **una sola sucursal**. Corre en la **PC del mostrador** (servidor local) y funciona **sin internet**. Desde esa PC se vende con lector de código de barras y teclado; tablets y celulares se conectan por el WiFi del local con el navegador. El dueño también puede entrar **desde afuera del local** (casa, calle) con su celular, a través de un acceso remoto seguro hacia la PC del kiosco (etapa aparte, al final).

Cubre: ventas (punto de venta), stock y productos, proveedores, compras, precios, caja por turno, usuarios con roles, reportes con exportación a Excel y configuración.

**No hay fiado:** no existe cuenta corriente de clientes ni registro de clientes (R5).

## 2. Alcance de la versión 1

### Entra en la versión 1

- Punto de venta con lector USB y búsqueda por nombre, productos por unidad y por peso (kg).
- Pago mixto (varios medios en una venta), recargo configurable por medio de pago, descuento manual con permiso.
- Anulación de venta completa (dueño o encargado).
- Stock con historial de movimientos, stock mínimo, lista "para reponer", ajustes con motivo, venta sin stock con aviso.
- Categorías y subcategorías.
- Proveedores, cuenta corriente con proveedores, pedido sugerido para copiar o mandar por WhatsApp.
- Compras cargadas a mano con adjunto (foto o archivo de la factura/remito).
- Precios con margen por producto o por categoría, redondeo configurable, aumentos masivos por proveedor y por categoría, historial de precios.
- Caja por turno con cierre a ciegas y movimientos de caja.
- Usuarios con tres roles (empleado, encargado, dueño).
- Reportes con filtro de fechas y exportación a Excel.
- Copias de seguridad automáticas y registro de auditoría.
- **Acceso remoto seguro del dueño** desde fuera del local (tipo Tailscale o Cloudflare Tunnel). Se hace como **etapa aparte, al final** del desarrollo (R6). Detalles pendientes: PA-01.

### Queda afuera de la versión 1

| Tema | Situación |
|---|---|
| Facturación electrónica ARCA | **Futuro.** El modelo de datos queda preparado (ver `docs/modelo-datos.md`). (R6) |
| Integración con la API de Mercado Pago | Futuro posible. Hoy solo se registra el medio de pago. (R1) |
| Lectura automática de facturas de compra | Futuro posible. Hoy la carga es manual con adjunto. (R3) |
| Impresión de tickets | No se imprime. (R1) |
| Promociones automáticas | No por ahora. (R1) |
| Devoluciones parciales | No: solo se anula la venta completa. (R1) |
| Control de vencimientos | No se controlan. (R2) |
| Fiado / clientes | **No existe** y no está planificado. (R5) |
| Varias sucursales | Hay una sola. El diseño no lo impide a futuro. (R6) |
| Servidor en la nube | No: el servidor y los datos quedan en la PC del kiosco. El acceso remoto es un "túnel" seguro hacia esa PC, no una copia en internet. (R6) |

## 3. Roles y permisos

Tres roles fijos: **Empleado**, **Encargado** y **Dueño** (R5). Matriz aprobada en el relevamiento:

| Acción | Empleado | Encargado | Dueño |
|---|:---:|:---:|:---:|
| Vender, abrir y cerrar su caja | ✅ | ✅ | ✅ |
| Aplicar descuento manual | ❌ | ✅ | ✅ |
| Anular una venta | ❌ | ✅ | ✅ |
| Ver la diferencia del arqueo | ❌ | ✅ | ✅ |
| Registrar salidas de caja (gastos, pagos a proveedor) | ❌ | ✅ | ✅ |
| Cargar compras y ajustar stock (roturas, faltantes) | ❌ | ✅ | ✅ |
| Cambiar precios y hacer aumentos masivos | ❌ | ✅ | ✅ |
| Proveedores, pedidos y pagos a proveedores | ❌ | ✅ | ✅ |
| Ver reportes de ventas | ❌ | ✅ | ✅ |
| Ver costos, ganancia y stock valorizado | ❌ | ❌ | ✅ |
| Usuarios y configuración (recargos, márgenes, redondeo) | ❌ | ❌ | ✅ |

Notas:

- Los permisos se controlan **en el servidor**, no solo ocultando botones en la pantalla (Propuesta).
- Hay un punto a aclarar: el encargado **carga compras** (con costo) y **cambia precios** (el precio sugerido sale del costo), pero **no puede "ver costos"**. Ver **PA-03**.
- Registrar **ingresos** de efectivo a la caja no figura en la matriz. Ver **PA-29**.
- Quién puede crear o editar categorías y subcategorías no figura en la matriz. Ver **PA-33**.

---

## 4. Requisitos por módulo

### 4.1 Ventas / punto de venta (VEN)

| ID | Requisito | Origen |
|---|---|---|
| VEN-01 | Agregar un producto a la venta leyendo su código de barras con un lector USB (el lector "escribe" el código y un Enter, como un teclado) o tipeando el código a mano. | R1 |
| VEN-02 | Buscar productos por nombre, para los que no tienen código de barras. | R1 |
| VEN-03 | Antes de cobrar se puede cambiar la cantidad de una línea o quitarla. | Propuesta |
| VEN-04 | Productos por peso: la cantidad se expresa en kg (hasta 3 decimales, o sea, gramos) y el precio es por kg. Cómo se ingresa el peso: PA-09. | R2, PA-09 |
| VEN-05 | Cobrar con uno o más medios de pago en la misma venta (pago mixto): efectivo, transferencia, QR (Mercado Pago), tarjeta de débito y tarjeta de crédito. | R1 |
| VEN-06 | Aplicar automáticamente el recargo del medio de pago (hoy solo crédito, aprox. 10%; débito sin recargo). El porcentaje se configura sin tocar código. | R1 |
| VEN-07 | Aplicar un descuento manual a la venta, solo usuarios con permiso (encargado y dueño). Forma del descuento: PA-15. | R1, R5 |
| VEN-08 | Si se vende un producto sin stock suficiente, el sistema **avisa pero deja vender**, y el stock queda negativo. | R2 |
| VEN-09 | No se imprime ticket. La venta queda registrada con fecha y hora, usuario, caja, productos, cantidades, precios, descuento, recargo y medios de pago. | R1 |
| VEN-10 | Anular una venta **completa**, solo encargado o dueño. Pide un motivo (Propuesta). La venta no se borra: queda marcada como anulada, el stock vuelve y queda en auditoría. | R1, R5 |
| VEN-11 | Calcular y mostrar el vuelto cuando se paga en efectivo (solo en pantalla, no se guarda). | Propuesta |
| VEN-12 | Cada venta queda asociada a la caja abierta del turno. Cuántas cajas puede haber abiertas y quién vende en cada una: PA-02. | R4, PA-02 |

**Reglas de negocio de ventas**

1. **Pago mixto:** la suma de lo pagado con cada medio (sin contar recargos) tiene que ser igual al total de la venta después del descuento. (R1)
2. **Recargo:** cada medio de pago tiene su % de recargo (0% si no tiene). El recargo se calcula sobre la parte pagada con ese medio. Si se calcula antes o después del descuento: PA-14. Si hay recargo por cuotas: PA-12. (R1)
3. **"Foto" de precios:** cada línea de venta guarda el precio de venta y el costo **de ese momento**. Si después cambian el precio o el costo, las ventas viejas y su ganancia no cambian. Lo mismo con el % de recargo usado. (Propuesta)
4. **Sin promociones automáticas** y **sin devoluciones parciales**. (R1)
5. **Anulación:** la venta pasa a estado "anulada", se registra quién, cuándo y por qué, y el stock de cada producto vuelve. Qué pasa con el efectivo si la venta era de un turno ya cerrado: PA-17. (R1)
6. **Venta sin stock:** el aviso no bloquea la venta. (R2)

### 4.2 Stock y productos (STK)

| ID | Requisito | Origen |
|---|---|---|
| STK-01 | Alta y edición de productos: nombre, código de barras (opcional y único), unidad de venta (unidad o kg), categoría y subcategoría, proveedor habitual (PA-04), costo, margen propio (opcional), precio de venta y stock mínimo. | R2, R3, R4 |
| STK-02 | Los productos no se borran: se **desactivan** (dejan de aparecer para vender), así se conserva el historial. | Propuesta |
| STK-03 | Categorías editables. Cada categoría tiene subcategorías (ej.: Bebidas → Gaseosas, Jugos, Aguas). Cada producto tiene **una categoría y una subcategoría fija** (ej.: Coca-Cola → Bebidas → Gaseosas). | R2 |
| STK-04 | Historial de movimientos de stock por producto: cada entrada o salida queda registrada con tipo (venta, anulación, compra, ajuste), cantidad, stock resultante, usuario y fecha. El stock no es solo un número que se pisa. | Propuesta |
| STK-05 | Ajustes de stock (roturas, faltantes, correcciones) con motivo obligatorio, solo encargado o dueño. Lista de motivos: PA-27. | R5, PA-27 |
| STK-06 | Stock mínimo por producto. Cuando el stock queda por debajo del mínimo se muestra una alerta y el producto aparece en la lista **"Para reponer"**. Si "por debajo" incluye el caso igual al mínimo: PA-26. | R2 |
| STK-07 | Lista de productos con stock negativo, para corregirlos después con un ajuste. | R2 + Propuesta |
| STK-08 | No se controlan vencimientos. | R2 |
| STK-09 | Carga inicial de productos y stock: PA-38. | PA-38 |

**Reglas de negocio de stock**

1. **Se permite stock negativo.** El sistema avisa y se corrige después. (R2)
2. Productos por **unidad**: cantidades enteras. Productos por **peso**: cantidades en kg con hasta 3 decimales. (R2 + Propuesta)
3. Cada producto pertenece a **una** subcategoría, y esa subcategoría a **una** categoría. (R2)
4. Todo cambio de stock se hace con un movimiento registrado; no hay forma de "cambiar el número a mano" sin dejar rastro. (Propuesta)

### 4.3 Proveedores (PRV)

| ID | Requisito | Origen |
|---|---|---|
| PRV-01 | Alta y edición de proveedores: nombre, teléfono/WhatsApp, email, CUIT (opcional), días de visita y notas. | R3 |
| PRV-02 | Los proveedores no se borran: se desactivan. | Propuesta |
| PRV-03 | Cuenta corriente con cada proveedor: compras (deuda), pagos y saldo, con historial de movimientos. | R3 |
| PRV-04 | Registrar pagos a proveedores. Medios y origen del dinero: PA-08. Si el pago sale del efectivo de la caja, se registra solo también como salida de caja. | R3, R4, PA-08 |
| PRV-05 | Pedido sugerido por proveedor: lista los productos de ese proveedor que están bajo el mínimo, con cantidades que se pueden ajustar; genera un texto para **copiar** o **abrir en WhatsApp**. Cantidad sugerida y si los pedidos se guardan: PA-26. | R3, PA-26 |
| PRV-06 | Solo encargado o dueño gestionan proveedores, pedidos y pagos. | R5 |

### 4.4 Compras (COM)

| ID | Requisito | Origen |
|---|---|---|
| COM-01 | Carga **manual** de una compra: proveedor, fecha, tipo y número de comprobante (opcionales), y por cada producto la cantidad y el costo. Cómo se cargan los bultos: PA-06. | R3, PA-06 |
| COM-02 | Al guardar la compra, en un solo paso: suma el stock (un movimiento por producto), actualiza el costo de cada producto (método: PA-05) y registra la deuda con el proveedor (PA-07). | R3, PA-05, PA-07 |
| COM-03 | Si el costo de un producto cambió, el sistema **avisa**, muestra costo anterior y nuevo, y **sugiere el nuevo precio de venta** (con margen y redondeo). El usuario lo confirma, lo modifica o deja el precio como estaba. | R3, R4 |
| COM-04 | Adjuntar una o más fotos o archivos de la factura/remito; quedan guardados con la compra y se pueden ver después. Formatos y tamaño máximo propuestos: JPG, PNG o PDF de hasta 10 MB cada uno. | R3 + Propuesta |
| COM-05 | Sin lectura automática de facturas. | R3 |
| COM-06 | Corregir o anular una compra mal cargada: PA-25. | PA-25 |
| COM-07 | Solo encargado o dueño cargan compras. | R5 |
| COM-08 | Impuestos y percepciones de la factura: PA-24. | PA-24 |

### 4.5 Precios (PRE)

| ID | Requisito | Origen |
|---|---|---|
| PRE-01 | Precio sugerido = costo + margen % sobre el costo (ej.: costo $1.000 + 40% = $1.400), y después se redondea. | R4 |
| PRE-02 | Margen por producto. Si el producto no tiene margen propio, usa el de su categoría. Margen por subcategoría: PA-22. | R4, PA-22 |
| PRE-03 | Redondeo configurable, hoy a $10 (ej.: $1.437 → $1.440). Si se redondea siempre hacia arriba o al más cercano: PA-19. | R4, PA-19 |
| PRE-04 | Cambio manual del precio de un producto (encargado o dueño). Qué pasa con el margen: PA-21. | R5, PA-21 |
| PRE-05 | Aumento masivo por porcentaje, por proveedor o por categoría (encargado o dueño), con **vista previa** de cómo quedan los precios antes de confirmar (Propuesta). Si el % se aplica al costo o al precio: PA-23. | R4, R5, PA-23 |
| PRE-06 | Historial de cambios de precio y costo por producto: valor anterior, valor nuevo, origen (manual, compra o aumento masivo), usuario y fecha. | Propuesta |
| PRE-07 | Cambiar un precio no modifica ventas ya registradas (ver regla 3 de ventas). | Propuesta |

### 4.6 Caja (CAJ)

| ID | Requisito | Origen |
|---|---|---|
| CAJ-01 | Caja **por turno**: cada empleado abre su caja con un efectivo inicial y la cierra al irse. | R4 |
| CAJ-02 | **Cierre a ciegas:** al cerrar, el empleado carga el efectivo que contó **sin ver** cuánto debería haber. | R4 |
| CAJ-03 | El sistema calcula el **efectivo esperado** = efectivo inicial + cobros en efectivo del turno + ingresos de efectivo − salidas de efectivo. **Diferencia** = contado − esperado. | R4 + Propuesta (fórmula) |
| CAJ-04 | La diferencia del arqueo solo la ven encargado y dueño. | R4, R5 |
| CAJ-05 | Movimientos de caja: ingresos y salidas de efectivo (pago a proveedor, retiro del dueño, gastos) con motivo, descripción, usuario y fecha. Salidas: solo encargado o dueño. Ingresos: PA-29. | R4, R5, PA-29 |
| CAJ-06 | Un pago a proveedor hecho con efectivo de la caja genera automáticamente la salida de caja correspondiente. | R4 + Propuesta |
| CAJ-07 | Una caja cerrada no se modifica más (sus números quedan fijos). | Propuesta |
| CAJ-08 | Cuántas cajas puede haber abiertas a la vez y quién puede vender en una caja abierta: PA-02. Qué se controla en el cierre además del efectivo: PA-28. | PA-02, PA-28 |

### 4.7 Usuarios y roles (USR)

| ID | Requisito | Origen |
|---|---|---|
| USR-01 | Cada persona entra con su propio usuario y contraseña. | R5 |
| USR-02 | Tres roles fijos (empleado, encargado, dueño) con los permisos de la sección 3. | R5 |
| USR-03 | Solo el dueño crea, edita y desactiva usuarios, y cambia o resetea contraseñas. | R5 |
| USR-04 | Las contraseñas se guardan cifradas (bcrypt), nunca en texto. | CLAUDE.md |
| USR-05 | Los usuarios no se borran: se desactivan (así sus ventas y movimientos siguen mostrando quién los hizo). | Propuesta |
| USR-06 | Cerrar sesión y cambiar de usuario rápido en la PC compartida del mostrador. Duración de la sesión y contraseña olvidada: PA-37. | Propuesta, PA-37 |

### 4.8 Reportes (REP)

Todos los reportes tienen **filtro de fechas** y se pueden **exportar a Excel** (R6).

| ID | Reporte | Quién lo ve | Origen |
|---|---|---|---|
| REP-01 | Ventas por día, por turno y por medio de pago | Encargado, Dueño | R6, R5 |
| REP-02 | Productos más vendidos y productos sin movimiento (sin ventas en el rango de fechas elegido) | Encargado, Dueño | R6, R5 |
| REP-03 | Ganancia por período y por categoría | Solo Dueño | R6, R5 |
| REP-04 | Stock valorizado (stock × costo actual). Los productos con stock negativo se muestran aparte y no restan. | Solo Dueño | R6, R5 + Propuesta |
| REP-05 | Diferencias de caja por turno y por empleado | Encargado, Dueño | R6, R5 |
| REP-06 | Deuda con proveedores (saldo por proveedor) | Encargado, Dueño | R6, R5 |
| REP-07 | Lista "Para reponer" (también por proveedor) | Encargado, Dueño | R2, R3 |
| REP-08 | Exportar cualquiera de los reportes a Excel (.xlsx) | Según el reporte | R6 |

**Reglas de reportes**

1. Las ventas anuladas **no** suman en ventas ni en ganancia (se pueden listar aparte). (Propuesta)
2. Ganancia de una línea = importe cobrado por el producto (después del descuento) − cantidad × costo guardado en la venta. Si el recargo cuenta como ganancia: PA-31. (R6 + Propuesta)
3. Qué se considera "un día" si el kiosco cierra después de medianoche: PA-32.

### 4.9 Configuración (CFG)

Solo el dueño (R5).

| ID | Requisito | Origen |
|---|---|---|
| CFG-01 | % de recargo por medio de pago (hoy: crédito aprox. 10%, el resto 0%). | R1 |
| CFG-02 | Margen por defecto de cada categoría. | R4 |
| CFG-03 | Redondeo de precios: de a cuánto se redondea (hoy $10; 0 = sin redondeo). | R4 |
| CFG-04 | Activar o desactivar medios de pago y ordenar cómo aparecen al cobrar. | Propuesta |
| CFG-05 | Nombre del negocio (para encabezados de reportes y del texto de pedidos). | Propuesta |
| CFG-06 | Usuarios (ver USR-03). | R5 |

---

## 5. Requisitos no funcionales (NF)

| ID | Requisito | Origen |
|---|---|---|
| NF-01 | **Servidor local:** la aplicación (servidor, base de datos y pantallas) corre en la PC del kiosco. | R6 |
| NF-02 | **Funciona sin internet:** se puede vender y usar todo el sistema sin conexión. Solo necesitan internet: el acceso remoto (NF-14), abrir WhatsApp para mandar un pedido y la copia de seguridad a la nube (si se elige, PA-35). | R6 |
| NF-03 | **Acceso por WiFi local:** tablets y celulares entran con el navegador por la red del local. Las pantallas se adaptan a celular y tablet. | R6 |
| NF-04 | **Copias de seguridad automáticas** de la base de datos **y** de los archivos adjuntos de compras. Destino, frecuencia y cuántas se guardan: PA-35. | R6 |
| NF-05 | **Una sucursal.** El diseño de datos permite agregar sucursales en el futuro sin rehacer todo. | R6 |
| NF-06 | **Lector y teclado:** compatible con lector de código de barras USB en modo teclado (código + Enter). El punto de venta se puede usar entero con teclado (el cursor vuelve solo al buscador, atajos para cobrar). Se puede probar tipeando el código. | R1 + Propuesta |
| NF-07 | **Formato argentino (es-AR):** dinero como `$ 1.440,50`, fechas `dd/mm/aaaa`, hora de 24 h, zona horaria de Buenos Aires. | Propuesta |
| NF-08 | **Auditoría** de acciones sensibles: anular venta, ajustar stock, cambiar precios (manual y masivo), cerrar caja y salidas de caja. También: ingresos al sistema (correctos y fallidos), cambios de usuarios y de configuración, anulación de compras. Se guarda quién, cuándo, qué y los valores antes/después. No se puede borrar ni editar desde el sistema. | Orquestador + Propuesta |
| NF-09 | **Seguridad:** login propio con JWT en cookie `httpOnly` y contraseñas con bcrypt; permisos verificados en el servidor. Ver también NF-14 a NF-16 (acceso remoto). | CLAUDE.md |
| NF-10 | **Dinero exacto:** nunca números con coma flotante para dinero (ver `docs/modelo-datos.md`). | CLAUDE.md |
| NF-11 | **Operaciones "todo o nada":** una venta, su stock, sus pagos y su caja se guardan juntos; si algo falla (o se corta la luz) no queda una venta a medias. Lo mismo para compras y anulaciones. | Propuesta |
| NF-12 | **Rapidez en el mostrador:** leer un código y ver el producto en la venta en menos de 1 segundo en la PC del kiosco. | Propuesta |
| NF-13 | **Configuración fuera del código:** claves, rutas de backups y de adjuntos, etc., en `.env` (documentado en `.env.example`). | CLAUDE.md |
| NF-14 | **Acceso remoto seguro:** el dueño entra desde fuera del local con su celular a través de un túnel seguro (tipo Tailscale o Cloudflare Tunnel) hacia la PC del kiosco, **siempre con HTTPS**. El servidor sigue en la PC del local. **No se abren puertos del router** ni se expone la base de datos. Si se corta internet en el local, se sigue vendiendo y solo se pierde el acceso remoto mientras dure el corte. Se implementa como **etapa aparte, al final**. Herramienta, quién puede usarlo y qué se puede hacer desde afuera: PA-01. | R6 |
| NF-15 | **Login igual adentro y afuera:** el inicio de sesión y la cookie de sesión tienen que funcionar bien tanto por el WiFi del local como a través del túnel con HTTPS (cookie `httpOnly`, `Secure` cuando corresponda, `SameSite`, dominio correcto). El agente de seguridad define la configuración exacta y cómo se sirve HTTPS dentro del local (PA-39). | R6 + Propuesta |
| NF-16 | **Protección del login ante internet:** como el sistema queda alcanzable desde afuera, se limitan los intentos de login fallidos y se registran en auditoría. | Propuesta |

---

## 6. Glosario

- **Turno / caja:** período entre que un empleado abre la caja (con efectivo inicial) y la cierra.
- **Arqueo / cierre a ciegas:** al cerrar se cuenta el efectivo; el empleado no ve el monto esperado.
- **Movimiento de caja:** entrada o salida de efectivo que no es una venta (gasto, retiro, pago a proveedor).
- **Movimiento de stock:** cada suma o resta de stock con su motivo (venta, compra, ajuste, anulación).
- **Cuenta corriente con proveedor:** lo que se le debe a cada proveedor (compras menos pagos).
- **Margen:** % que se suma al costo para calcular el precio de venta.
- **Recargo:** % que se suma al cobrar con un medio de pago (hoy, crédito).

---

## 7. Preguntas abiertas

Cada pregunta tiene opciones y una **recomendación del arquitecto**. **Decide el dueño.** Están agrupadas según cuándo hace falta la respuesta.

### 7.A Afectan el modelo de datos o la instalación (responder antes del plan, Fase 3)

#### PA-01 — Detalles del acceso remoto
**Ya decidido (R6):** el dueño entra desde el celular dentro del local y también desde afuera, con un acceso remoto seguro hacia la PC del kiosco, como etapa aparte al final. Falta definir:

1. **¿Qué herramienta?**
   - a) **Tailscale** (red privada): se instala una app en la PC y en el celular del dueño; solo los dispositivos autorizados "ven" el sistema. No necesita dominio propio. No queda nada publicado en internet.
   - b) **Cloudflare Tunnel** con una dirección web (ej.: `kiosco.midominio.com`): se entra desde cualquier navegador. Necesita un **dominio propio** (costo anual bajo) y conviene agregarle una capa de acceso extra (Cloudflare Access, con código por email) porque la dirección es pública.

   **Recomendación:** a). Es la más simple y segura: el sistema no queda expuesto a cualquiera en internet y el dispositivo autorizado funciona como una "segunda llave". b) solo si quiere entrar desde cualquier navegador sin instalar nada.
2. **¿Quién puede entrar desde afuera?**
   - a) Solo usuarios con rol **dueño**.
   - b) Dueño y encargado.

   **Recomendación:** a), que es lo relevado. Si más adelante se suma el encargado, se habilita su dispositivo.
3. **¿Qué se puede hacer desde afuera?**
   - a) Lo mismo que adentro, según el rol.
   - b) Todo menos operar la caja y vender (no tiene sentido sin el cajón físico).
   - c) Solo consultar (reportes, stock, caja), sin modificar nada.

   **Recomendación:** b): puede ver reportes, cambiar precios, cargar compras o pagos, pero no abrir/cerrar caja ni vender desde afuera.
4. **¿La PC del kiosco queda prendida fuera del horario?** Si se apaga al cerrar, a esa hora no hay acceso remoto. Recomendado: definirlo junto con PA-36.

#### PA-02 — ¿Cuántas cajas abiertas puede haber a la vez y quién vende en ellas?
Hay un solo cajón de efectivo y una PC de mostrador, pero también pueden vender desde tablets.
- a) **Una sola caja abierta en todo el kiosco.** Para abrir otra, primero se cierra la anterior. Cualquier usuario puede vender en la caja abierta (por ejemplo, el dueño ayuda en el mostrador) y queda registrado quién hizo cada venta.
- b) Una caja abierta **por usuario**, varias al mismo tiempo; cada uno vende solo en la suya (necesita un cajón o sobre por persona para que el cierre a ciegas tenga sentido).
- c) Una caja por dispositivo (PC, tablet).

**Recomendación:** a). Coincide con un solo cajón físico y hace que el arqueo sea claro. En todos los casos se propone que **para vender haya que tener una caja abierta**.

#### PA-03 — ¿El encargado puede ver costos?
La matriz dice que el encargado **no** ve costos, pero sí **carga compras** (con costo) y **cambia precios** (el precio sugerido se calcula con el costo).
- a) El encargado ve el costo **solo** en las pantallas de compras y de precios; no ve ganancia ni stock valorizado.
- b) El encargado no ve costos nunca: carga el costo de la compra, pero después no lo ve; el precio sugerido aparece sin mostrar el costo ni el margen.
- c) El encargado ve costos en todos lados menos en reportes de ganancia y stock valorizado.

**Recomendación:** a). Es lo mínimo necesario para que pueda hacer su trabajo sin abrirle los reportes del dueño.

#### PA-04 — ¿Un producto tiene un solo proveedor?
Afecta al pedido sugerido y a los aumentos masivos por proveedor.
- a) Cada producto tiene **un proveedor habitual** (se puede cambiar). Igual se le puede comprar a otro proveedor.
- b) Un producto puede tener **varios proveedores** (con su costo cada uno).

**Recomendación:** a). Más simple de cargar y de usar; cubre el pedido sugerido y los aumentos por proveedor.

#### PA-05 — ¿Cómo se actualiza el costo al cargar una compra?
- a) **Último costo:** el costo del producto pasa a ser el de la última compra.
- b) **Costo promedio ponderado:** mezcla el costo del stock que había con el de la compra nueva.

**Recomendación:** a). Es lo que se usa para fijar precios con inflación y es fácil de entender.

#### PA-06 — Compras por bulto o por unidad
Ej.: se compra una caja de 12 latas, pero se vende por lata.
- a) En la compra siempre se carga la cantidad y el costo **por unidad de venta** (12 latas, costo por lata). La pantalla puede ayudar a dividir el costo del bulto.
- b) Cada producto tiene un dato "unidades por bulto" y en la compra se puede cargar por bulto; el sistema convierte.

**Recomendación:** a) para la v1 (sin datos nuevos por producto). b) como mejora si cargar se vuelve lento.

#### PA-07 — ¿Toda compra genera deuda con el proveedor?
- a) Toda compra suma deuda en la cuenta corriente. Si se paga en el momento, al guardar la compra se puede registrar el pago en el mismo paso (la deuda queda en cero).
- b) Al cargar la compra se elige "contado" (no pasa por la cuenta corriente) o "cuenta corriente".

**Recomendación:** a). Todo queda en un solo lugar y el saldo siempre cierra.

#### PA-08 — Pagos a proveedores: ¿con qué y de dónde sale la plata?
¿Se registran pagos que **no** salen del efectivo de la caja?
- a) Orígenes posibles: efectivo de la caja abierta (genera salida de caja), efectivo de fuera de la caja (por ejemplo, el dueño paga de su bolsillo), transferencia, otro (con nota).
- b) Solo efectivo de caja y transferencia.
- c) Solo efectivo de caja.

**Recomendación:** a). Solo "efectivo de la caja" afecta el arqueo; los demás actualizan la cuenta corriente sin tocar la caja.

#### PA-09 — Productos por peso: ¿cómo se ingresa el peso?
- a) Se tipea el peso a mano (en kg o gramos) al agregar el producto a la venta.
- b) La balanza imprime una **etiqueta con código de barras** que trae el peso o el precio (códigos que empiezan con 20 a 29); el sistema la lee con el lector.
- c) Balanza conectada directamente a la PC.

**Recomendación:** a) para la v1. Si ya tienen balanza etiquetadora, b) es una buena segunda etapa: conviene saber marca y modelo.

#### PA-10 — ¿Se puede vender algo que no está cargado en el sistema?
- a) No: hay que dar de alta el producto antes de venderlo.
- b) Un producto especial **"Varios"** con precio que se escribe en el momento, sin control de stock. Queda registrado y aparece en reportes.
- c) b), pero solo encargado y dueño.

**Recomendación:** b) si hoy pasa seguido; si no, a). Conviene confirmar si un empleado puede usarlo.

#### PA-11 — ¿Un producto puede tener más de un código de barras?
Pasa cuando el fabricante cambia el código o hay dos presentaciones iguales.
- a) Uno solo por producto.
- b) Varios códigos para el mismo producto.

**Recomendación:** a) para la v1 (se puede pasar a b) más adelante sin perder datos).

#### PA-12 — Recargo de crédito: ¿uno solo o según cuotas?
- a) Un único % de recargo para crédito.
- b) % distinto según cantidad de cuotas (1, 3, 6…).

**Recomendación:** a), salvo que hoy cobren distinto según cuotas.

#### PA-13 — Condición fiscal del kiosco (para preparar ARCA)
No se factura en la v1, pero conviene saber: ¿el kiosco es **monotributista** o **responsable inscripto**?
- a) Monotributo: no hace falta guardar IVA por producto ahora.
- b) Responsable inscripto: conviene agregar desde ya la alícuota de IVA por producto.

**Recomendación:** responder ahora aunque ARCA sea futuro; con monotributo no se agrega nada.

### 7.B Afectan reglas de un módulo (responder antes de desarrollar ese módulo)

#### PA-14 — Orden de descuento y recargo
- a) Primero el descuento; el recargo se calcula sobre lo que se paga con crédito **después** del descuento.
- b) El recargo se calcula sobre el total **antes** del descuento.

En pago mixto: ¿el recargo se aplica **solo a la parte pagada con crédito**? (Recomendado: sí.)
**Recomendación:** a), y recargo solo sobre la parte pagada con crédito.

#### PA-15 — ¿Cómo es el descuento manual?
- a) Sobre el **total** de la venta, en $ o en %.
- b) Por **producto** (línea), en $ o en %.
- c) Ambos.

**Recomendación:** a), con motivo opcional. Es lo más simple y cubre "le hago un descuento".

#### PA-16 — Autorización en el momento
Si el empleado está solo y hace falta un descuento o anular una venta:
- a) No se puede: lo hace el encargado o el dueño entrando con su usuario.
- b) El encargado o dueño escribe su usuario y contraseña **en la misma pantalla** del empleado para autorizar esa acción puntual (queda registrado quién autorizó).

**Recomendación:** a) para la v1 por simplicidad. b) si en la práctica el empleado suele estar solo y se necesitan descuentos.

#### PA-17 — Anular una venta de un turno ya cerrado
- a) Solo se pueden anular ventas de la caja abierta.
- b) Se puede anular cualquier venta; si tenía efectivo, la devolución se registra como **salida de la caja abierta actual**. La caja cerrada no se toca.
- c) Se puede anular cualquier venta y se recalcula la caja cerrada original.

**Recomendación:** b). Permite corregir errores sin modificar arqueos ya cerrados. c) no se recomienda.

#### PA-18 — Venta en curso al cerrar la caja / ventas "en espera"
- a) El carrito vive solo en la pantalla y se guarda al cobrar. No se puede cerrar la caja con un carrito sin cobrar (el sistema avisa).
- b) Además, poder dejar una venta **en espera** para atender a otro cliente y retomarla después.

**Recomendación:** a) para la v1.

#### PA-19 — Redondeo de precios: ¿hacia arriba o al más cercano?
El ejemplo $1.437 → $1.440 sirve para los dos casos. ¿$1.432 queda en $1.430 o en $1.440?
- a) Siempre **hacia arriba** ($1.432 → $1.440).
- b) Al **más cercano** ($1.432 → $1.430; $1.435 → $1.440).

**Recomendación:** a): nunca se pierde margen. Igual queda configurable.

#### PA-20 — Importes con centavos (productos por peso y recargos)
Ej.: 0,375 kg × $8.990 = $3.371,25; o un 10% de recargo que da centavos.
- a) Se cobran exactos, con centavos.
- b) Se redondean al **peso entero**.
- c) Se redondean a $10 como los precios.

**Recomendación:** b): en la práctica no se usan monedas de centavos y la diferencia es mínima.

#### PA-21 — Cambio manual de precio y margen
- a) El precio se cambia libremente y el margen guardado no se toca; el sistema muestra el "margen real" resultante como información.
- b) Al cambiar el precio a mano se recalcula y guarda el margen del producto.

**Recomendación:** a). El margen se usa para sugerir; el precio final siempre lo decide el usuario.

#### PA-22 — ¿Margen por subcategoría?
- a) No: margen del producto o, si no tiene, de la categoría (como se relevó).
- b) Sí: producto → subcategoría → categoría.

**Recomendación:** a).

#### PA-23 — Aumento masivo: ¿sobre qué se aplica el %?
- a) Sobre el **costo**, y el precio se recalcula con el margen y el redondeo (típico cuando el proveedor aumenta).
- b) Directamente sobre el **precio de venta**, y se redondea.
- c) Se elige en cada aumento (a o b), con vista previa.

¿También se usan para **bajar** precios? (Hoy se relevó solo "aumentos".)
**Recomendación:** c), con vista previa obligatoria antes de confirmar. Solo aumentos en la v1.

#### PA-24 — Impuestos y percepciones en facturas de compra
- a) El costo que se carga es el **costo final por unidad** (con impuestos incluidos). El total de la compra es la suma de los productos.
- b) a) más un campo "otros cargos" (percepciones, fletes) que suma a la deuda con el proveedor pero no al costo de cada producto.
- c) Costo neto + IVA por separado.

**Recomendación:** a), o b) si las facturas suelen traer percepciones. c) solo si el kiosco es responsable inscripto (PA-13).

#### PA-25 — Corregir o anular una compra mal cargada
- a) No se edita: se **anula** (encargado o dueño) y se vuelve a cargar. La anulación resta el stock, saca la deuda y queda en auditoría. Los costos y precios ya cambiados no se revierten solos.
- b) Se puede editar la compra después de guardada.

**Recomendación:** a): deja todo trazable y es mucho más simple de hacer bien.

#### PA-26 — Pedido sugerido y "bajo el mínimo"
1. ¿"Bajo el mínimo" incluye el caso de stock **igual** al mínimo? Recomendado: sí (stock ≤ mínimo).
2. ¿Qué cantidad sugiere?
   - a) La necesaria para llegar al mínimo (mínimo − stock actual), editable.
   - b) Agregar un dato "stock ideal" por producto y sugerir lo que falta para llegar a ese número.
   - c) No sugerir cantidad: listar productos y que el usuario la escriba.
3. ¿Se guardan los pedidos enviados? Recomendado: no en la v1 (solo se genera el texto; lo que entra se registra como compra).

**Recomendación:** ≤ mínimo; cantidad a), editable; no guardar pedidos. b) como mejora.

#### PA-27 — Motivos de ajuste de stock
Propuesta de lista fija: **rotura**, **faltante** (robo/pérdida), **corrección por conteo**, **carga inicial**, **otro** (con nota obligatoria).
- a) Esa lista.
- b) Esa lista más "consumo propio".
- c) Lista editable por el dueño.

**Recomendación:** a) o b), según si hoy se registra el consumo propio.

#### PA-28 — Cierre de caja: ¿qué se controla además del efectivo?
- a) A ciegas **solo el efectivo**. Los otros medios (débito, crédito, QR, transferencia) se muestran como información para encargado/dueño.
- b) También se cargan a ciegas los totales del posnet/QR para compararlos.

**Recomendación:** a). Los cobros electrónicos ya quedan registrados en Mercado Pago.

#### PA-29 — Ingresos de efectivo a la caja y motivos de movimientos
1. ¿Quién puede registrar **ingresos** de efectivo (por ejemplo, el dueño trae cambio)? La matriz solo habla de salidas.
   - a) Igual que las salidas: encargado y dueño.
   - b) Todos, incluido el empleado.
2. Lista de motivos propuesta: pago a proveedor, retiro del dueño, gasto, aporte de cambio, devolución por anulación, otro (con descripción).

**Recomendación:** a) y esa lista de motivos.

#### PA-30 — Efectivo inicial y diferencias de caja
1. El efectivo inicial ¿lo cuenta y escribe el empleado, o el sistema propone lo que quedó en la caja anterior? Recomendado: lo escribe el empleado.
2. Si hay faltante o sobrante, ¿solo se informa o se registra algo más (por ejemplo, a cargo del empleado)? Recomendado: solo se informa y queda en el reporte de diferencias.
3. ¿Se puede corregir un cierre ya hecho? Recomendado: no; se agrega una nota (encargado o dueño).

**Recomendación:** las tres indicadas.

#### PA-31 — ¿El recargo de crédito cuenta como ganancia?
- a) Sí, suma como ingreso y ganancia.
- b) Se muestra **aparte** en los reportes (sirve para cubrir la comisión de la tarjeta).

**Recomendación:** b). Las comisiones de Mercado Pago no se registran en la v1.

#### PA-32 — Horario del kiosco y "día" en los reportes
¿El kiosco abre después de medianoche o las 24 horas?
- a) "Día" = día calendario (de 00:00 a 23:59).
- b) "Día" = día de trabajo (por ejemplo, de 6:00 a 5:59 del día siguiente).

**Recomendación:** a) si cierra antes de medianoche; si no, b). El reporte por turno funciona igual en los dos casos.

#### PA-33 — ¿Quién crea y edita categorías y subcategorías?
- a) Solo el dueño (es parte de la configuración, junto con los márgenes).
- b) Encargado y dueño pueden crear y renombrar; el margen de la categoría solo lo cambia el dueño.

**Recomendación:** b): el encargado da de alta productos y puede necesitar una subcategoría nueva.

### 7.C Operativas e instalación (responder antes de la puesta en marcha)

#### PA-34 — Productos sin movimiento
"Sin movimiento" = sin ventas dentro del rango de fechas que se elige en el filtro. ¿Está bien así o hace falta un número fijo de días (ej.: 30)?
**Recomendación:** usar el filtro de fechas (ya relevado); no hace falta configuración extra.

#### PA-35 — Copias de seguridad: ¿a dónde, cada cuánto y cuántas?
- a) Copia diaria automática en **otra carpeta/disco de la misma PC**.
- b) a) + copia a un **pendrive o disco externo**.
- c) a) + copia a una **carpeta en la nube** (por ejemplo, Google Drive sincronizado) cuando hay internet.

**Recomendación:** c) (y b) si se puede), con copia diaria + una copia al cerrar cada caja, guardando las últimas 30. Incluye siempre los archivos adjuntos de compras. Si la PC se rompe o la roban, una copia en la misma PC no sirve.

#### PA-36 — La PC del kiosco
¿Qué sistema operativo tiene (Windows, versión), cuánta memoria RAM, si queda prendida todo el día y si tiene UPS (batería ante cortes de luz)?
**Recomendación:** dato necesario para la instalación (en Windows conviene instalar PostgreSQL directo y no con Docker). Se recomienda una UPS.

#### PA-37 — Usuarios: contraseñas y sesiones
1. Si alguien olvida su contraseña: recomendado que el dueño la resetee desde el sistema.
2. Si el dueño olvida la suya: recomendado un procedimiento en la PC del kiosco (comando de recuperación documentado).
3. ¿Puede haber más de un usuario con rol dueño? Recomendado: sí (por ejemplo, socios).
4. ¿Cuánto dura la sesión en la PC del mostrador? Recomendado: hasta 12 horas o hasta cerrar sesión, con botón visible de "cambiar usuario".

#### PA-38 — Carga inicial de productos
¿Existe hoy una lista de productos (Excel, otro sistema)?
- a) Se cargan a mano de a uno.
- b) Se importan desde un Excel con columnas fijas (nombre, código, categoría, subcategoría, costo, precio, stock, mínimo).

**Recomendación:** b) si la lista existe y tiene más de unos cientos de productos; si no, a).

### 7.D Técnicas (las resuelven arquitecto y seguridad; no requieren al dueño salvo que se indique)

#### PA-39 — HTTPS dentro del local y cookie de sesión
La cookie de sesión debería ser `Secure` (solo viaja por HTTPS). Por el túnel remoto hay HTTPS, pero por el WiFi del local, si se entra con `http://192.168.x.x`, una cookie `Secure` no funciona.
- a) Usar **también dentro del local** la dirección del túnel (con Tailscale, su nombre interno con certificado HTTPS): una sola forma de entrar, siempre HTTPS. Requiere Tailscale instalado en cada dispositivo que use el sistema, y **hay que probar que siga funcionando con internet cortado** (si no, se descarta).
- b) Servir HTTPS en la red local con un certificado propio instalado en cada tablet/celular, y la dirección del túnel para afuera.
- c) Dentro del local por HTTP (cookie sin `Secure`) y por el túnel con HTTPS (cookie `Secure`), según cómo se entra.

**Recomendación:** decide el agente de seguridad antes de la etapa de login. A priori a) si se elige Tailscale (PA-01), porque evita tener dos configuraciones; c) es la más simple pero deja el tráfico del WiFi sin cifrar. **No se puede romper la venta sin internet:** la PC del mostrador tiene que poder entrar aunque no haya conexión (por ejemplo, entrando por `localhost`).
