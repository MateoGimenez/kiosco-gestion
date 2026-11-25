// Textos claros para los errores de la API que pueden aparecer en varias pantallas.
import { ApiError } from './api';

const MESSAGES_BY_CODE: Record<string, string> = {
  // H-19
  LAST_ACTIVE_OWNER:
    'Tiene que quedar al menos un dueño activo. Antes, dejá a otra persona como dueño.',
  CANNOT_RESET_OWN_PASSWORD:
    'Tu propia contraseña no se resetea desde Usuarios. Usá "Cambiar mi contraseña", que pide la actual.',
  // H-20
  LOCAL_ONLY:
    'Esto solo se puede hacer desde el local. Conectate al WiFi del local y probá de nuevo.',
  // Etapa 2: productos, categorías y stock (docs/api/productos-stock.md, sección 10).
  CATEGORY_NAME_TAKEN: 'Ya existe una categoría con ese nombre. Elegí otro.',
  SUBCATEGORY_NAME_TAKEN: 'Ya existe una subcategoría con ese nombre en esta categoría.',
  BARCODE_TAKEN: 'Ese código de barras ya es de otro producto.',
  CATEGORY_INACTIVE: 'La categoría está desactivada. Reactivala primero.',
  SUBCATEGORY_NOT_FOUND: 'La subcategoría que elegiste ya no existe. Elegí otra.',
  SUBCATEGORY_INACTIVE:
    'La categoría o la subcategoría están desactivadas. Elegí otra o reactivalas.',
  SALE_UNIT_NOT_WHOLE:
    'Para venderlo por unidad, el stock y el mínimo tienen que ser números enteros. Corregí el stock con un ajuste.',
  MISC_PRODUCT_LOCKED: 'El producto "Varios" solo permite cambiar el nombre y el IVA.',
  MISC_PRODUCT_NO_STOCK: '"Varios" no lleva stock.',
  MISC_CATEGORY_LOCKED:
    'La categoría de "Varios" no se puede desactivar: siempre tiene que estar disponible para vender.',
  CATEGORY_HAS_ACTIVE_PRODUCTS:
    'Tiene productos activos. Movelos a otra categoría o desactivalos primero.',
  SUBCATEGORY_HAS_ACTIVE_PRODUCTS:
    'Tiene productos activos. Movelos a otra subcategoría o desactivalos primero.',
  PRICE_BELOW_COST:
    'El precio de venta queda por debajo del costo. Revisalo o confirmá que es a propósito.',
  STOCK_COUNT_UNCHANGED: 'Lo contado es igual al stock actual: no hay nada que corregir.',
  FORBIDDEN: 'No tenés permiso para hacer esto. Si lo necesitás, pedíselo al dueño.',
};

/** Mensaje para mostrar: el nuestro si el `code` es conocido; si no, el que mandó la API. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES_BY_CODE[error.code] ?? error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en un momento.';
}
