# 12. Cómo escribir números

Para: todo el personal.

El sistema usa la forma de escribir números de Argentina:

- La **coma** separa los decimales: `1.500,50` (mil quinientos con cincuenta centavos).
- El **punto** separa los miles, de a tres cifras: `1.500` (mil quinientos).

## Ejemplos

| Lo que querés escribir | Lo que tenés que tipear |
|---|---|
| Mil quinientos pesos | `1500` o `1.500` |
| Mil quinientos pesos con cincuenta centavos | `1.500,50` |
| Doce mil trescientos cuarenta y cinco | `12.345` |
| Un costo de 95 pesos con 5 centavos | `95,05` |
| Un margen de 40 por ciento | `40` |
| Un margen de 12,5 por ciento | `12,5` |
| Medio kilo de salame | `0,500` (en productos por kilo) |
| Doce unidades | `12` |

## Lo que el sistema no acepta

El punto **solo** puede ir como separador de miles, de a tres cifras. Estos casos dan error:

- `1.5`: el punto está usado como decimal. Escribilo con coma: `1,5`.
- `15.00`: no es un miles. Escribilo como `15` o `15,00`.

Si escribís `1.5`, el sistema responde: "Usá coma para los decimales (ej.: 1.500,50)".

## Cantidades según el producto

- **Por unidad**: solo números enteros, sin coma. `12` está bien. `2,5` no.
- **Por kilo**: hasta **3 decimales**. `0,350` está bien. `0,3505` no.

## Dinero

- Los precios y costos aceptan hasta **2 decimales** (centavos).
- Los importes no necesitan el signo `$`: escribí solo el número.

## Ajustes de stock

Al ajustar stock, escribí siempre el número **sin signo**. El sistema pone el signo solo según el motivo: si es una rotura, resta; si es una carga inicial, suma. Ver [guía 09](09-ajustar-stock.md).
