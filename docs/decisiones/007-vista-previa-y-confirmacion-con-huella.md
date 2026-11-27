# ADR 007 — Vista previa y confirmación con huella (aumentos masivos)

- **Estado:** propuesto (etapa 6; lo revisa `seguridad` al cerrar la etapa)
- **Fecha:** 2026-11-27
- **Etapa:** 6 (Precios)
- **Origen:** PRE-05 y PA-23 ("con vista previa antes de confirmar"), plan etapa 6 (tests: "la vista previa no cambia nada", "la confirmación coincide con la vista previa"; seguridad: "que la confirmación no acepte precios mandados por la pantalla (se recalculan)" y "límites razonables").
- **Relacionado:** ADR 002 (el servidor recalcula todo), `docs/api/precios.md` 4.5, 5 y 6. **Número:** el 006 queda reservado para el ADR de instalación (etapa 8).

## Contexto

Un aumento masivo cambia de una vez el precio de decenas o cientos de productos. La persona primero ve una **vista previa** (antes y después de cada producto) y después **confirma**. Entre las dos pueden pasar minutos y, mientras tanto, otro usuario puede cambiar un precio, cargar una compra que cambia un costo, mover un producto de proveedor o cambiar un margen. Hay que garantizar dos cosas:

1. Lo que se guarda es **exactamente** lo que la persona vio (si algo cambió, se le muestra de nuevo).
2. La pantalla **no puede mandar precios**: el servidor es la autoridad (ADR 002 punto 1.4).

## Decisión

1. **La vista previa no guarda nada.** Es un `GET` que calcula y devuelve los productos con su antes y después, más una **huella** (`previewHash`): el SHA-256 de un texto armado siempre igual con los parámetros del aumento, el paso de redondeo y, por cada producto (ordenados por `id`), sus valores de antes, el margen y el IVA usados y sus valores de después; también los productos salteados y su motivo (detalle exacto en `precios.md` 4.5).
2. **La confirmación manda los mismos parámetros y la huella**, nunca precios. El servidor, dentro de la transacción y con los productos bloqueados, **vuelve a calcular todo** con la misma función de `shared`, arma la huella de nuevo y la compara: si es distinta, responde `409 BULK_PREVIEW_OUTDATED` y no guarda nada; la pantalla pide una vista previa nueva.
3. **La huella no es un secreto ni hace falta firmarla:** como el servidor recalcula todo, una huella inventada solo pasa si coincide con lo que el servidor calcula en ese momento, es decir, con lo mismo que habría mostrado la vista previa.
4. **Doble envío:** después del primer aumento los valores de "antes" cambian, la huella ya no coincide y un segundo envío da `409`: el mismo aumento nunca se aplica dos veces. Además, como en el resto de la API, un `clientRequestId` permite que un reintento por WiFi cortado devuelva el mismo resultado (`200`, `isReplay`).
5. **Lo que la persona puede cambiar después de ver la vista previa** (por ejemplo, destildar productos, si el dueño lo aprueba: H-74) **no entra en la huella**: va aparte en la confirmación y se valida contra la lista recalculada.
6. **Topes técnicos:** hasta 2000 productos por aumento (tamaño de la respuesta y tiempo de la transacción) y el tope de porcentaje que decida el dueño (H-75).

## Alternativas descartadas

| Alternativa | Por qué no |
|---|---|
| Guardar la vista previa en una tabla y confirmar por su `id` | Más estado que mantener y limpiar (vistas previas abandonadas), y de todos modos hay que verificar que los datos no cambiaron entre medio. |
| Que la confirmación mande la lista de precios nuevos y el servidor la compare | La pantalla mandaría precios (lo que el plan pide evitar) y el pedido sería grande; comparar la huella es lo mismo, más corto y sin confiar en nada de la pantalla. |
| Confirmar sin comparar nada (recalcular y aplicar) | Se podría guardar algo distinto de lo que se vio (por ejemplo, un producto que se sumó al proveedor después), y un doble clic aplicaría el aumento dos veces. |
| Comparar por `updatedAt` de cada producto | No detecta cambios de margen en la categoría o subcategoría ni del paso de redondeo, que también cambian el resultado. |

## Consecuencias

**A favor**
- Simple: sin tablas nuevas para la vista previa y una sola función de cálculo para la vista previa, la confirmación y los tests.
- Se cumple "lo que ves es lo que se guarda" y "la pantalla no manda precios" a la vez.
- El mismo patrón sirve para la **importación desde Excel** (etapa 8, H-14: vista previa obligatoria).

**En contra / cuidados**
- Si otro usuario toca un precio del grupo entre la vista previa y la confirmación, hay que volver a pedir la vista previa (es lo correcto, pero es un paso más).
- El texto que se hashea tiene que armarse **siempre igual** (orden, decimales, `null`): un test fija el texto exacto. Si se cambia la forma, se sube la versión (`"v": 1`).
