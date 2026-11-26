// Acceso directo a la base de pruebas (`kiosco_test`) desde los tests e2e. Solo para lo que la
// pantalla todavía no puede hacer o para verificar lo guardado (la API es la fuente de la verdad).
//
// POR QUÉ SIGUE EXISTIENDO `closeOpenCashSession` (etapa 4): el cierre real ya existe
// (`POST /api/cash-sessions/:id/close` y la pantalla de cierre), y los tests que prueban el cierre
// lo usan por la pantalla. Este helper queda SOLO para dejar el estado limpio entre tests que no
// tratan del cierre (por ejemplo, las ventas): como hay una sola caja abierta (CAJ-02), se cierra
// directo en la base, sin pasar por la API, con los campos de cierre que exigen los CHECK del
// modelo (difference = counted_cash - expected_cash; todo en 0). No sirve para verificar nada del arqueo.
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

/** Deja el estado limpio: cierra (en la base) la caja abierta, si hay. Ver el comentario del archivo. */
export async function closeOpenCashSession(): Promise<void> {
  const owner = await db().user.findFirstOrThrow({ where: { role: 'OWNER' } });
  await db().cashSession.updateMany({
    where: { status: 'OPEN' },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: owner.id,
      countedCash: '0',
      expectedCash: '0',
      difference: '0',
    },
  });
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
