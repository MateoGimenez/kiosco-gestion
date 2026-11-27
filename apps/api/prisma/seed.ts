// Datos de ejemplo SOLO PARA DESARROLLO (`npm run db:seed`). Puede correr varias veces sin duplicar nada.
//
// Qué carga: categorías y subcategorías de un kiosco argentino, el producto especial "Varios" (H-09) y
// unos 50 productos con costos, IVA, márgenes, precios sugeridos y stock inicial.
//
// Usuarios: NO se crea ninguno acá (así no hay contraseñas de ejemplo que lleguen a producción).
// El dueño se crea con `npm run owner:reset`. Como todo movimiento de stock necesita un usuario,
// el stock inicial se carga a nombre del primer dueño que exista; si todavía no hay ninguno, los
// productos quedan con stock 0 y alcanza con volver a correr `npm run db:seed` después de crear al dueño.
//
// Proveedores: 4 de ejemplo con teléfonos FICTICIOS de 10 dígitos: código de área real (11 Buenos Aires,
// 351 Córdoba) seguido de "555" y cuatro dígitos (ej.: 1155500101). No son de nadie. Cada producto sin proveedor
// habitual recibe uno según su categoría, y a un proveedor se le carga un saldo inicial de ejemplo (a nombre del
// primer dueño; si todavía no hay dueño, se saltea y se carga al volver a correr el seed).
//
// Códigos de barras: EAN-13 válidos (dígito verificador correcto) pero INVENTADOS. Empiezan con "299",
// dentro del rango 200-299 que GS1 reserva para uso interno, así que nunca coinciden con una marca real.
import { suggestedPrice, finalFromNet } from '@kiosco/shared';
import { createPrismaClient } from '../src/db/prisma';
import type { PrismaClient } from '../src/generated/client';

type Unit = 'UNIT' | 'KG';

interface CategorySeed {
  name: string;
  margin: string;
  subcategories: { name: string; margin?: string }[];
}

const CATEGORIES: CategorySeed[] = [
  {
    name: 'Bebidas',
    margin: '35',
    subcategories: [
      { name: 'Gaseosas', margin: '30' },
      { name: 'Aguas' },
      { name: 'Jugos' },
      { name: 'Cervezas', margin: '32' },
    ],
  },
  {
    name: 'Golosinas',
    margin: '40',
    subcategories: [
      { name: 'Chocolates', margin: '45' },
      { name: 'Caramelos' },
      { name: 'Alfajores', margin: '50' },
      { name: 'Chicles' },
    ],
  },
  {
    name: 'Cigarrillos',
    margin: '12',
    subcategories: [{ name: 'Cigarrillos' }, { name: 'Encendedores' }],
  },
  {
    name: 'Almacén',
    margin: '30',
    subcategories: [
      { name: 'Galletitas' },
      { name: 'Snacks', margin: '45' },
      { name: 'Infusiones' },
      { name: 'Panificados' },
    ],
  },
  { name: 'Lácteos', margin: '25', subcategories: [{ name: 'Leches' }, { name: 'Yogures' }] },
  { name: 'Fiambrería', margin: '30', subcategories: [{ name: 'Fiambres y quesos' }] },
  { name: 'Limpieza', margin: '38', subcategories: [{ name: 'Limpieza del hogar' }] },
  { name: 'Diarios y revistas', margin: '15', subcategories: [{ name: 'Diarios y revistas' }] },
  // H-09: el producto "Varios" vive en su propia categoría y subcategoría.
  { name: 'Varios', margin: '0', subcategories: [{ name: 'Varios' }] },
];

interface ProductSeed {
  name: string;
  sub: string;
  unit?: Unit;
  /** Costo neto (sin IVA) por unidad o por kg. */
  net: string;
  /** IVA de venta en %. Default 21. */
  vat?: string;
  /** Margen propio del producto (si no, hereda el de la subcategoría o categoría). */
  margin?: string;
  /** Stock inicial. Un valor negativo carga stock y después un ajuste que lo deja en negativo. */
  stock: string;
  min: string;
  /** Con código de barras (default sí). Los productos sueltos o por peso van sin código. */
  noBarcode?: boolean;
  unitsPerPack?: string;
}

const PRODUCTS: ProductSeed[] = [
  // Gaseosas
  {
    name: 'Gaseosa cola 1,5 L',
    sub: 'Gaseosas',
    net: '1450',
    stock: '24',
    min: '12',
    unitsPerPack: '6',
  },
  {
    name: 'Gaseosa cola 2,25 L',
    sub: 'Gaseosas',
    net: '1900',
    stock: '18',
    min: '10',
    unitsPerPack: '6',
  },
  {
    name: 'Gaseosa cola 500 ml',
    sub: 'Gaseosas',
    net: '780',
    stock: '36',
    min: '18',
    unitsPerPack: '12',
  },
  {
    name: 'Gaseosa lima limón 1,5 L',
    sub: 'Gaseosas',
    net: '1400',
    stock: '10',
    min: '12',
    unitsPerPack: '6',
  },
  {
    name: 'Gaseosa naranja 2,25 L',
    sub: 'Gaseosas',
    net: '1750',
    stock: '14',
    min: '8',
    unitsPerPack: '6',
  },
  {
    name: 'Gaseosa cola light 1,5 L',
    sub: 'Gaseosas',
    net: '1450',
    stock: '6',
    min: '8',
    unitsPerPack: '6',
  },
  // Aguas
  {
    name: 'Agua mineral sin gas 500 ml',
    sub: 'Aguas',
    net: '480',
    stock: '40',
    min: '24',
    unitsPerPack: '12',
  },
  {
    name: 'Agua mineral con gas 1,5 L',
    sub: 'Aguas',
    net: '820',
    stock: '12',
    min: '6',
    unitsPerPack: '6',
  },
  {
    name: 'Agua saborizada pomelo 1,5 L',
    sub: 'Aguas',
    net: '950',
    stock: '9',
    min: '6',
    unitsPerPack: '6',
  },
  // Jugos
  { name: 'Jugo en polvo naranja sobre', sub: 'Jugos', net: '95', stock: '60', min: '20' },
  {
    name: 'Jugo de naranja en caja 1 L',
    sub: 'Jugos',
    net: '1100',
    stock: '15',
    min: '8',
    unitsPerPack: '12',
  },
  {
    name: 'Bebida isotónica 500 ml',
    sub: 'Jugos',
    net: '1050',
    stock: '20',
    min: '10',
    unitsPerPack: '12',
  },
  // Cervezas
  {
    name: 'Cerveza rubia lata 473 ml',
    sub: 'Cervezas',
    net: '1250',
    stock: '48',
    min: '24',
    unitsPerPack: '24',
  },
  {
    name: 'Cerveza rubia botella 1 L',
    sub: 'Cervezas',
    net: '2100',
    stock: '7',
    min: '12',
    unitsPerPack: '12',
  },
  {
    name: 'Cerveza negra lata 473 ml',
    sub: 'Cervezas',
    net: '1400',
    margin: '40',
    stock: '12',
    min: '6',
    unitsPerPack: '24',
  },
  // Chocolates
  {
    name: 'Chocolate con leche tableta 100 g',
    sub: 'Chocolates',
    net: '1600',
    stock: '20',
    min: '10',
    unitsPerPack: '20',
  },
  {
    name: 'Chocolate amargo tableta 100 g',
    sub: 'Chocolates',
    net: '1750',
    stock: '8',
    min: '6',
    unitsPerPack: '20',
  },
  {
    name: 'Bombón relleno x unidad',
    sub: 'Chocolates',
    net: '280',
    margin: '55',
    stock: '80',
    min: '30',
    unitsPerPack: '50',
  },
  // Caramelos
  {
    name: 'Caramelo masticable frutal x unidad',
    sub: 'Caramelos',
    net: '60',
    stock: '300',
    min: '100',
    unitsPerPack: '200',
  },
  {
    name: 'Caramelos duros de miel bolsa 150 g',
    sub: 'Caramelos',
    net: '850',
    stock: '18',
    min: '8',
    unitsPerPack: '12',
  },
  {
    name: 'Pastillas de menta tubo',
    sub: 'Caramelos',
    net: '220',
    stock: '50',
    min: '20',
    unitsPerPack: '24',
  },
  // Alfajores
  {
    name: 'Alfajor triple chocolate',
    sub: 'Alfajores',
    net: '520',
    stock: '60',
    min: '24',
    unitsPerPack: '12',
  },
  {
    name: 'Alfajor de dulce de leche',
    sub: 'Alfajores',
    net: '450',
    stock: '55',
    min: '24',
    unitsPerPack: '12',
  },
  {
    name: 'Alfajor de maicena x unidad',
    sub: 'Alfajores',
    net: '380',
    stock: '3',
    min: '12',
    unitsPerPack: '12',
  },
  // Chicles (el de menta queda con stock negativo, para probar esa lista)
  {
    name: 'Chicle de menta paquete',
    sub: 'Chicles',
    net: '300',
    stock: '-3',
    min: '20',
    unitsPerPack: '20',
  },
  {
    name: 'Chicle globo x unidad',
    sub: 'Chicles',
    net: '40',
    stock: '200',
    min: '50',
    unitsPerPack: '100',
  },
  // Cigarrillos
  {
    name: 'Cigarrillos box 20 suaves',
    sub: 'Cigarrillos',
    net: '2600',
    stock: '50',
    min: '30',
    unitsPerPack: '10',
  },
  {
    name: 'Cigarrillos box 20 fuertes',
    sub: 'Cigarrillos',
    net: '2750',
    stock: '8',
    min: '30',
    unitsPerPack: '10',
  },
  {
    name: 'Cigarrillos x 10 unidades',
    sub: 'Cigarrillos',
    net: '1500',
    stock: '20',
    min: '10',
    unitsPerPack: '10',
  },
  {
    name: 'Encendedor descartable',
    sub: 'Encendedores',
    net: '600',
    margin: '60',
    stock: '25',
    min: '10',
    unitsPerPack: '50',
  },
  // Galletitas
  {
    name: 'Galletitas rellenas vainilla 118 g',
    sub: 'Galletitas',
    net: '520',
    stock: '30',
    min: '12',
    unitsPerPack: '24',
  },
  {
    name: 'Galletitas de agua paquete',
    sub: 'Galletitas',
    net: '900',
    vat: '10.5',
    stock: '22',
    min: '10',
    unitsPerPack: '20',
  },
  // Snacks
  {
    name: 'Papas fritas clásicas 100 g',
    sub: 'Snacks',
    net: '1000',
    stock: '25',
    min: '12',
    unitsPerPack: '20',
  },
  {
    name: 'Maní salado bolsa 150 g',
    sub: 'Snacks',
    net: '780',
    stock: '14',
    min: '8',
    unitsPerPack: '20',
  },
  {
    name: 'Palitos salados bolsa 100 g',
    sub: 'Snacks',
    net: '620',
    stock: '0',
    min: '10',
    unitsPerPack: '20',
  },
  // Infusiones
  {
    name: 'Yerba mate 500 g',
    sub: 'Infusiones',
    net: '2300',
    stock: '16',
    min: '8',
    unitsPerPack: '10',
  },
  {
    name: 'Café instantáneo frasco 170 g',
    sub: 'Infusiones',
    net: '4200',
    stock: '6',
    min: '4',
    unitsPerPack: '12',
  },
  // Panificados
  {
    name: 'Pan lactal grande',
    sub: 'Panificados',
    net: '1800',
    vat: '10.5',
    stock: '8',
    min: '4',
    noBarcode: true,
  },
  {
    name: 'Huevos docena',
    sub: 'Panificados',
    net: '2200',
    vat: '10.5',
    stock: '10',
    min: '5',
    noBarcode: true,
  },
  // Lácteos
  {
    name: 'Leche entera sachet 1 L',
    sub: 'Leches',
    net: '1000',
    vat: '10.5',
    stock: '12',
    min: '24',
    unitsPerPack: '12',
  },
  {
    name: 'Yogur bebible frutilla 1 L',
    sub: 'Yogures',
    net: '1150',
    vat: '10.5',
    stock: '10',
    min: '6',
    unitsPerPack: '8',
  },
  // Fiambrería (por peso, sin código de barras)
  {
    name: 'Jamón cocido por kg',
    sub: 'Fiambres y quesos',
    unit: 'KG',
    net: '9500',
    stock: '4.500',
    min: '2',
    noBarcode: true,
  },
  {
    name: 'Queso de máquina por kg',
    sub: 'Fiambres y quesos',
    unit: 'KG',
    net: '8800',
    stock: '3.250',
    min: '2',
    noBarcode: true,
  },
  {
    name: 'Salame por kg',
    sub: 'Fiambres y quesos',
    unit: 'KG',
    net: '12000',
    stock: '1.800',
    min: '2',
    noBarcode: true,
  },
  {
    name: 'Queso cremoso por kg',
    sub: 'Fiambres y quesos',
    unit: 'KG',
    net: '7600',
    vat: '10.5',
    stock: '5',
    min: '2',
    noBarcode: true,
  },
  // Limpieza
  {
    name: 'Detergente 750 ml',
    sub: 'Limpieza del hogar',
    net: '1300',
    stock: '10',
    min: '5',
    unitsPerPack: '12',
  },
  {
    name: 'Lavandina 1 L',
    sub: 'Limpieza del hogar',
    net: '700',
    stock: '12',
    min: '6',
    unitsPerPack: '12',
  },
  {
    name: 'Papel higiénico 4 rollos',
    sub: 'Limpieza del hogar',
    net: '1500',
    stock: '15',
    min: '6',
    unitsPerPack: '12',
  },
  {
    name: 'Esponja multiuso',
    sub: 'Limpieza del hogar',
    net: '250',
    stock: '20',
    min: '8',
    unitsPerPack: '24',
  },
  // Diarios y revistas (exentos de IVA)
  {
    name: 'Diario del día',
    sub: 'Diarios y revistas',
    net: '900',
    vat: '0',
    stock: '15',
    min: '5',
    noBarcode: true,
  },
  {
    name: 'Revista semanal',
    sub: 'Diarios y revistas',
    net: '1400',
    vat: '0',
    stock: '5',
    min: '2',
    noBarcode: true,
  },
];

interface SupplierSeed {
  name: string;
  phone: string;
  email: string;
  visitDays: ('MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN')[];
  notes: string;
  /** Categorías cuyos productos sin proveedor habitual quedan asignados a este proveedor. */
  categories: string[];
  /** Saldo inicial de ejemplo (la plata que ya se le debía al empezar a usar el sistema). */
  openingBalance?: string;
}

const SUPPLIERS: SupplierSeed[] = [
  {
    name: 'Distribuidora Dulce Hogar (golosinas)',
    phone: '1155500101',
    email: 'pedidos@dulcehogar.example.com',
    visitDays: ['MON', 'THU'],
    notes: 'Proveedor de ejemplo (datos ficticios). Pasa el vendedor los lunes y jueves.',
    categories: ['Golosinas'],
  },
  {
    name: 'Bebidas del Sur (bebidas)',
    phone: '1155500102',
    email: 'ventas@bebidasdelsur.example.com',
    visitDays: ['TUE', 'FRI'],
    notes: 'Proveedor de ejemplo (datos ficticios). Reparto martes y viernes.',
    categories: ['Bebidas'],
    openingBalance: '185000.00',
  },
  {
    name: 'Tabacalera Central (cigarrillos)',
    phone: '1155500103',
    email: 'comercial@tabacaleracentral.example.com',
    visitDays: ['WED'],
    notes: 'Proveedor de ejemplo (datos ficticios). Se paga al contado.',
    categories: ['Cigarrillos'],
  },
  {
    name: 'Almacén Mayorista Don Pepe',
    phone: '3515550104',
    email: 'info@donpepe.example.com',
    visitDays: [],
    notes: 'Proveedor de ejemplo (datos ficticios). Se pide por WhatsApp.',
    categories: ['Almacén', 'Lácteos', 'Fiambrería', 'Limpieza'],
  },
];

/**
 * Crea los proveedores que falten (por nombre, sin distinguir mayúsculas), asigna el proveedor habitual a los
 * productos que no tienen uno y carga el saldo inicial de ejemplo. Idempotente: no pisa lo que ya existe.
 */
async function ensureSuppliers(
  prisma: PrismaClient,
  ownerId: number | null,
): Promise<{ created: number; assigned: number; openingBalances: number }> {
  let created = 0;
  let assigned = 0;
  let openingBalances = 0;
  for (const sup of SUPPLIERS) {
    let supplier = await prisma.supplier.findFirst({
      where: { name: { equals: sup.name, mode: 'insensitive' } },
    });
    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: sup.name,
          phone: sup.phone,
          email: sup.email,
          visitDays: sup.visitDays,
          notes: sup.notes,
        },
      });
      created++;
    }
    // Solo productos reales sin proveedor habitual ("Varios" no tiene, y lo que ya se asignó a mano no se toca).
    const res = await prisma.product.updateMany({
      where: {
        defaultSupplierId: null,
        isMiscellaneous: false,
        subcategory: { category: { name: { in: sup.categories } } },
      },
      data: { defaultSupplierId: supplier.id },
    });
    assigned += res.count;
    if (sup.openingBalance && ownerId !== null) {
      const has = await prisma.supplierAccountEntry.findFirst({
        where: { supplierId: supplier.id, type: 'OPENING_BALANCE' },
      });
      if (!has) {
        await prisma.supplierAccountEntry.create({
          data: {
            supplierId: supplier.id,
            type: 'OPENING_BALANCE',
            amount: sup.openingBalance,
            entryDate: new Date(new Date().toISOString().slice(0, 10)),
            description: 'Saldo inicial de ejemplo',
            userId: ownerId,
          },
        });
        openingBalances++;
      }
    }
  }
  return { created, assigned, openingBalances };
}

/** Arma un EAN-13 inventado: "299" + número de orden (9 dígitos) + dígito verificador. */
function fakeEan13(order: number): string {
  const body = `299${String(order).padStart(9, '0')}`;
  const sum = [...body].reduce((acc, ch, i) => acc + Number(ch) * (i % 2 === 0 ? 1 : 3), 0);
  return `${body}${(10 - (sum % 10)) % 10}`;
}

/** Busca una categoría por nombre sin distinguir mayúsculas (igual que el índice único de la base). */
async function ensureCategories(
  prisma: PrismaClient,
): Promise<Map<string, { id: number; margin: string }>> {
  const subs = new Map<string, { id: number; margin: string }>();
  for (const cat of CATEGORIES) {
    const category =
      (await prisma.category.findFirst({
        where: { name: { equals: cat.name, mode: 'insensitive' } },
      })) ??
      (await prisma.category.create({ data: { name: cat.name, marginPercent: cat.margin } }));
    for (const sub of cat.subcategories) {
      const subcategory =
        (await prisma.subcategory.findFirst({
          where: { categoryId: category.id, name: { equals: sub.name, mode: 'insensitive' } },
        })) ??
        (await prisma.subcategory.create({
          data: { categoryId: category.id, name: sub.name, marginPercent: sub.margin ?? null },
        }));
      // Margen efectivo de la subcategoría (propio o el de la categoría), para calcular precios.
      subs.set(sub.name, {
        id: subcategory.id,
        margin: (subcategory.marginPercent ?? category.marginPercent).toString(),
      });
    }
  }
  return subs;
}

async function ensureMiscellaneous(prisma: PrismaClient, subcategoryId: number): Promise<boolean> {
  const existing = await prisma.product.findFirst({ where: { isMiscellaneous: true } });
  if (existing) return false;
  await prisma.product.create({
    data: {
      name: 'Varios',
      saleUnit: 'UNIT',
      subcategoryId,
      salePrice: 0, // el precio se escribe a mano al vender
      isMiscellaneous: true,
    },
  });
  return true;
}

/** Carga el stock inicial de un producto con sus movimientos, todo en una transacción. */
async function loadInitialStock(
  prisma: PrismaClient,
  productId: number,
  netCost: string,
  target: string,
  userId: number,
): Promise<void> {
  const targetNum = Number(target); // solo para decidir el signo; los importes van como string
  const loaded = targetNum < 0 ? '10' : target;
  await prisma.$transaction(async (tx) => {
    await tx.stockMovement.create({
      data: {
        productId,
        type: 'ADJUSTMENT',
        adjustmentReason: 'INITIAL_LOAD',
        quantity: loaded,
        stockAfter: loaded,
        unitNetCost: netCost,
        note: 'Carga inicial de ejemplo',
        userId,
      },
    });
    let finalStock = loaded;
    if (targetNum < 0) {
      // Stock negativo de ejemplo: se vendió más de lo que se cargó (se resuelve con un ajuste "otro").
      const drop = String(10 - targetNum);
      finalStock = target;
      await tx.stockMovement.create({
        data: {
          productId,
          type: 'ADJUSTMENT',
          adjustmentReason: 'OTHER',
          quantity: `-${drop}`,
          stockAfter: target,
          unitNetCost: netCost,
          note: 'Ejemplo: ventas sin stock cargado',
          userId,
        },
      });
    }
    await tx.product.update({ where: { id: productId }, data: { stockQuantity: finalStock } });
  });
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('El seed es solo para desarrollo: no se corre con NODE_ENV=production.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (ver .env.example).');
  const prisma = createPrismaClient(url);
  try {
    const setting = await prisma.setting.findUnique({ where: { id: 1 } });
    if (!setting)
      throw new Error(
        'Falta la fila de configuración: aplicá las migraciones (npm run db:migrate).',
      );
    const step = setting.priceRoundingStep.toString();

    const subs = await ensureCategories(prisma);
    const varios = subs.get('Varios');
    if (!varios) throw new Error('Falta la subcategoría "Varios".');
    const createdMisc = await ensureMiscellaneous(prisma, varios.id);

    const owner = await prisma.user.findFirst({
      where: { role: 'OWNER', isActive: true },
      orderBy: { id: 'asc' },
    });

    let created = 0;
    let stockLoaded = 0;
    for (const [index, p] of PRODUCTS.entries()) {
      const sub = subs.get(p.sub);
      if (!sub) throw new Error(`Subcategoría desconocida: ${p.sub}`);
      const vat = p.vat ?? '21';
      const barcode = p.noBarcode ? null : fakeEan13(index + 1);
      let product = barcode
        ? await prisma.product.findUnique({ where: { barcode } })
        : await prisma.product.findFirst({ where: { name: p.name, barcode: null } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            name: p.name,
            barcode,
            saleUnit: p.unit ?? 'UNIT',
            subcategoryId: sub.id,
            netCostPrice: p.net,
            costPrice: finalFromNet(p.net, vat).toString(),
            vatRatePercent: vat,
            marginPercent: p.margin ?? null,
            // Precio sugerido (costo neto x margen x IVA), redondeado hacia arriba al paso de la configuración.
            salePrice: suggestedPrice(p.net, p.margin ?? sub.margin, vat, step).toString(),
            minStock: p.min,
            unitsPerPack: p.unitsPerPack ?? null,
          },
        });
        created++;
      }
      // Stock inicial: solo si el producto no tiene movimientos (así re-correr no lo duplica).
      if (owner && Number(p.stock) !== 0) {
        const has = await prisma.stockMovement.count({ where: { productId: product.id } });
        if (has === 0) {
          await loadInitialStock(prisma, product.id, p.net, p.stock, owner.id);
          stockLoaded++;
        }
      }
    }

    const sup = await ensureSuppliers(prisma, owner?.id ?? null);
    console.log(
      `Seed: ${sup.created} proveedores nuevos, ${sup.assigned} productos con proveedor habitual asignado, ` +
        `${sup.openingBalances} saldo(s) inicial(es).`,
    );
    console.log(
      `Seed: ${CATEGORIES.length} categorías, ${created} productos nuevos` +
        `${createdMisc ? ' y "Varios"' : ''}; stock inicial cargado en ${stockLoaded} productos.`,
    );
    if (!owner) {
      console.log(
        'Seed: no hay ningún dueño, así que los productos quedaron con stock 0. Creá uno con "npm run owner:reset" y corré "npm run db:seed" otra vez para cargar el stock inicial.',
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
