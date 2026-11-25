-- CreateEnum
CREATE TYPE "payment_method_kind" AS ENUM ('CASH', 'TRANSFER', 'QR', 'DEBIT_CARD', 'CREDIT_CARD');

-- CreateEnum
CREATE TYPE "shift" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT');

-- CreateEnum
CREATE TYPE "cash_session_status" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "cash_direction" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "cash_movement_reason" AS ENUM ('SUPPLIER_PAYMENT', 'OWNER_WITHDRAWAL', 'EXPENSE', 'CASH_CONTRIBUTION', 'SALE_VOID_REFUND', 'OTHER');

-- CreateEnum
CREATE TYPE "sale_status" AS ENUM ('COMPLETED', 'VOIDED');

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" SERIAL NOT NULL,
    "kind" "payment_method_kind" NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "surcharge_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" SERIAL NOT NULL,
    "shift" "shift" NOT NULL,
    "business_date" DATE NOT NULL,
    "opened_by_id" INTEGER NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opening_cash" DECIMAL(14,2) NOT NULL,
    "status" "cash_session_status" NOT NULL DEFAULT 'OPEN',
    "closed_by_id" INTEGER,
    "closed_at" TIMESTAMPTZ(3),
    "counted_cash" DECIMAL(14,2),
    "expected_cash" DECIMAL(14,2),
    "difference" DECIMAL(14,2),
    "closing_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" SERIAL NOT NULL,
    "cash_session_id" INTEGER NOT NULL,
    "direction" "cash_direction" NOT NULL,
    "reason" "cash_movement_reason" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "supplier_account_entry_id" INTEGER,
    "sale_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" SERIAL NOT NULL,
    "cash_session_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "business_date" DATE NOT NULL,
    "status" "sale_status" NOT NULL DEFAULT 'COMPLETED',
    "subtotal" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount_percent" DECIMAL(6,2),
    "discount_reason" TEXT,
    "surcharge_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" INTEGER,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "product_name" VARCHAR(120) NOT NULL,
    "custom_description" TEXT,
    "sale_unit" "sale_unit" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "unit_net_cost" DECIMAL(14,2) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "vat_rate_percent" DECIMAL(5,2) NOT NULL,
    "line_subtotal" DECIMAL(14,2) NOT NULL,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "line_total" DECIMAL(14,2) NOT NULL,
    "line_net_total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_payments" (
    "id" SERIAL NOT NULL,
    "sale_id" INTEGER NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "surcharge_base" DECIMAL(14,2) NOT NULL,
    "surcharge_percent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "surcharge_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sale_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_methods_kind_key" ON "payment_methods"("kind");

-- CreateIndex
CREATE INDEX "cash_sessions_business_date_idx" ON "cash_sessions"("business_date");

-- CreateIndex
CREATE INDEX "cash_sessions_opened_by_id_opened_at_idx" ON "cash_sessions"("opened_by_id", "opened_at");

-- CreateIndex
CREATE INDEX "cash_sessions_closed_by_id_idx" ON "cash_sessions"("closed_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_supplier_account_entry_id_key" ON "cash_movements"("supplier_account_entry_id");

-- CreateIndex
CREATE INDEX "cash_movements_cash_session_id_idx" ON "cash_movements"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_movements_created_at_idx" ON "cash_movements"("created_at");

-- CreateIndex
CREATE INDEX "cash_movements_sale_id_idx" ON "cash_movements"("sale_id");

-- CreateIndex
CREATE INDEX "cash_movements_user_id_idx" ON "cash_movements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_client_request_id_key" ON "sales"("client_request_id");

-- CreateIndex
CREATE INDEX "sales_business_date_created_at_idx" ON "sales"("business_date", "created_at");

-- CreateIndex
CREATE INDEX "sales_created_at_idx" ON "sales"("created_at");

-- CreateIndex
CREATE INDEX "sales_cash_session_id_created_at_idx" ON "sales"("cash_session_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_user_id_created_at_idx" ON "sales"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_voided_by_id_idx" ON "sales"("voided_by_id");

-- CreateIndex
CREATE INDEX "sale_items_sale_id_idx" ON "sale_items"("sale_id");

-- CreateIndex
CREATE INDEX "sale_items_product_id_idx" ON "sale_items"("product_id");

-- CreateIndex
CREATE INDEX "sale_payments_sale_id_idx" ON "sale_payments"("sale_id");

-- CreateIndex
CREATE INDEX "sale_payments_payment_method_id_idx" ON "sale_payments"("payment_method_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_item_id_fkey" FOREIGN KEY ("sale_item_id") REFERENCES "sale_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- A mano (Prisma no declara CHECK ni índices parciales)
-- La FK stock_movements.sale_item_id (pendiente de la etapa 2) la generó Prisma arriba.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Medios de pago
-- -----------------------------------------------------------------------------
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_surcharge_percent_range_check"
  CHECK ("surcharge_percent" >= 0 AND "surcharge_percent" <= 100);
-- Recargo solo en crédito (VEN-07, CFG-01).
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_surcharge_only_credit_check"
  CHECK ("kind" = 'CREDIT_CARD' OR "surcharge_percent" = 0);

-- Datos base: los 5 medios son fijos (la API no da de alta ni de baja; VEN-06), así que los crea la
-- migración, igual que la fila de settings. El 10% del crédito es aproximado: el valor exacto se carga en la instalación.
INSERT INTO "payment_methods" ("kind", "name", "surcharge_percent", "is_active", "sort_order", "updated_at") VALUES
  ('CASH',        'Efectivo',        0.00,  true, 1, CURRENT_TIMESTAMP),
  ('DEBIT_CARD',  'Débito',          0.00,  true, 2, CURRENT_TIMESTAMP),
  ('CREDIT_CARD', 'Crédito',         10.00, true, 3, CURRENT_TIMESTAMP),
  ('QR',          'QR Mercado Pago', 0.00,  true, 4, CURRENT_TIMESTAMP),
  ('TRANSFER',    'Transferencia',   0.00,  true, 5, CURRENT_TIMESTAMP);

-- -----------------------------------------------------------------------------
-- Caja
-- -----------------------------------------------------------------------------
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_opening_cash_check" CHECK ("opening_cash" >= 0);
-- Abierta: ningún dato de cierre. Cerrada: todos los datos de cierre.
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_status_fields_check" CHECK (
  ("status" = 'OPEN' AND "closed_at" IS NULL AND "closed_by_id" IS NULL AND "counted_cash" IS NULL
     AND "expected_cash" IS NULL AND "difference" IS NULL)
  OR
  ("status" = 'CLOSED' AND "closed_at" IS NOT NULL AND "closed_by_id" IS NOT NULL AND "counted_cash" IS NOT NULL
     AND "expected_cash" IS NOT NULL AND "difference" IS NOT NULL)
);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_counted_cash_check"
  CHECK ("counted_cash" IS NULL OR "counted_cash" >= 0);
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_expected_cash_check"
  CHECK ("expected_cash" IS NULL OR "expected_cash" >= 0);

-- UNA SOLA caja abierta en todo el kiosco (PA-02). Índice único sobre una constante, solo para las filas
-- OPEN: la segunda apertura (también si llega a la vez) falla con violación de unicidad.
CREATE UNIQUE INDEX "cash_sessions_single_open" ON "cash_sessions" ((true)) WHERE "status" = 'OPEN';

-- -----------------------------------------------------------------------------
-- Movimientos de efectivo
-- -----------------------------------------------------------------------------
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_amount_check" CHECK ("amount" > 0);
-- Sentido de cada motivo (PA-29).
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reason_direction_check" CHECK (
  ("reason" <> 'SUPPLIER_PAYMENT' OR ("direction" = 'OUT' AND "supplier_account_entry_id" IS NOT NULL))
  AND ("reason" <> 'SALE_VOID_REFUND' OR ("direction" = 'OUT' AND "sale_id" IS NOT NULL))
  AND ("reason" NOT IN ('OWNER_WITHDRAWAL', 'EXPENSE') OR "direction" = 'OUT')
  AND ("reason" <> 'CASH_CONTRIBUTION' OR "direction" = 'IN')
);

-- -----------------------------------------------------------------------------
-- Ventas
-- -----------------------------------------------------------------------------
-- No hay ventas de $0 (H-10 b): subtotal > 0 y el descuento siempre menor que el subtotal.
ALTER TABLE "sales" ADD CONSTRAINT "sales_subtotal_check" CHECK ("subtotal" > 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_amount_check"
  CHECK ("discount_amount" >= 0 AND "discount_amount" < "subtotal");
ALTER TABLE "sales" ADD CONSTRAINT "sales_discount_percent_check"
  CHECK ("discount_percent" IS NULL OR ("discount_percent" >= 0 AND "discount_percent" <= 100));
ALTER TABLE "sales" ADD CONSTRAINT "sales_surcharge_amount_check" CHECK ("surcharge_amount" >= 0);
ALTER TABLE "sales" ADD CONSTRAINT "sales_total_check"
  CHECK ("total" = "subtotal" - "discount_amount" + "surcharge_amount");
-- Anulada si y solo si tiene fecha, usuario y motivo de anulación (y si no, ninguno de los tres).
ALTER TABLE "sales" ADD CONSTRAINT "sales_void_fields_check" CHECK (
  ("status" = 'VOIDED' AND "voided_at" IS NOT NULL AND "voided_by_id" IS NOT NULL AND "void_reason" IS NOT NULL)
  OR
  ("status" = 'COMPLETED' AND "voided_at" IS NULL AND "voided_by_id" IS NULL AND "void_reason" IS NULL)
);
-- (client_request_id único: sales_client_request_id_key, generado arriba por Prisma.)

-- -----------------------------------------------------------------------------
-- Líneas de venta
-- -----------------------------------------------------------------------------
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_price_check" CHECK ("unit_price" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_net_cost_check" CHECK ("unit_net_cost" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_unit_cost_check" CHECK ("unit_cost" >= "unit_net_cost");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_vat_rate_percent_check"
  CHECK ("vat_rate_percent" >= 0 AND "vat_rate_percent" <= 100);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_discount_amount_check" CHECK ("discount_amount" >= 0);
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_total_check"
  CHECK ("line_total" = "line_subtotal" - "discount_amount");
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_line_net_total_check"
  CHECK ("line_net_total" >= 0 AND "line_net_total" <= "line_total");

-- -----------------------------------------------------------------------------
-- Pagos de la venta
-- -----------------------------------------------------------------------------
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_amount_check" CHECK ("amount" > 0);
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_surcharge_base_check" CHECK ("surcharge_base" >= 0);
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_surcharge_percent_check"
  CHECK ("surcharge_percent" >= 0 AND "surcharge_percent" <= 100);
ALTER TABLE "sale_payments" ADD CONSTRAINT "sale_payments_surcharge_amount_check" CHECK ("surcharge_amount" >= 0);
-- Que Σ amount = subtotal - descuento y Σ recargos = sale.surcharge_amount cruza filas: lo valida el backend en la transacción.
