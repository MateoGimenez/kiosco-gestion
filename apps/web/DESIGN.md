# Diseño de la interfaz (apps/web)

Superficie de **trabajo** (herramienta de mostrador), no de marketing: manda la velocidad y la claridad.
Tema claro. Todo empaquetado localmente: sin CDN, sin fuentes ni íconos externos (CSP `default-src 'self'`).

## Escena de uso
PC del mostrador con teclado y lector de código de barras, fila esperando, luz de local. Dueño y encargado
también desde el celular. Usuarios no técnicos.

## Tokens (`src/styles/tokens.css`)
- **Color (OKLCH):** neutros cálidos con leve tinte verde, nunca gris puro. Marca: verde profundo `--color-primary`
  (texto blanco encima, contraste mayor a 7:1). Estados: `--color-danger`, `--color-success`, `--color-warning`,
  cada uno con su versión `-soft` para fondos. Un estado nunca se comunica solo con color: siempre lleva texto.
- **Tipografía:** fuentes del sistema (`system-ui`), sin descargas. Escala 15 / 17 / 20 / 26 / 34 px. Números
  con `tabular-nums` en todo el sistema para que los importes alineen.
- **Espaciado:** base de 4px (`--space-1` a `--space-7`). Radios 6 / 10 / 14 px. Sombra única `--shadow-sm`.
- **Tamaños táctiles:** mínimo 44px (`--target-min`); acciones principales y campos 56px (`--target-large`).
- **Foco:** anillo doble azul visible (`--focus-ring`) con `:focus-visible`; nunca se quita sin reemplazo.

## Criterios
- Todo se puede hacer con teclado; el foco siempre se ve. Botones y campos grandes.
- Textos en español rioplatense, con voseo ("Reintentar", "Revisá"). Los errores dicen qué pasó y qué hacer.
- Toda pantalla tiene estado de carga, error y vacío. Usar `LoadingState` y `ErrorMessage`.
- Sin tarjetas anidadas, sin degradados, sin decoración. Movimiento mínimo y respeta `prefers-reduced-motion`.
- Dinero y fechas en es-AR con las funciones de `@kiosco/shared`, nunca a mano.
- Mostrar u ocultar según el rol es solo comodidad (`layout/navigation.ts`); la seguridad es del backend.

## Componentes base (`src/components`, estilos en `src/styles/components.css`)
`Button` (primary, secondary, danger; `large`; `loading`), `TextField` (label, hint, error asociado con
`aria-describedby`), `ErrorMessage` (con "Reintentar" opcional), `LoadingState`. Layout: `layout/AppLayout`
(barra superior con usuario y "Cambiar usuario", navegación filtrada por rol).
