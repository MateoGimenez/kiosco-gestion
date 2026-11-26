# ADR 005 — Adjuntos de compras: dónde se guardan, cómo se validan y cómo se sirven

- **Estado:** propuesto (etapa 5, tarea 1; lo revisa `seguridad` al cerrar la etapa)
- **Fecha:** 2026-11-26
- **Etapa:** 5 (Proveedores y compras)
- **Origen:** COM-07 (JPG, PNG o PDF de hasta 10 MB, varios por compra), plan etapa 5 ("verificar el tipo real del archivo y no solo la extensión, tamaño, nombres aleatorios, que no se pueda leer otra ruta del disco, acceso solo con permiso"), NF-04 (los adjuntos van en las copias), NF-18 (cortes de luz), modelo D11 (adjuntos en disco).
- **Relacionado:** ADR 003 punto 5 (subidas `multipart`, CSRF), `docs/api/compras.md` sección 8.

## Contexto

Encargado y dueño sacan una foto de la factura o el remito con el celular (o suben un PDF) y queda guardada con la compra. Es la **primera ruta del sistema que recibe archivos**: un archivo es un dato que el servidor no controla (puede ser enorme, puede no ser lo que dice ser, su nombre puede intentar escribir en otra carpeta) y después se le **devuelve a un navegador** (si el navegador lo interpretara como una página, podría ejecutar código con la sesión del usuario).

## Decisión

1. **En disco, no en la base** (D11, ya aprobado). Carpeta `UPLOADS_DIR` del `.env`, plana (sin subcarpetas). La base guarda solo los datos del archivo (`PurchaseAttachment`). Las copias de seguridad incluyen la carpeta (etapa 8).
2. **Tipo real por los primeros bytes** ("magic bytes"): JPG `FF D8 FF`, PNG `89 50 4E 47 0D 0A 1A 0A`, PDF `%PDF-`. No se le cree a la extensión ni al `Content-Type` que manda el navegador. El tipo guardado (`mimeType`) y la extensión del archivo en disco salen **del tipo detectado**. Cualquier otro → `400 ATTACHMENT_TYPE_NOT_ALLOWED`.
3. **Tamaño:** `UPLOAD_MAX_MB` (10). Se lee el archivo **en memoria con ese tope** (el lector corta al llegar al límite) y una sola parte por pedido. El cuerpo se lee **después** de comprobar sesión, rol y que la compra existe.
4. **Nombre aleatorio:** 16 bytes de `crypto.randomBytes` en hexadecimal + extensión del tipo detectado. El nombre original se guarda solo para mostrar (limpio y recortado) y **nunca** entra en una ruta del disco.
5. **Escritura a prueba de cortes:** primero `<nombre>.tmp` (abierto con `wx`), forzado a disco, renombrado al nombre final; después la fila en la base, en una transacción. Si la transacción falla, se borra el archivo.
   - Si la luz se corta entre el renombre y la base, queda un archivo **sin fila**: no se ve en ningún lado y no molesta. Al arrancar, la API borra los `.tmp` de más de una hora y **avisa en el log** si hay archivos sin fila (no los borra sola: un error de configuración, como apuntar `UPLOADS_DIR` a otra carpeta, no debe terminar borrando archivos).
   - El orden inverso (primero la base, después el archivo) dejaría filas que apuntan a archivos que no existen: peor.
6. **Servir el archivo solo por la API**, a encargado y dueño, con la ruta armada desde `storedFileName` **de la base** (validado con `^[0-9a-f]{32}\.(jpg|png|pdf)$`) y comprobando que la ruta resuelta queda dentro de `UPLOADS_DIR`. La carpeta **nunca** se sirve como archivos estáticos. Encabezados: `Content-Type` guardado, `X-Content-Type-Options: nosniff` (el navegador no "adivina" otro tipo), `Content-Disposition` con el nombre codificado (`filename*=UTF-8''...`), `Cache-Control: no-store` y una CSP restrictiva para las imágenes.
7. **Configuración que falla cerrada:** si `UPLOADS_DIR` no existe se crea; si no se puede escribir, la API **no arranca** (igual que el resto del `.env`, ADR 003 punto 3). `UPLOAD_MAX_MB` entre 1 y 25.
8. **Borrar adjuntos:** pendiente del dueño (**H-54**). Mientras tanto no hay ruta: es lo único irreversible.

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar los archivos en la base (`bytea`) | La base crece rápido (cientos de fotos de 2 a 5 MB por mes), las copias se vuelven lentas y PostgreSQL en una PC de 8 GB sufre. Ya estaba decidido en D11. |
| Creerle a la extensión o al `Content-Type` del navegador | Se falsifican con solo renombrar el archivo. Es justo lo que el plan pide no hacer. |
| Librería de detección de tipos (`file-type`) | Para tres tipos alcanzan tres comparaciones de bytes; una dependencia más para mantener y revisar. Si algún día se aceptan más formatos, se reconsidera. |
| Volver a codificar las imágenes (por ejemplo con `sharp`) para limpiarlas y achicarlas | Es la defensa más fuerte contra archivos "dobles" (válidos como imagen y como otra cosa), pero `sharp` tiene partes nativas que complican la instalación en Windows (NF-01). Con `nosniff`, el tipo fijo y la CSP, el navegador nunca los trata como página. Queda como mejora si `seguridad` lo pide. |
| Guardar el archivo directo en disco mientras llega (sin memoria) | Para leer los primeros bytes y cortar a los 10 MB, en memoria es más simple; con pocos usuarios a la vez, 10 MB por pedido no pesa. |
| Nombres con la fecha o el id de la compra | Se podrían adivinar; el aleatorio no dice nada y no choca nunca. |

## Consecuencias

**A favor**
- Un archivo que no es JPG, PNG o PDF no entra, se llame como se llame.
- Ningún dato del pedido (nombre, ids, query) puede apuntar a otra carpeta del disco.
- Un corte de luz no deja adjuntos a medias ni filas que apuntan a archivos inexistentes.

**En contra / cuidados**
- Las fotos conservan sus datos internos (por ejemplo, la ubicación GPS si el celular la guarda). Solo las ven encargado y dueño; el manual puede sugerir sacar la ubicación de la cámara.
- Las fotos HEIC de iPhone no se aceptan tal cual; Safari las convierte a JPG al subirlas (el formulario pide solo JPG, PNG o PDF).
- Los archivos sin fila (punto 5) hay que revisarlos a mano si el log los avisa.
- El visor de PDF de cada navegador maneja distinto la CSP: `seguridad` lo prueba y, si hace falta, el PDF se descarga en lugar de abrirse en la página.

## Preguntas abiertas

- **H-54:** ¿se puede borrar un adjunto? (`docs/api/compras.md` 12).
