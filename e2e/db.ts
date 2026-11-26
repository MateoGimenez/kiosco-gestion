// Acceso directo a la base de pruebas (`kiosco_test`) desde los tests e2e. Solo para lo que la
// pantalla todavía no puede hacer o para verificar lo guardado (la API es la fuente de la verdad).
import { createPrismaClient } from '../apps/api/src/db/prisma';
import type { PrismaClient } from '../apps/api/src/generated/client';
import { assertTestDatabaseUrl } from '../apps/api/test/db/test-db';

let client: PrismaClient | undefined;

/** Cliente de Prisma atado a la base de pruebas (se aborta si la URL no termina en `_test`). */
export function db(): PrismaClient {
  client ??= createPrismaClient(assertTestDatabaseUrl(process.env.DATABASE_URL_TEST));
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}

/** Stock actual de un producto, por código de barras (texto, 3 decimales). */
export async function stockOfBarcode(barcode: string): Promise<string> {
  const product = await db().product.findUniqueOrThrow({ where: { barcode } });
  return product.stockQuantity.toFixed(3);
}

/** Ventas guardadas que incluyen el producto (por código de barras). */
export async function salesWithProduct(barcode: string) {
  return db().sale.findMany({
    where: { items: { some: { product: { barcode } } } },
    include: { items: true, payments: { include: { paymentMethod: true } } },
    orderBy: { id: 'asc' },
  });
}
