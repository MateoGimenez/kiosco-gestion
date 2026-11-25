// Ayudas de los tests de la etapa 3: mundo con productos, medios de pago y caja abierta,
// puerta remota y un armador de pedidos de cobro.
import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../src/generated/client';
import { LoginLimiter } from '../src/modules/auth/login-limiter';
import {
  PASSWORD,
  seedCatalog,
  seedProduct,
  setupWorld,
  type Client,
  type World,
} from './catalog-helpers';
import { buildTestApp, clientFor, sessionCookie, testConfig } from './helpers';

export interface SalesWorld extends World {
  remote: Client;
  remoteOwner: string;
  remoteManager: string;
  /** Producto A: $6.000 (costo neto $3.500), stock 10. */
  a: { id: number };
  /** Producto B: $4.000 (costo neto $2.000), stock 10. */
  b: { id: number };
  /** Queso por kg a $4.990, stock 5. */
  cheese: { id: number };
  /** Coca-Cola por unidad $1.450, stock 1. */
  coke: { id: number };
  /** Alfajor $1.210 (costo neto $700), stock 20. */
  alfajor: { id: number };
  /** "Varios". */
  misc: { id: number };
  /** Id de cada medio de pago por tipo. */
  pm: Record<'CASH' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR' | 'TRANSFER', number>;
}

export async function setupSalesWorld(prisma: PrismaClient): Promise<SalesWorld> {
  const w = await setupWorld(prisma);
  const cat = await seedCatalog(prisma);
  const sub = cat.plain.id;
  const a = await seedProduct(prisma, sub, {
    name: 'Vino Malbec 750 ml',
    salePrice: '6000',
    netCostPrice: '3500',
    costPrice: '4235',
    stockQuantity: '10',
  });
  const b = await seedProduct(prisma, sub, {
    name: 'Fernet 450 ml',
    salePrice: '4000',
    netCostPrice: '2000',
    costPrice: '2420',
    stockQuantity: '10',
  });
  const cheese = await seedProduct(prisma, sub, {
    name: 'Queso por kg',
    saleUnit: 'KG',
    salePrice: '4990',
    netCostPrice: '2500',
    costPrice: '3025',
    stockQuantity: '5',
  });
  const coke = await seedProduct(prisma, sub, {
    name: 'Coca-Cola 500 ml',
    salePrice: '1450',
    netCostPrice: '900',
    costPrice: '1089',
    stockQuantity: '1',
  });
  const alfajor = await seedProduct(prisma, sub, {
    name: 'Alfajor',
    salePrice: '1210',
    netCostPrice: '700',
    costPrice: '847',
    stockQuantity: '20',
  });
  const misc = await seedProduct(prisma, sub, {
    name: 'Varios',
    salePrice: '0',
    netCostPrice: '0',
    costPrice: '0',
    stockQuantity: '0',
    isMiscellaneous: true,
  });
  const methods = await prisma.paymentMethod.findMany();
  const pm = Object.fromEntries(methods.map((m) => [m.kind, m.id])) as SalesWorld['pm'];

  const loginLimiter = new LoginLimiter(testConfig().login);
  const remote = clientFor(buildTestApp('remote', { prisma, loginLimiter }), 'remote');
  const remoteLogin = async (username: string) => {
    const res = await remote.post('/api/auth/login', { username, password: PASSWORD });
    if (res.status !== 200) throw new Error(`Login remoto de ${username}: ${res.status}`);
    return sessionCookie(res);
  };
  return {
    ...w,
    remote,
    remoteOwner: await remoteLogin('dueno'),
    remoteManager: await remoteLogin('encargado'),
    a,
    b,
    cheese,
    coke,
    alfajor,
    misc,
    pm,
  };
}

/** Abre la caja (por defecto como empleado, Mañana, $5.000). */
export async function openCash(w: SalesWorld, cookie = w.employee, openingCash = '5000') {
  const res = await w.client.post('/api/cash-sessions', { shift: 'MORNING', openingCash }, cookie);
  if (res.status !== 201) throw new Error(`No se pudo abrir la caja: ${res.status}`);
  return res.body as { id: number };
}

export interface SaleBody {
  clientRequestId?: string;
  items: Record<string, unknown>[];
  discount?: Record<string, unknown> | null;
  payments: Record<string, unknown>[];
  cashTendered?: string | null;
  expectedTotal: string;
}

/** Pedido de cobro con un `clientRequestId` nuevo (se puede pisar). */
export function saleBody(body: SaleBody) {
  return { clientRequestId: randomUUID(), ...body };
}

/** Ejemplo 1 del contrato (encargado): A + B, 10 % de descuento, todo con crédito -> $10.000. */
export const example1 = (w: SalesWorld) =>
  saleBody({
    items: [
      { productId: w.a.id, quantity: '1' },
      { productId: w.b.id, quantity: '1' },
    ],
    discount: { type: 'PERCENT', value: '10' },
    payments: [{ paymentMethodId: w.pm.CREDIT_CARD, amount: '9000' }],
    expectedTotal: '10000',
  });

/** Ejemplo 2 del contrato (encargado): mixto, $9.500, con $5.000 en el posnet. */
export const example2 = (w: SalesWorld) =>
  saleBody({
    items: [
      { productId: w.a.id, quantity: '1' },
      { productId: w.b.id, quantity: '1' },
    ],
    discount: { type: 'AMOUNT', value: '1000', reason: 'Cliente habitual' },
    payments: [
      { paymentMethodId: w.pm.CASH, amount: '4500' },
      { paymentMethodId: w.pm.CREDIT_CARD, amount: '4500' },
    ],
    cashTendered: '5000',
    expectedTotal: '9500',
  });

export const stockOf = async (prisma: PrismaClient, id: number) =>
  (await prisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity.toFixed(3);

/** Cierra la caja directo en la base (todavía no hay cierre por la API: etapa 4). */
export async function closeCashInDb(prisma: PrismaClient, id: number, byUserId: number) {
  await prisma.cashSession.update({
    where: { id },
    data: {
      status: 'CLOSED',
      closedAt: new Date(),
      closedById: byUserId,
      countedCash: '0',
      expectedCash: '0',
      difference: '0',
    },
  });
}
