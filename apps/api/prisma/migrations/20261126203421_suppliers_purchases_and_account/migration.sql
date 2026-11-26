-- CreateEnum
CREATE TYPE "weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "purchase_document_type" AS ENUM ('INVOICE', 'DELIVERY_NOTE', 'OTHER');

-- CreateEnum
CREATE TYPE "purchase_status" AS ENUM ('CONFIRMED', 'VOIDED');

-- CreateEnum
CREATE TYPE "purchase_quantity_mode" AS ENUM ('UNIT', 'PACK');

-- CreateEnum
CREATE TYPE "supplier_entry_type" AS ENUM ('OPENING_BALANCE', 'PURCHASE', 'PAYMENT', 'PURCHASE_VOID', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "supplier_payment_source" AS ENUM ('CASH_REGISTER', 'CASH_OUTSIDE_REGISTER', 'BANK_TRANSFER', 'OTHER');

-- CreateTable
CREATE TABLE "suppliers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(10),
    "email" VARCHAR(120),
    "tax_id" VARCHAR(11),
    "visit_days" "weekday"[] DEFAULT ARRAY[]::"weekday"[],
    "notes" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "client_request_id" UUID NOT NULL,
    "request_hash" CHAR(64) NOT NULL,
    "document_type" "purchase_document_type" NOT NULL,
    "document_number" VARCHAR(30),
    "document_date" DATE NOT NULL,
    "net_total" DECIMAL(14,2) NOT NULL,
    "vat_total" DECIMAL(14,2) NOT NULL,
    "other_charges_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "notes" VARCHAR(500),
    "status" "purchase_status" NOT NULL DEFAULT 'CONFIRMED',
    "user_id" INTEGER NOT NULL,
    "voided_at" TIMESTAMPTZ(3),
    "voided_by_id" INTEGER,
    "void_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "quantity_mode" "purchase_quantity_mode" NOT NULL,
    "pack_count" DECIMAL(12,3),
    "units_per_pack" DECIMAL(12,3),
    "pack_net_cost" DECIMAL(14,2),
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_net_cost" DECIMAL(14,2) NOT NULL,
    "vat_rate_percent" DECIMAL(5,2) NOT NULL,
    "unit_cost" DECIMAL(14,2) NOT NULL,
    "line_net_total" DECIMAL(14,2) NOT NULL,
    "line_total" DECIMAL(14,2) NOT NULL,
    "previous_net_cost_price" DECIMAL(14,2) NOT NULL,
    "previous_cost_price" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_attachments" (
    "id" SERIAL NOT NULL,
    "purchase_id" INTEGER NOT NULL,
    "original_file_name" VARCHAR(120) NOT NULL,
    "stored_file_name" VARCHAR(40) NOT NULL,
    "mime_type" VARCHAR(30) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_id" INTEGER,

    CONSTRAINT "purchase_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_account_entries" (
    "id" SERIAL NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "type" "supplier_entry_type" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "entry_date" DATE NOT NULL,
    "purchase_id" INTEGER,
    "payment_source" "supplier_payment_source",
    "reference" VARCHAR(100),
    "description" VARCHAR(200),
    "client_request_id" UUID,
    "request_hash" CHAR(64),
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_account_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_tax_id_idx" ON "suppliers"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_client_request_id_key" ON "purchases"("client_request_id");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_document_date_idx" ON "purchases"("supplier_id", "document_date");

-- CreateIndex
CREATE INDEX "purchases_document_date_idx" ON "purchases"("document_date");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_document_type_document_number_idx" ON "purchases"("supplier_id", "document_type", "document_number");

-- CreateIndex
CREATE INDEX "purchases_user_id_idx" ON "purchases"("user_id");

-- CreateIndex
CREATE INDEX "purchases_voided_by_id_idx" ON "purchases"("voided_by_id");

-- CreateIndex
CREATE INDEX "purchase_items_purchase_id_idx" ON "purchase_items"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_items_product_id_idx" ON "purchase_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_attachments_stored_file_name_key" ON "purchase_attachments"("stored_file_name");

-- CreateIndex
CREATE INDEX "purchase_attachments_purchase_id_idx" ON "purchase_attachments"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_attachments_uploaded_by_id_idx" ON "purchase_attachments"("uploaded_by_id");

-- CreateIndex
CREATE INDEX "purchase_attachments_deleted_by_id_idx" ON "purchase_attachments"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_account_entries_client_request_id_key" ON "supplier_account_entries"("client_request_id");

-- CreateIndex
CREATE INDEX "supplier_account_entries_supplier_id_entry_date_idx" ON "supplier_account_entries"("supplier_id", "entry_date");

-- CreateIndex
CREATE INDEX "supplier_account_entries_purchase_id_idx" ON "supplier_account_entries"("purchase_id");

-- CreateIndex
CREATE INDEX "supplier_account_entries_user_id_idx" ON "supplier_account_entries"("user_id");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_item_id_fkey" FOREIGN KEY ("purchase_item_id") REFERENCES "purchase_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_supplier_account_entry_id_fkey" FOREIGN KEY ("supplier_account_entry_id") REFERENCES "supplier_account_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- A mano (Prisma no declara CHECK ni índices parciales o sobre expresiones).
-- Etapa 5: docs/modelo-datos.md 2.6 y 2.17 a 2.20.
-- ============================================================================

-- Los días de visita nunca son NULL (lista vacía = sin días).
ALTER TABLE "suppliers" ALTER COLUMN "visit_days" SET NOT NULL;

-- ---- suppliers -------------------------------------------------------------
-- Nombre único sin distinguir mayúsculas (como categorías).
CREATE UNIQUE INDEX "suppliers_name_ci" ON "suppliers" (lower("name"));
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_name_check" CHECK (btrim("name") <> '');
-- Teléfono: 10 dígitos nacionales (código de área sin 0 + número sin 15).
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^[0-9]{10}$');
-- CUIT: 11 dígitos sin guiones (el dígito verificador lo valida la API). No es único (H-58 b).
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tax_id_check" CHECK ("tax_id" IS NULL OR "tax_id" ~ '^[0-9]{11}$');

-- ---- purchases -------------------------------------------------------------
-- Los totales cuadran: lo que se debe = neto + IVA + otros cargos (H-16 a). Mayor que 0 (H-63 a).
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_total_check"
  CHECK ("total" = "net_total" + "vat_total" + "other_charges_amount");
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_amounts_check"
  CHECK ("net_total" >= 0 AND "vat_total" >= 0 AND "other_charges_amount" >= 0 AND "total" > 0);
-- Anulación coherente: VOIDED <=> fecha, quién y motivo cargados; CONFIRMED => los tres vacíos.
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_void_check" CHECK (
  ("status" = 'VOIDED' AND "voided_at" IS NOT NULL AND "voided_by_id" IS NOT NULL
     AND "void_reason" IS NOT NULL AND btrim("void_reason") <> '')
  OR ("status" = 'CONFIRMED' AND "voided_at" IS NULL AND "voided_by_id" IS NULL AND "void_reason" IS NULL)
);
-- NO se pone CHECK de "fecha de comprobante no futura" (H-61 a): depende del día de hoy (CURRENT_DATE no es
-- inmutable, cambia con la zona horaria de la sesión y se reevaluaría en cada UPDATE y al restaurar copias).
-- Lo valida el backend con el día de Buenos Aires. Tampoco se valida acá que net_total sea la suma de las
-- líneas (cruza filas): lo hace el backend en la transacción.

-- ---- purchase_items --------------------------------------------------------
-- Bultos: PACK <=> bultos, unidades por bulto y costo del bulto cargados; UNIT => los tres vacíos.
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_pack_fields_check" CHECK (
  ("quantity_mode" = 'PACK' AND "pack_count" IS NOT NULL AND "units_per_pack" IS NOT NULL AND "pack_net_cost" IS NOT NULL)
  OR ("quantity_mode" = 'UNIT' AND "pack_count" IS NULL AND "units_per_pack" IS NULL AND "pack_net_cost" IS NULL)
);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_pack_values_check" CHECK (
  ("pack_count" IS NULL OR "pack_count" > 0)
  AND ("units_per_pack" IS NULL OR "units_per_pack" > 0)
  AND ("pack_net_cost" IS NULL OR "pack_net_cost" >= 0)
);
-- En PACK: la cantidad son bultos x unidades por bulto y los bultos son un número entero.
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_pack_quantity_check" CHECK (
  "quantity_mode" <> 'PACK'
  OR ("quantity" = "pack_count" * "units_per_pack" AND "pack_count" = trunc("pack_count"))
);
-- Cuentas de la línea (misma fórmula que el código compartido; round() de numeric es "mitad hacia arriba"
-- para positivos, igual que R-1):
--   PACK: neto de la línea = bultos x costo del bulto (exacto) y costo neto por unidad = round(costo bulto / unidades).
--   UNIT: neto de la línea = round(cantidad x costo neto por unidad, 2).
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_line_net_check" CHECK (
  CASE "quantity_mode"
    WHEN 'PACK' THEN "line_net_total" = "pack_count" * "pack_net_cost"
                 AND "unit_net_cost" = round("pack_net_cost" / "units_per_pack", 2)
    ELSE "line_net_total" = round("quantity" * "unit_net_cost", 2)
  END
);
-- IVA de la línea: costo final por unidad y total de la línea con IVA.
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_vat_check" CHECK (
  "vat_rate_percent" >= 0 AND "vat_rate_percent" <= 100
  AND "unit_cost" = round("unit_net_cost" * (1 + "vat_rate_percent" / 100), 2)
  AND "line_total" = round("line_net_total" * (1 + "vat_rate_percent" / 100), 2)
);
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_amounts_check" CHECK (
  "quantity" > 0 AND "unit_net_cost" >= 0 AND "line_net_total" >= 0
  AND "unit_cost" >= "unit_net_cost" AND "line_total" >= "line_net_total"
  AND "previous_net_cost_price" >= 0 AND "previous_cost_price" >= "previous_net_cost_price"
);

-- ---- purchase_attachments --------------------------------------------------
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_stored_name_check"
  CHECK ("stored_file_name" ~ '^[0-9a-f]{32}\.(jpg|png|pdf)$');
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_mime_check"
  CHECK ("mime_type" IN ('image/jpeg', 'image/png', 'application/pdf'));
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_size_check" CHECK ("size_bytes" > 0);
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_name_check"
  CHECK (btrim("original_file_name") <> '');
-- Borrado lógico (H-54 b): fecha y quién lo borró van siempre juntos.
ALTER TABLE "purchase_attachments" ADD CONSTRAINT "purchase_attachments_deleted_check"
  CHECK (("deleted_at" IS NULL) = ("deleted_by_id" IS NULL));

-- ---- supplier_account_entries ---------------------------------------------
-- Signo por tipo: la compra suma deuda, la anulación y el pago la restan; el saldo inicial y el ajuste van con
-- cualquier signo (pero distinto de 0).
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_amount_check" CHECK (
  "amount" <> 0
  AND CASE "type"
    WHEN 'PURCHASE'      THEN "amount" > 0 AND "purchase_id" IS NOT NULL
    WHEN 'PURCHASE_VOID' THEN "amount" < 0 AND "purchase_id" IS NOT NULL
    WHEN 'PAYMENT'       THEN "amount" < 0 AND "payment_source" IS NOT NULL
    ELSE "purchase_id" IS NULL  -- OPENING_BALANCE y ADJUSTMENT no se vinculan a una compra
  END
);
-- La forma de pago solo existe en los pagos.
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_payment_source_check"
  CHECK ("payment_source" IS NULL OR "type" = 'PAYMENT');
-- Un ajuste siempre lleva motivo.
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_adjustment_reason_check"
  CHECK ("type" <> 'ADJUSTMENT' OR ("description" IS NOT NULL AND btrim("description") <> ''));
-- Idempotencia de pagos sueltos: solo en PAYMENT, y el id viaja siempre con su huella.
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_request_check"
  CHECK (("client_request_id" IS NULL OR "type" = 'PAYMENT') AND (("client_request_id" IS NULL) = ("request_hash" IS NULL)));
-- Una deuda y, como mucho, una anulación por compra.
CREATE UNIQUE INDEX "supplier_account_entries_one_per_purchase_type" ON "supplier_account_entries" ("purchase_id", "type")
  WHERE "type" IN ('PURCHASE', 'PURCHASE_VOID');
-- Un saldo inicial por proveedor.
CREATE UNIQUE INDEX "supplier_account_entries_one_opening_balance" ON "supplier_account_entries" ("supplier_id")
  WHERE "type" = 'OPENING_BALANCE';
