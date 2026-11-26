// Texto del pedido y link de WhatsApp.
//
// TODO(etapa 5): reemplazar por `buildSupplierOrderText` y `buildWhatsAppUrl` de @kiosco/shared
// (proveedores.md 11.3) apenas backend las publique. El formato es el del contrato.
import { Decimal, formatQuantity } from '@kiosco/shared';
import type { SaleUnit } from './types';

export interface OrderLine {
  name: string;
  saleUnit: SaleUnit;
  quantity: Decimal;
}

/** "7" para unidades; "1,25 kg" para peso (sin ceros de más). */
function quantityForOrder(line: OrderLine): string {
  if (line.saleUnit === 'UNIT') return formatQuantity(line.quantity, 'UNIT');
  const text = formatQuantity(line.quantity, 'KG').replace(' kg', '');
  return `${text.replace(/,(\d*?)0+$/, (_m, d: string) => (d ? `,${d}` : ''))} kg`;
}

export function buildOrderText(input: {
  storeName: string;
  supplierName: string;
  lines: OrderLine[];
}): string {
  const rows = input.lines
    .filter((l) => l.quantity.gt(0))
    .map((l) => `- ${quantityForOrder(l)} x ${l.name}`);
  return [
    `Hola, ${input.supplierName}. Pedido de ${input.storeName}:`,
    ...rows,
    'Gracias.',
  ].join('\n');
}

export function buildWhatsAppLink(whatsappPhone: string | null, text: string): string | null {
  return whatsappPhone ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(text)}` : null;
}
