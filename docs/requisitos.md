# Requisitos del sistema – Kiosco (versión 1)

> **Estado:** borrador para aprobación del dueño (Fase 2), con las respuestas de la Ronda 7 incorporadas.
> **Fuente única de reglas de negocio:** `docs/relevamiento.md`.
> Lo que no está definido ahí **no se inventa**: queda en la sección 7 ("A confirmar con el cliente", PA-39 para `seguridad` o "Huecos nuevos").

## Cómo leer este documento

- Cada requisito tiene un código: `VEN` ventas, `STK` stock y productos, `PRV` proveedores, `COM` compras, `PRE` precios, `CAJ` caja, `USR` usuarios, `REP` reportes, `CFG` configuración, `NF` no funcionales.
- La columna **Origen** dice de dónde sale cada requisito:
  - **R1 a R6**: ronda del relevamiento donde lo decidió el dueño.
  - **PA-xx (resuelta)**: era una pregunta abierta y el dueño ya la respondió (Ronda 7 de `relevamiento.md`).
  - **Propuesta**: lo propone el arquitecto porque hace falta para que el sistema funcione bien (por ejemplo, no borrar ventas). No es una regla del negocio: **se valida al aprobar este documento**.
  - **H-xx**: hueco detectado al incorporar las respuestas; todavía sin decidir (sección 7.4).
- Lo marcado **[A confirmar con el cliente]** tiene una decisión provisoria que hay que validar con el cliente final.

---

## 1. Resumen del sistema

Sistema web para gestionar un kiosco de **una sola sucursal**. Corre en la **PC del mostrador** (servidor local) y funciona **sin internet**. Desde esa PC se vende con lector de código de barras y teclado; tablets y celulares se conectan por el WiFi del local con el navegador. El **dueño y el encargado** también pueden entrar **desde afuera del local** (casa, calle) con **Tailscale**, un acceso remoto seguro hacia la PC del kiosco (etapa aparte, al final). Desde afuera se puede hacer todo **menos vender y manejar la caja**.

Cubre: ventas (punto de venta), stock y productos, proveedores, compras, precios, caja por turno, usuarios con roles, reportes con exportación a Excel y configuración.

**No hay fiado:** no existe cuenta corriente de clientes ni registro de clientes (R5).

## 2. Alcance de la versión 1

### Entra en la versión 1

- Punto de venta con lector USB y búsqueda por nombre; productos por unidad y por peso (kg); producto "Varios" con precio a mano.
- Pago mixto (varios medios en una venta), recargo de crédito configurable, descuento manual con permiso.
- Anulación de venta completa (dueño o encargado).
- Stock con historial de movimientos, stock mínimo, lista "para reponer", ajustes con motivo, venta sin stock con aviso.
- Categorías y subcategorías, con margen en producto, subcategoría y categoría.
- Proveedores, cuenta corriente con proveedores, pedido sugerido para copiar o mandar por WhatsApp.
- Compras cargadas a mano, por unidad o por bulto, con adjunto (foto o archivo de la factura/remito).
- Precios con margen, redondeo hacia arriba configurable, aumentos masivos por proveedor y por categoría, historial de precios.
- Caja única por turno con cierre a ciegas y movimientos de caja.
- Usuarios con tres roles (empleado, encargado, dueño).
- Reportes con filtro de fechas y exportación a Excel.
- Importación de productos desde Excel.
- Copias de seguridad automáticas y registro de auditoría.
- **Acceso remoto seguro con Tailscale** para dueño y encargado. Se hace como **etapa aparte, al final** del desarrollo (R6, PA-01).

### Queda afuera de la versión 1

| Tema | Situación |
|---|---|
| Facturación electrónica ARCA | **Futuro.** El modelo de datos queda preparado y ya guarda el IVA de cada producto (sin usarlo en cálculos). (R6, PA-13) |
| Integración con la API de Mercado Pago | Futuro posible. Hoy solo se registra el medio de pago. (R1) |
| Lectura automática de facturas de compra | Futuro posible. Hoy la carga es manual con adjunto. (R3) |
| Impresión de tickets | No se imprime. (R1) |
| Promociones automáticas | No por ahora. (R1) |
| Devoluciones parciales | No: solo se anula la venta completa. (R1) |
| Ventas "en espera" | No. (PA-18) |
| Recargo por cuotas | No: un único % para crédito. (PA-12) |
| Bajas masivas de precios | No: solo aumentos masivos. (PA-23) |
| Varios proveedores por producto / varios códigos de barras | No: uno de cada uno (se puede ampliar más adelante). (PA-04, PA-11) |
| Control de vencimientos | No se controlan. (R2) |
| Fiado / clientes | **No existe** y no está planificado. (R5) |
| Varias sucursales | Hay una sola. El diseño no lo impide a futuro. (R6) |
| Servidor en la nube | No: el servidor y los datos quedan en la PC del kiosco. El acceso remoto es un "túnel" seguro hacia esa PC, no una copia en internet. (R6) |

## 3. Roles y permisos

Tres roles fijos: **Empleado**, **Encargado** y **Dueño** (R5). Puede haber **más de un usuario con rol dueño** (PA-37). Matriz aprobada en el relevamiento:

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

**Aclaraciones aprobadas en la Ronda 7:**

| Tema | Regla | Origen |
|---|---|---|
| Costos para el encargado | El encargado ve costos **solo** en las pantallas de compras y de precios. No ve ganancia ni stock valorizado. | PA-03 (resuelta) |
| Ingresos de caja | Los **ingresos** de efectivo también los registran solo encargado y dueño (igual que las salidas). | PA-29 (resuelta) |
| Categorías y subcategorías | Las crean y editan encargado y dueño. El **margen** de categoría y de subcategoría solo lo cambia el dueño. Quién cambia el margen propio de un producto: H-05. | PA-33 (resuelta), H-05 |
| Autorizaciones | No hay autorización con contraseña en la pantalla del empleado: descuentos y anulaciones los hace el encargado o el dueño **desde su propia sesión**. | PA-16 (resuelta) |
| Acceso desde afuera | Solo **dueño y encargado**, con Tailscale. Desde afuera pueden hacer todo lo que su rol permite **menos vender y manejar la caja** (abrir, cerrar, movimientos de caja, pagos a proveedor con efectivo de la caja). El empleado no entra desde afuera. Anular ventas desde afuera: H-02. Cómo sabe el sistema que alguien entra desde afuera: H-01. | PA-01 (resuelta) |

Los permisos se controlan **en el servidor**, no solo ocultando botones en la pantalla (Propuesta).

---

## 4. Requisitos por módulo

### 4.1 Ventas / punto de venta (VEN)

| ID | Requisito | Origen |
|---|---|---|
| VEN-01 | Agregar un producto a la venta leyendo su código de barras con un lector USB (el lector "escribe" el código y un Enter, como un teclado) o tipeando el código a mano. | R1 |
| VEN-02 | Buscar productos por nombre, para los que no tienen código de barras. | R1 |
| VEN-03 | Antes de cobrar se puede cambiar la cantidad de una línea o quitarla. | Propuesta |
| VEN-04 | Productos por peso: el peso se **escribe a mano** al vender, en kg (ej.: 0,350 kg; hasta 3 decimales). El precio es por kg. | R2, PA-09 (resuelta) |
| VEN-05 | Producto **"Varios"**: para vender algo que no está cargado, con el precio escrito a mano. No mueve stock. Queda registrado para revisarlo en reportes. Costo y ganancia de "Varios": H-09. | PA-10 (resuelta), H-09 |
| VEN-06 | Cobrar con uno o más medios de pago en la misma venta (pago mixto): efectivo, transferencia, QR (Mercado Pago), tarjeta de débito y tarjeta de crédito. | R1 |
| VEN-07 | Aplicar automáticamente el recargo de crédito: **un único %** configurable (aprox. 10%), sin cuotas. Débito y los demás medios, sin recargo. El cálculo está en la regla 3. | R1, PA-12 (resuelta), PA-14 (resuelta) |
| VEN-08 | Descuento manual **sobre el total** de la venta, en **$ o en %**, con **motivo opcional**. Solo encargado y dueño, desde su propia sesión. | R1, R5, PA-15 (resuelta), PA-16 (resuelta) |
| VEN-09 | Si se vende un producto sin stock suficiente, el sistema **avisa pero deja vender**, y el stock queda negativo. | R2 |
| VEN-10 | No se imprime ticket. La venta queda registrada con fecha y hora, usuario, caja, productos, cantidades, precios, descuento, recargo y medios de pago. | R1 |
| VEN-11 | Anular una venta **completa**, solo encargado o dueño, con motivo obligatorio (Propuesta). Se puede anular aunque sea de un turno ya cerrado (regla 6). La venta no se borra: queda marcada como anulada, el stock vuelve y queda en auditoría. | R1, R5, PA-17 (resuelta) |
| VEN-12 | Calcular y mostrar el vuelto cuando se paga en efectivo (solo en pantalla, no se guarda). | Propuesta |
| VEN-13 | Para vender tiene que haber **una caja abierta** (hay una sola en todo el kiosco). **Cualquier usuario** puede vender en ella y queda registrado quién hizo cada venta. | R4, PA-02 (resuelta) |
| VEN-14 | **No hay ventas "en espera":** el carrito vive solo en la pantalla y se guarda al cobrar. | PA-18 (resuelta) |
| VEN-15 | Desde afuera del local (acceso remoto) **no se puede vender**. | PA-01 (resuelta) |

**Reglas de negocio de ventas**

1. **Importes en pesos enteros.** Lo que se cobra se redondea al **peso entero** (sin centavos): el importe de cada línea (por ejemplo, un producto por peso), el descuento y el recargo. Hacia dónde se redondea (más cercano, arriba o abajo): H-06. (PA-20 resuelta)
2. **Pago mixto:** la suma de lo pagado con cada medio (sin contar recargos) tiene que ser igual al total de la venta **después del descuento**. (R1)
3. **Recargo de crédito: se calcula ANTES del descuento y SOLO sobre la parte pagada con crédito.** (PA-14 resuelta)
   - El descuento se reparte en proporción entre lo que se paga con cada medio. El recargo se calcula sobre lo que valía la parte pagada con crédito **antes** del descuento:
     `base del recargo = monto pagado con crédito × subtotal ÷ (subtotal − descuento)`
     `recargo = base del recargo × % de crédito` (redondeado al peso, regla 1)
   - **Ejemplo 1, todo con crédito:** subtotal $10.000, descuento 10% = $1.000, queda $9.000. El recargo (10%) se calcula sobre $10.000 → **$1.000**. Se cobran $9.000 + $1.000 = **$10.000** en el posnet. (Si el recargo fuera después del descuento serían $900 y se cobrarían $9.900.)
   - **Ejemplo 2, pago mixto:** subtotal $10.000, descuento $1.000, queda $9.000. El cliente paga $4.500 en efectivo y $4.500 con crédito. Base del recargo = $4.500 × 10.000 ÷ 9.000 = $5.000 → recargo **$500**. Total de la venta: $9.500 ($4.500 en efectivo + $5.000 en el posnet).
   - **Ejemplo 3, sin descuento:** subtotal $8.000, todo con crédito → recargo $800, se cobran $8.800.
   - Esta forma de aplicar la regla al pago mixto (reparto proporcional) hay que validarla con el dueño usando el ejemplo 2: H-11.
4. **"Foto" de precios:** cada línea de venta guarda el precio de venta y el costo **de ese momento**. Si después cambian el precio o el costo, las ventas viejas y su ganancia no cambian. Lo mismo con el % de recargo usado. (Propuesta)
5. **Sin promociones automáticas** y **sin devoluciones parciales**. (R1)
6. **Anulación:** la venta pasa a estado "anulada", se registra quién, cuándo y por qué, y el stock de cada producto vuelve. Si se pagó en efectivo, la devolución sale de la **caja abierta en ese momento** como salida de caja; la caja del turno original **no cambia**. Qué pasa si no hay caja abierta: H-03. (PA-17 resuelta)
7. **Venta sin stock:** el aviso no bloquea la venta. (R2)
8. **Carrito y cierre de caja:** no se puede cerrar la caja con un carrito sin cobrar en la pantalla desde la que se cierra. Si otro dispositivo tiene un carrito y la caja se cerró, al cobrar le pide que haya una caja abierta. (PA-18 resuelta + Propuesta)

### 4.2 Stock y productos (STK)

| ID | Requisito | Origen |
|---|---|---|
| STK-01 | Alta y edición de productos: nombre, código de barras (opcional, **uno por producto**, único), unidad de venta (unidad o kg), categoría y subcategoría, **proveedor habitual (uno)**, costo, margen propio (opcional), precio de venta, stock mínimo, **unidades por bulto sugeridas** (opcional) e **IVA** (opcional, 21% por defecto). | R2, R3, R4, PA-04, PA-06, PA-11, PA-13 (resueltas) |
| STK-02 | Los productos no se borran: se **desactivan** (dejan de aparecer para vender), así se conserva el historial. | Propuesta |
| STK-03 | Categorías editables. Cada categoría tiene subcategorías (ej.: Bebidas → Gaseosas, Jugos, Aguas). Cada producto tiene **una categoría y una subcategoría fija** (ej.: Coca-Cola → Bebidas → Gaseosas). Las crean y editan encargado y dueño. | R2, PA-33 (resuelta) |
| STK-04 | Historial de movimientos de stock por producto: cada entrada o salida queda registrada con tipo (venta, anulación, compra, ajuste), cantidad, stock resultante, usuario y fecha. El stock no es solo un número que se pisa. | Propuesta |
| STK-05 | Ajustes de stock con motivo obligatorio, solo encargado o dueño. Motivos: **rotura, faltante (robo o pérdida), corrección por conteo, carga inicial, consumo propio, otro** (con nota). | R5, PA-27 (resuelta) |
| STK-06 | Stock mínimo por producto. Cuando el stock queda **igual o por debajo** del mínimo (stock ≤ mínimo) se muestra una alerta y el producto aparece en la lista **"Para reponer"**. | R2, PA-26 (resuelta) |
| STK-07 | Lista de productos con stock negativo, para corregirlos después con un ajuste. | R2 + Propuesta |
| STK-08 | No se controlan vencimientos. | R2 |
| STK-09 | **Importar productos desde Excel** (además de la carga manual), con una plantilla de columnas fijas. El stock inicial entra como ajuste con motivo "carga inicial". Detalles de la importación: H-14. | PA-38 (resuelta), H-14 |
| STK-10 | El IVA del producto se guarda pero **no cambia ningún cálculo** en la v1 (queda para ARCA). **[A confirmar con el cliente]** (PA-13). | PA-13 (resuelta) |

**Reglas de negocio de stock**

1. **Se permite stock negativo.** El sistema avisa y se corrige después. (R2)
2. Productos por **unidad**: cantidades enteras. Productos por **peso**: cantidades en kg con hasta 3 decimales. (R2 + Propuesta)
3. Cada producto pertenece a **una** subcategoría, y esa subcategoría a **una** categoría. (R2)
4. Todo cambio de stock se hace con un movimiento registrado; no hay forma de "cambiar el número a mano" sin dejar rastro. (Propuesta)
5. El producto "Varios" no lleva stock. (PA-10 resuelta)

### 4.3 Proveedores (PRV)

| ID | Requisito | Origen |
|---|---|---|
| PRV-01 | Alta y edición de proveedores: nombre, teléfono/WhatsApp, email, CUIT (opcional), días de visita y notas. | R3 |
| PRV-02 | Los proveedores no se borran: se desactivan. | Propuesta |
| PRV-03 | Cuenta corriente con cada proveedor: compras (deuda), pagos y saldo, con historial de movimientos. | R3 |
| PRV-04 | Registrar pagos a proveedores. Origen del dinero: **efectivo de la caja**, **efectivo de afuera de la caja**, **transferencia** u **otro**. **Solo el efectivo de la caja afecta el arqueo** (genera una salida de caja automática). | R3, R4, PA-08 (resuelta) |
| PRV-05 | Pedido sugerido por proveedor: lista los productos de ese proveedor con stock ≤ mínimo y sugiere **lo que falta para llegar al mínimo**; la cantidad se puede cambiar. Genera un texto para **copiar** o **abrir en WhatsApp**. Los pedidos no se guardan (R3 no lo pide). Qué sugerir cuando el stock es igual al mínimo: H-08. | R3, PA-26 (resuelta), H-08 |
| PRV-06 | Solo encargado o dueño gestionan proveedores, pedidos y pagos. Desde afuera del local no se pueden registrar pagos con efectivo de la caja. | R5, PA-01 (resuelta) |

### 4.4 Compras (COM)

| ID | Requisito | Origen |
|---|---|---|
| COM-01 | Carga **manual** de una compra: proveedor, fecha, tipo y número de comprobante (opcionales), y por cada producto la cantidad y el costo. | R3 |
| COM-02 | **Por unidad o por bulto, a elección en cada línea.** Por bulto se carga la cantidad de bultos, las unidades por bulto y el costo del bulto; el sistema calcula las unidades y el costo por unidad. Las unidades por bulto vienen sugeridas desde el producto (si tiene) y **se pueden cambiar en cada compra**. Si ese cambio actualiza el valor sugerido del producto: H-07. | PA-06 (resuelta), H-07 |
| COM-03 | El costo que se carga es el **costo final por unidad, con todo incluido** (IVA y percepciones). El total de la compra es la suma de sus líneas. | PA-24 (resuelta) |
| COM-04 | Al guardar la compra, en un solo paso: suma el stock (un movimiento por producto), el costo de cada producto pasa a ser el **último costo pagado** y **toda compra suma deuda** con el proveedor. | R3, PA-05 (resuelta), PA-07 (resuelta) |
| COM-05 | **"Pagar ahora":** al guardar la compra se puede registrar el pago en el mismo paso (con cualquiera de los orígenes de PRV-04). | PA-07 (resuelta) |
| COM-06 | Si el costo de un producto cambió, el sistema **avisa**, muestra costo anterior y nuevo, y **sugiere el nuevo precio de venta** (con margen y redondeo). El usuario lo confirma, lo modifica o deja el precio como estaba. | R3, R4 |
| COM-07 | Adjuntar una o más fotos o archivos de la factura/remito; quedan guardados con la compra y se pueden ver después. Formatos y tamaño máximo propuestos: JPG, PNG o PDF de hasta 10 MB cada uno. | R3 + Propuesta |
| COM-08 | Sin lectura automática de facturas. | R3 |
| COM-09 | Una compra mal cargada **no se edita**: se **anula** (encargado o dueño) y se carga de nuevo. La anulación revierte el stock y la deuda y queda en auditoría. Los costos y precios que ya cambiaron no se revierten solos. | PA-25 (resuelta) |
| COM-10 | Solo encargado o dueño cargan compras. El encargado ve los costos en esta pantalla. | R5, PA-03 (resuelta) |

### 4.5 Precios (PRE)

| ID | Requisito | Origen |
|---|---|---|
| PRE-01 | Precio sugerido = costo + margen % sobre el costo (ej.: costo $1.000 + 40% = $1.400), y después se redondea. | R4 |
| PRE-02 | El margen se busca en este orden: **producto → subcategoría → categoría**. La categoría siempre tiene margen; producto y subcategoría pueden no tenerlo. | R4, PA-22 (resuelta) |
| PRE-03 | Redondeo **siempre hacia arriba**, a $10 (ej.: $1.432 → $1.440). El paso ($10) es configurable. | R4, PA-19 (resuelta) |
| PRE-04 | Cambio manual del precio de un producto (encargado o dueño). El **margen guardado queda igual** y el sistema muestra el **"margen real"** que da ese precio. | R5, PA-21 (resuelta) |
| PRE-05 | Aumento masivo por porcentaje, por proveedor o por categoría (encargado o dueño). En cada aumento se elige si se aplica **sobre el costo** (y el precio se recalcula con margen y redondeo) o **sobre el precio** (y se redondea), con **vista previa** antes de confirmar. **Solo aumentos**, no bajas. | R4, R5, PA-23 (resuelta) |
| PRE-06 | Historial de cambios de precio y costo por producto: valor anterior, valor nuevo, origen (manual, compra o aumento masivo), usuario y fecha. | Propuesta |
| PRE-07 | Cambiar un precio no modifica ventas ya registradas (ver regla 4 de ventas). | Propuesta |
| PRE-08 | El encargado ve los costos en la pantalla de precios (para el precio sugerido), no en reportes. | PA-03 (resuelta) |

### 4.6 Caja (CAJ)

| ID | Requisito | Origen |
|---|---|---|
| CAJ-01 | Caja **por turno**: el empleado abre la caja escribiendo el **efectivo inicial** que cuenta, y la cierra al irse. | R4, PA-30 (resuelta) |
| CAJ-02 | **Una sola caja abierta en todo el kiosco.** Para abrir otra hay que cerrar la anterior. Cualquier usuario vende en la caja abierta. Quién puede cerrar una caja que otro dejó abierta: H-04. | PA-02 (resuelta), H-04 |
| CAJ-03 | **Cierre a ciegas:** al cerrar, el empleado carga **solo el efectivo** que contó, **sin ver** cuánto debería haber. Los otros medios de pago se muestran como información a encargado y dueño. | R4, PA-28 (resuelta) |
| CAJ-04 | El sistema calcula el **efectivo esperado** = efectivo inicial + cobros en efectivo del turno + ingresos de efectivo − salidas de efectivo. **Diferencia** = contado − esperado. | R4 + Propuesta (fórmula) |
| CAJ-05 | La diferencia del arqueo solo la ven encargado y dueño, y **solo se informa** (no genera ningún otro registro). | R4, R5, PA-30 (resuelta) |
| CAJ-06 | Movimientos de caja: ingresos y salidas de efectivo con motivo, descripción, usuario y fecha. **Los registran solo encargado y dueño.** Motivos: **pago a proveedor, retiro del dueño, gasto, aporte de cambio, devolución por anulación, otro**. | R4, R5, PA-29 (resuelta) |
| CAJ-07 | Un pago a proveedor con efectivo de la caja genera automáticamente la salida de caja correspondiente. | R4, PA-08 (resuelta) |
| CAJ-08 | **Un cierre hecho no se corrige:** sus números quedan fijos. Encargado o dueño (los que ven la diferencia, Propuesta) le pueden **agregar notas**. | PA-30 (resuelta) |
| CAJ-09 | Desde afuera del local **no se maneja la caja**: no se abre, no se cierra y no se registran movimientos. | PA-01 (resuelta) |

### 4.7 Usuarios y roles (USR)

| ID | Requisito | Origen |
|---|---|---|
| USR-01 | Cada persona entra con su propio usuario y contraseña. | R5 |
| USR-02 | Tres roles fijos (empleado, encargado, dueño) con los permisos de la sección 3. Puede haber **más de un dueño**. | R5, PA-37 (resuelta) |
| USR-03 | Solo el dueño crea, edita y desactiva usuarios. Si alguien **olvida su contraseña, la resetea el dueño**. | R5, PA-37 (resuelta) |
| USR-04 | Si el dueño olvida su contraseña: **procedimiento documentado** que se ejecuta en la PC del kiosco. | PA-37 (resuelta) |
| USR-05 | Las contraseñas se guardan cifradas (bcrypt), nunca en texto. | CLAUDE.md |
| USR-06 | Los usuarios no se borran: se desactivan (así sus ventas y movimientos siguen mostrando quién los hizo). | Propuesta |
| USR-07 | La sesión dura **hasta 12 horas** (o hasta cerrar sesión), con un botón visible de **"cambiar usuario"** para la PC compartida del mostrador. | PA-37 (resuelta) |

### 4.8 Reportes (REP)

Todos los reportes tienen **filtro de fechas** y se pueden **exportar a Excel** (R6).

| ID | Reporte | Quién lo ve | Origen |
|---|---|---|---|
| REP-01 | Ventas por día, por turno y por medio de pago. El **recargo de crédito se muestra aparte**. | Encargado, Dueño | R6, R5, PA-31 (resuelta) |
| REP-02 | Productos más vendidos y productos **sin movimiento** (sin ventas en el rango de fechas del filtro, sin configuración extra) | Encargado, Dueño | R6, R5, PA-34 (resuelta) |
| REP-03 | Ganancia por período y por categoría. El recargo **no suma** a la ganancia (se muestra aparte). | Solo Dueño | R6, R5, PA-31 (resuelta) |
| REP-04 | Stock valorizado (stock × costo actual). Los productos con stock negativo se muestran aparte y no restan. | Solo Dueño | R6, R5 + Propuesta |
| REP-05 | Diferencias de caja por turno y por empleado | Encargado, Dueño | R6, R5 |
| REP-06 | Deuda con proveedores (saldo por proveedor) | Encargado, Dueño | R6, R5 |
| REP-07 | Lista "Para reponer" (también por proveedor) | Encargado, Dueño | R2, R3 |
| REP-08 | Ventas de **"Varios"** (fecha, precio, usuario, descripción si la tiene), para revisarlas | Encargado, Dueño | PA-10 (resuelta) |
| REP-09 | Exportar cualquiera de los reportes a Excel (.xlsx) | Según el reporte | R6 |

**Reglas de reportes**

1. Las ventas anuladas **no** suman en ventas ni en ganancia (se pueden listar aparte). (Propuesta)
2. Ganancia de una línea = importe cobrado por el producto (después del descuento) − cantidad × costo guardado en la venta. **Sin el recargo.** (R6, PA-31 resuelta)
3. "Un día" = **día calendario** (00:00 a 23:59, hora de Buenos Aires). **[A confirmar con el cliente]** si el kiosco cierra después de medianoche (PA-32).

### 4.9 Configuración (CFG)

Solo el dueño (R5), salvo lo indicado.

| ID | Requisito | Origen |
|---|---|---|
| CFG-01 | % de recargo de crédito (aprox. 10%); los demás medios en 0%. | R1, PA-12 (resuelta) |
| CFG-02 | Margen de cada categoría (obligatorio) y de cada subcategoría (opcional). | R4, PA-22 (resuelta), PA-33 (resuelta) |
| CFG-03 | Paso del redondeo de precios (hoy $10; 0 = sin redondeo). Siempre hacia arriba. | R4, PA-19 (resuelta) |
| CFG-04 | Activar o desactivar medios de pago y ordenar cómo aparecen al cobrar. | Propuesta |
| CFG-05 | Nombre del negocio (para encabezados de reportes y del texto de pedidos). | Propuesta |
| CFG-06 | Usuarios (ver USR-03). | R5 |

---

## 5. Requisitos no funcionales (NF)

| ID | Requisito | Origen |
|---|---|---|
| NF-01 | **Servidor local:** la aplicación (servidor, base de datos y pantallas) corre en la PC del kiosco. En Windows, PostgreSQL se instala directo (sin Docker). | R6, PA-36 (resuelta) |
| NF-02 | **Funciona sin internet:** se puede vender y usar todo el sistema sin conexión. Solo necesitan internet: el acceso remoto (NF-14), abrir WhatsApp para mandar un pedido y la copia de seguridad a la nube (NF-04). | R6 |
| NF-03 | **Acceso por WiFi local:** tablets y celulares entran con el navegador por la red del local. Las pantallas se adaptan a celular y tablet. | R6 |
| NF-04 | **Copias de seguridad automáticas** de la base de datos **y** de los archivos adjuntos de compras: **una diaria y otra al cerrar cada caja**, guardando las **últimas 30**. Copia en la **nube** (y en pendrive si se puede). **[A confirmar con el cliente]** qué servicio de nube (PA-35). | R6, PA-35 (resuelta) |
| NF-05 | **Una sucursal.** El diseño de datos permite agregar sucursales en el futuro sin rehacer todo. | R6 |
| NF-06 | **Lector y teclado:** compatible con lector de código de barras USB en modo teclado (código + Enter). El punto de venta se puede usar entero con teclado (el cursor vuelve solo al buscador, atajos para cobrar). Se puede probar tipeando el código. | R1 + Propuesta |
| NF-07 | **Formato argentino (es-AR):** dinero como `$ 1.440` (sin centavos al cobrar), fechas `dd/mm/aaaa`, hora de 24 h, zona horaria de Buenos Aires. | Propuesta, PA-20 (resuelta) |
| NF-08 | **Auditoría** de acciones sensibles: anular venta, ajustar stock, cambiar precios (manual y masivo), cerrar caja, salidas e ingresos de caja. También: ingresos al sistema (correctos y fallidos), cambios de usuarios y de configuración, anulación de compras, notas agregadas a cierres de caja e importaciones de productos. Se guarda quién, cuándo, qué, desde dónde (IP) y los valores antes/después. No se puede borrar ni editar desde el sistema. | Orquestador + Propuesta |
| NF-09 | **Seguridad:** login propio con JWT en cookie `httpOnly` y contraseñas con bcrypt; permisos verificados en el servidor. Ver también NF-14 a NF-16. | CLAUDE.md |
| NF-10 | **Dinero exacto:** nunca números con coma flotante para dinero (ver `docs/modelo-datos.md`). | CLAUDE.md |
| NF-11 | **Operaciones "todo o nada":** una venta, su stock, sus pagos y su caja se guardan juntos; si algo falla (o se corta la luz) no queda una venta a medias. Lo mismo para compras, pagos y anulaciones. | Propuesta |
| NF-12 | **Rapidez en el mostrador:** leer un código y ver el producto en la venta en menos de 1 segundo en la PC del kiosco. | Propuesta |
| NF-13 | **Configuración fuera del código:** claves, rutas de backups y de adjuntos, zona horaria, etc., en `.env` (documentado en `.env.example`). | CLAUDE.md |
| NF-14 | **Acceso remoto con Tailscale:** dueño y encargado entran desde fuera del local a través de Tailscale hacia la PC del kiosco, **siempre con HTTPS**. El servidor sigue en la PC del local. **No se abren puertos del router** ni se expone la base de datos. Si se corta internet en el local, se sigue vendiendo y solo se pierde el acceso remoto mientras dure el corte. Desde afuera **no se vende ni se maneja la caja**; el servidor tiene que poder distinguir un acceso remoto de uno local (H-01). Se implementa como **etapa aparte, al final**. | R6, PA-01 (resuelta), H-01 |
| NF-15 | **Login igual adentro y afuera:** el inicio de sesión y la cookie de sesión tienen que funcionar bien tanto por el WiFi del local como a través de Tailscale con HTTPS (cookie `httpOnly`, `Secure` cuando corresponda, `SameSite`, dominio correcto). Lo define `seguridad` (PA-39). | R6 + Propuesta |
| NF-16 | **Protección del login:** como el sistema queda alcanzable desde afuera, se limitan los intentos de login fallidos y se registran en auditoría. | Propuesta |
| NF-17 | **La venta nunca depende de internet:** la PC del mostrador tiene que poder entrar y vender aunque no haya conexión. | PA-39 (regla fija) |

---

## 6. Glosario

- **Turno / caja:** período entre que alguien abre la caja (con efectivo inicial) y la cierra. Hay una sola caja abierta a la vez.
- **Arqueo / cierre a ciegas:** al cerrar se cuenta el efectivo; el empleado no ve el monto esperado.
- **Movimiento de caja:** entrada o salida de efectivo que no es una venta (gasto, retiro, pago a proveedor, aporte de cambio, devolución por anulación).
- **Movimiento de stock:** cada suma o resta de stock con su motivo (venta, compra, ajuste, anulación).
- **Cuenta corriente con proveedor:** lo que se le debe a cada proveedor (compras menos pagos).
- **Margen:** % que se suma al costo para calcular el precio de venta (del producto, de la subcategoría o de la categoría).
- **Margen real:** el % que resulta del precio actual comparado con el costo, cuando el precio se cambió a mano.
- **Recargo:** % que se suma al cobrar con crédito.
- **Bulto:** caja o paquete que trae varias unidades (ej.: caja de 12 latas).
- **"Varios":** producto especial para vender algo no cargado, con precio escrito a mano.

---

## 7. Decisiones y pendientes

### 7.1 Decisiones tomadas (Ronda 7 de `relevamiento.md`)

| PA | Decisión |
|---|---|
| PA-01 | Acceso remoto con Tailscale; entran dueño y encargado; desde afuera todo menos vender y manejar la caja. |
| PA-02 | Una sola caja abierta en todo el kiosco; cualquier usuario vende en ella y queda registrado quién. |
| PA-03 | El encargado ve costos solo en las pantallas de compras y precios. |
| PA-04 | Un proveedor habitual por producto. |
| PA-05 | El costo pasa a ser el último costo pagado. |
| PA-06 | Compras por unidad o por bulto, a elección en cada línea; unidades por bulto editables en cada compra (sugeridas desde el producto). |
| PA-07 | Toda compra suma deuda; en el mismo paso se puede "pagar ahora". |
| PA-08 | Pago a proveedor: efectivo de la caja, efectivo de afuera, transferencia u otro; solo el de la caja afecta el arqueo. |
| PA-09 | El peso se escribe a mano al vender. |
| PA-10 | Producto "Varios" con precio a mano; queda registrado para revisar en reportes. |
| PA-11 | Un código de barras por producto. |
| PA-12 | Un único % de recargo para crédito, sin cuotas. |
| PA-13 | IVA opcional por producto (21% por defecto); no cambia cálculos en la v1. A confirmar con el cliente (7.2). |
| PA-14 | Recargo calculado antes del descuento y solo sobre la parte pagada con crédito (ver regla 3 de ventas). |
| PA-15 | Descuento sobre el total, en $ o %, con motivo opcional. |
| PA-16 | Sin autorización en la pantalla del empleado: encargado o dueño desde su propia sesión. |
| PA-17 | Se puede anular una venta de un turno cerrado; la devolución sale de la caja abierta; la caja vieja no cambia. |
| PA-18 | Sin ventas en espera; no se cierra la caja con un carrito sin cobrar. |
| PA-19 | Redondeo de precios siempre hacia arriba, a $10. |
| PA-20 | Lo que se cobra se redondea al peso entero. |
| PA-21 | Precio cambiado a mano: el margen guardado queda igual; se muestra el margen real. |
| PA-22 | Margen en producto → subcategoría → categoría. |
| PA-23 | Aumento masivo sobre costo o precio, a elección, con vista previa; solo aumentos. |
| PA-24 | Costo final por unidad con todo incluido (IVA y percepciones). |
| PA-25 | Compra mal cargada: se anula (revierte stock y deuda) y se carga de nuevo. |
| PA-26 | Para reponer = stock ≤ mínimo; se sugiere lo que falta para el mínimo, editable. |
| PA-27 | Motivos de ajuste: rotura, faltante, corrección por conteo, carga inicial, consumo propio, otro. |
| PA-28 | En el cierre a ciegas se cuenta solo el efectivo. |
| PA-29 | Ingresos y salidas de caja: encargado y dueño; motivos: pago a proveedor, retiro del dueño, gasto, aporte de cambio, devolución por anulación, otro. |
| PA-30 | Efectivo inicial lo escribe el empleado; diferencias solo se informan; un cierre no se corrige, solo se le agregan notas. |
| PA-31 | El recargo se muestra aparte y no suma a la ganancia. |
| PA-32 | "Día" = día calendario (Buenos Aires). A confirmar con el cliente (7.2). |
| PA-33 | Categorías: las editan encargado y dueño; el margen de categoría y subcategoría, solo el dueño. |
| PA-34 | "Sin movimiento" = sin ventas en el rango del filtro de fechas. |
| PA-35 | Backups diarios y al cerrar cada caja, 30 copias, con adjuntos, en la nube (y pendrive si se puede). Servicio a confirmar (7.2). |
| PA-36 | En Windows, PostgreSQL instalado directo. Datos de la PC a confirmar (7.2). |
| PA-37 | El dueño resetea contraseñas; procedimiento para el dueño; puede haber más de un dueño; sesión de hasta 12 h con "cambiar usuario". |
| PA-38 | Importación de productos desde Excel, además de la carga manual. |
| PA-39 | Lo decide `seguridad` (7.3). Regla fija: la venta nunca depende de internet. |

### 7.2 A confirmar con el cliente

| PA | Qué hay que confirmar | Decisión provisoria |
|---|---|---|
| PA-13 | Condición fiscal: ¿responsable inscripto (lo más probable) o monotributo? | Se guarda el IVA de cada producto como campo opcional (21% por defecto). En la v1 no cambia ningún cálculo. |
| PA-32 | ¿El kiosco cierra después de medianoche? | "Día" = día calendario. Si cierra después de medianoche, hay que redefinir el día de los reportes. |
| PA-35 | ¿Qué servicio de nube se usa para las copias (Google Drive, Dropbox, OneDrive…)? | Copia diaria y al cerrar cada caja, 30 copias, con adjuntos; en la nube y en pendrive si se puede. |
| PA-36 | Sistema operativo y versión, RAM, si tiene UPS y si la PC queda prendida fuera del horario (afecta también al acceso remoto). | En Windows, PostgreSQL instalado directo (sin Docker). Se recomienda UPS. |

### 7.3 PA-39 — HTTPS dentro del local y cookie de sesión (para `seguridad`)

La cookie de sesión debería ser `Secure` (solo viaja por HTTPS). Por Tailscale hay HTTPS, pero por el WiFi del local, si se entra con `http://192.168.x.x`, una cookie `Secure` no funciona. Opciones:

- a) Usar **también dentro del local** la dirección de Tailscale (nombre interno con certificado HTTPS). Requiere Tailscale en cada dispositivo y probar que funcione con internet cortado. **Choca con H-01:** si todos entran por Tailscale, el servidor no puede distinguir quién está adentro y quién afuera.
- b) Servir HTTPS en la red local con un certificado propio instalado en cada tablet/celular, y Tailscale para afuera.
- c) Dentro del local por HTTP (cookie sin `Secure`) y por Tailscale con HTTPS (cookie `Secure`), según cómo se entra.

**Decide `seguridad` antes de la etapa de login**, junto con H-01. **Regla fija:** la venta en la PC del mostrador nunca puede depender de internet (NF-17).

### 7.4 Huecos nuevos (aparecieron al incorporar las respuestas)

No están definidos en `relevamiento.md`. Cada uno tiene opciones y una recomendación del arquitecto; **decide el dueño** (H-01 lo decide `seguridad`).

| H | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| H-01 | ¿Cómo sabe el servidor que un acceso es "desde afuera" para bloquear venta y caja? | a) Por la red de origen: Tailscale (direcciones `100.x`) = afuera; WiFi del local o la misma PC = adentro. b) Solo los dispositivos registrados como "mostrador" pueden vender y manejar la caja. c) Sin bloqueo técnico, solo se ocultan las opciones. | a), lo que implica que adentro **no** se entre por Tailscale (condiciona PA-39). Decide `seguridad`. |
| H-02 | ¿Se puede **anular una venta desde afuera**? Si tuvo efectivo, la devolución es un movimiento de la caja (que desde afuera no se maneja). | a) No se anulan ventas desde afuera. b) Solo ventas sin pagos en efectivo. c) Sí, y la devolución se registra igual en la caja abierta. | a): es lo más simple y coherente con "no manejar la caja desde afuera". |
| H-03 | Anular una venta con efectivo **cuando no hay ninguna caja abierta**. | a) No se puede hasta que haya una caja abierta. b) Se anula y la devolución queda sin caja. | a): así la devolución siempre impacta en un arqueo. |
| H-04 | Si quien abrió la caja se fue sin cerrarla, ¿quién la cierra? (Con una sola caja, nadie más puede abrir otra.) | a) Solo quien la abrió. b) Quien la abrió, o un encargado o el dueño (contando a ciegas igual; queda registrado). | b). Si no, el kiosco queda trabado. |
| H-05 | ¿Quién cambia el **margen propio de un producto**? (PA-33 solo habla de categoría y subcategoría.) | a) Solo el dueño, como los otros márgenes. b) Encargado y dueño, como los precios. | a): la matriz pone "márgenes" en configuración, que es solo del dueño. |
| H-06 | Redondeo al peso entero (PA-20): ¿hacia dónde? Aplica a importes por peso, descuento en % y recargo. | a) Al más cercano ($0,50 sube). b) Siempre hacia arriba. c) Siempre hacia abajo. | a): la diferencia es de centavos y no favorece a nadie. |
| H-07 | Si en una compra se cambian las unidades por bulto, ¿se actualiza el valor sugerido del producto? | a) Sí, queda el último usado. b) No, solo se cambia desde la ficha del producto. | a): igual que el costo, queda el último. |
| H-08 | Pedido sugerido cuando el stock es **igual** al mínimo: "lo que falta para el mínimo" da 0. | a) Se muestra con 0 y el usuario completa. b) Se sugiere al menos 1. c) Se sugiere al menos 1 bulto (si el producto tiene unidades por bulto). | b). |
| H-09 | Producto "Varios": no tiene costo. ¿Cómo entra en la ganancia y en qué categoría está? | a) Costo 0, categoría y subcategoría "Varios"; sus ventas se muestran aparte y **no** entran en la ganancia. b) Se le asigna un margen estimado para calcular ganancia. | a), con una descripción opcional al venderlo ("qué era"). |
| H-10 | ¿Se permite un descuento del 100% (venta con total $0)? | a) Sí (venta sin pagos). b) No: el descuento tiene que ser menor que el subtotal; los regalos o el consumo propio se registran como ajuste de stock. | b). |
| H-11 | Validar con el dueño la regla 3 de ventas en **pago mixto** (ejemplo 2: el descuento se reparte en proporción y el recargo va sobre la parte de crédito antes del descuento). | a) Así (reparto proporcional). b) Otra interpretación que dé el dueño. | a): es la lectura directa de "antes del descuento y solo sobre la parte de crédito". |
| H-12 | ¿Hace falta guardar los pedidos enviados a proveedores? (R3 y PA-26 no lo piden.) | a) No, solo se genera el texto. b) Sí, con fecha y estado. | a). |
| H-13 | ¿Qué cobra el posnet en ventas mixtas? | Se informa al vendedor el monto a cobrar con crédito **con** el recargo (ej. 2: $5.000). | Solo confirmar que así se opera hoy. |
| H-14 | Detalles de la importación de Excel: si un producto ya existe (mismo código), ¿se actualiza o se saltea? Si la categoría o subcategoría no existe, ¿se crea? | a) Se actualiza el existente y se crean las categorías que falten, con vista previa y resumen de errores antes de confirmar. b) Se saltean los existentes y se rechazan filas con categorías desconocidas. | a), con vista previa obligatoria. Solo encargado y dueño (como cargar productos). |
