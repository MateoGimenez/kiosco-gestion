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
  // Etapa 3: ventas, caja y medios de pago (docs/api/ventas.md, sección 11).
  SALE_REQUEST_ID_REUSED: 'Esa venta ya se había cobrado. Revisá antes de cobrar de nuevo.',
  SALE_TOTAL_CHANGED:
    'El total cambió (un precio o el recargo se actualizó). Revisá el nuevo total y cobrá de nuevo.',
  SALE_ALREADY_VOIDED: 'Esta venta ya está anulada.',
  PRODUCT_NOT_FOUND: 'Un producto de la venta ya no existe. Sacalo para cobrar.',
  PRODUCT_INACTIVE: 'Un producto de la venta está desactivado. Sacalo para cobrar.',
  MISC_PRICE_REQUIRED: 'Escribí el precio de "Varios".',
  LINE_FIELD_NOT_ALLOWED: 'El precio y la descripción solo se escriben en "Varios".',
  LINE_TOTAL_ZERO: 'Una línea da $ 0. Revisá el precio o la cantidad.',
  DISCOUNT_TOO_HIGH: 'El descuento tiene que ser menor que el subtotal.',
  DISCOUNT_ROUNDS_TO_ZERO: 'El descuento es tan chico que da $ 0.',
  PAYMENT_METHOD_NOT_FOUND: 'Ese medio de pago no existe.',
  PAYMENT_METHOD_INACTIVE: 'Ese medio de pago está desactivado. Elegí otro.',
  PAYMENTS_TOTAL_MISMATCH: 'Los pagos tienen que sumar exactamente el total.',
  CASH_TENDERED_WITHOUT_CASH: 'Para calcular el vuelto tiene que haber un pago en efectivo.',
  CASH_TENDERED_TOO_LOW: 'Lo que entregó el cliente no alcanza para la parte en efectivo.',
  SALE_AMOUNT_OUT_OF_RANGE: 'El importe es demasiado grande.',
  SURCHARGE_NOT_ALLOWED: 'Solo el crédito lleva recargo.',
  CASH_METHOD_LOCKED: 'El efectivo no se puede desactivar.',
  CASH_SESSION_ALREADY_OPEN:
    'Ya hay una caja abierta. Para abrir otra, primero hay que cerrar esa.',
  CASH_SESSION_REQUIRED: 'No hay ninguna caja abierta. Abrí la caja para seguir.',
  // Etapa 4: cierre, movimientos y notas (docs/api/caja.md, sección 7).
  CASH_SESSION_ALREADY_CLOSED: 'Esta caja ya está cerrada.',
  CASH_AMOUNT_OUT_OF_RANGE:
    'Un total de la caja es demasiado grande para guardarlo. No se cerró nada: avisale al dueño.',
  CASH_SESSION_NOT_CLOSED: 'Las notas se agregan a una caja cerrada.',
  // Etapa 5: proveedores, compras, pagos y adjuntos (docs/api/proveedores.md y compras.md).
  SUPPLIER_NAME_TAKEN: 'Ya hay un proveedor con ese nombre (puede estar desactivado). Elegí otro.',
  SUPPLIER_NOT_FOUND: 'El proveedor ya no existe. Elegí otro.',
  SUPPLIER_INACTIVE: 'El proveedor está desactivado. Reactivalo para cargarle compras.',
  SUPPLIER_TAX_ID_DUPLICATE: 'Ya hay otro proveedor con ese CUIT.',
  OPENING_BALANCE_EXISTS:
    'Este proveedor ya tiene un saldo inicial. Para corregirlo, cargá una corrección.',
  PAYMENT_REQUEST_ID_REUSED:
    'Ese pago ya se había registrado. Revisá la cuenta antes de repetirlo.',
  PAYMENT_EXCEEDS_BALANCE: 'El pago es mayor que la deuda. Confirmalo si es a propósito.',
  PAYMENT_DATE_MUST_BE_TODAY: 'El pago con efectivo de la caja se registra con la fecha de hoy.',
  REFUND_REQUEST_ID_REUSED:
    'Esa devolución ya se había registrado. Revisá la cuenta antes de repetirla.',
  REFUND_EXCEEDS_CREDIT:
    'La devolución es mayor que el saldo a favor del kiosco. Confirmala si es a propósito.',
  REFUND_DATE_MUST_BE_TODAY:
    'La devolución en efectivo que entra a la caja se registra con la fecha de hoy.',
  DATE_IN_FUTURE: 'La fecha no puede ser posterior a hoy.',
  PURCHASE_REQUEST_ID_REUSED: 'Esa compra ya se había cargado. Revisala en la lista de compras.',
  PURCHASE_ALREADY_VOIDED: 'Esta compra ya está anulada.',
  PURCHASE_TOTAL_ZERO: 'La compra suma $ 0. Revisá los costos.',
  PURCHASE_AMOUNT_OUT_OF_RANGE: 'Un importe de la compra es demasiado grande. Revisá los números.',
  DUPLICATE_DOCUMENT: 'Ese comprobante ya está cargado para este proveedor.',
  STOCK_OUT_OF_RANGE: 'El stock resultante es demasiado grande. Revisá las cantidades.',
  ATTACHMENT_TOO_LARGE: 'El archivo pesa más de 10 MB. Sacá la foto de nuevo con menos calidad.',
  ATTACHMENT_TYPE_NOT_ALLOWED:
    'Ese archivo no se puede subir: solo fotos JPG o PNG y archivos PDF. Si es una foto del celular, mandala como JPG.',
  ATTACHMENT_LIMIT_REACHED: 'Ya hay 10 archivos en esta compra. Borrá alguno para subir otro.',
  UNSUPPORTED_MEDIA_TYPE: 'No se pudo subir el archivo. Probá de nuevo.',
  FORBIDDEN: 'No tenés permiso para hacer esto. Si lo necesitás, pedíselo al dueño.',
};

/** Mensaje para mostrar: el nuestro si el `code` es conocido; si no, el que mandó la API. */
export function friendlyMessage(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES_BY_CODE[error.code] ?? error.message;
  return 'Ocurrió un error inesperado. Probá de nuevo en un momento.';
}
