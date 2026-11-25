-- CreateEnum
CREATE TYPE "sale_unit" AS ENUM ('UNIT', 'KG');

-- CreateEnum
CREATE TYPE "stock_movement_type" AS ENUM ('SALE', 'SALE_VOID', 'PURCHASE', 'PURCHASE_VOID', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "stock_adjustment_reason" AS ENUM ('BREAKAGE', 'MISSING', 'COUNT_CORRECTION', 'INITIAL_LOAD', 'OWN_CONSUMPTION', 'OTHER');

-- CreateEnum
CREATE TYPE "price_change_source" AS ENUM ('MANUAL', 'PURCHASE', 'BULK_UPDATE', 'IMPORT');

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_name" VARCHAR(80) NOT NULL DEFAULT 'Kiosco',
    "price_rounding_step" DECIMAL(14,2) NOT NULL DEFAULT 10.00,
    "business_day_cutoff_minutes" INTEGER NOT NULL DEFAULT 360,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" INTEGER,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "margin_percent" DECIMAL(6,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcategories" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "margin_percent" DECIMAL(6,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "barcode" VARCHAR(50),
    "sale_unit" "sale_unit" NOT NULL,
    "subcategory_id" INTEGER NOT NULL,
    "net_cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_rate_percent" DECIMAL(5,2) NOT NULL DEFAULT 21.00,
    "margin_percent" DECIMAL(6,2),
    "sale_price" DECIMAL(14,2) NOT NULL,
    "stock_quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "min_stock" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "units_per_pack" DECIMAL(12,3),
    "is_miscellaneous" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "type" "stock_movement_type" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "stock_after" DECIMAL(12,3) NOT NULL,
    "unit_net_cost" DECIMAL(14,2),
    "adjustment_reason" "stock_adjustment_reason",
    "note" VARCHAR(500),
    "sale_item_id" INTEGER,
    "purchase_item_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_changes" (
    "id" SERIAL NOT NULL,
    "product_id" INTEGER NOT NULL,
    "source" "price_change_source" NOT NULL,
    "old_net_cost_price" DECIMAL(14,2) NOT NULL,
    "new_net_cost_price" DECIMAL(14,2) NOT NULL,
    "old_cost_price" DECIMAL(14,2) NOT NULL,
    "new_cost_price" DECIMAL(14,2) NOT NULL,
    "old_sale_price" DECIMAL(14,2) NOT NULL,
    "new_sale_price" DECIMAL(14,2) NOT NULL,
    "old_margin_percent" DECIMAL(6,2),
    "new_margin_percent" DECIMAL(6,2),
    "purchase_id" INTEGER,
    "bulk_price_update_id" INTEGER,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settings_updated_by_id_idx" ON "settings"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE INDEX "products_subcategory_id_idx" ON "products"("subcategory_id");

-- CreateIndex
CREATE INDEX "stock_movements_product_id_created_at_idx" ON "stock_movements"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE INDEX "stock_movements_sale_item_id_idx" ON "stock_movements"("sale_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_purchase_item_id_idx" ON "stock_movements"("purchase_item_id");

-- CreateIndex
CREATE INDEX "stock_movements_user_id_idx" ON "stock_movements"("user_id");

-- CreateIndex
CREATE INDEX "price_changes_product_id_created_at_idx" ON "price_changes"("product_id", "created_at");

-- CreateIndex
CREATE INDEX "price_changes_created_at_idx" ON "price_changes"("created_at");

-- CreateIndex
CREATE INDEX "price_changes_purchase_id_idx" ON "price_changes"("purchase_id");

-- CreateIndex
CREATE INDEX "price_changes_bulk_price_update_id_idx" ON "price_changes"("bulk_price_update_id");

-- CreateIndex
CREATE INDEX "price_changes_user_id_idx" ON "price_changes"("user_id");

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- A mano (Prisma no declara extensiones, CHECK, índices parciales ni de expresión)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Extensiones para buscar por nombre sin distinguir mayúsculas ni acentos.
-- unaccent: saca los acentos ("cafe" encuentra "Café"). pg_trgm: índice de trigramas para "contiene".
-- Las dos vienen con PostgreSQL (paquete contrib; el instalador de Windows las incluye) y son
-- "trusted" desde PostgreSQL 13: las puede crear el dueño de la base sin ser superusuario.
-- Si en algún entorno el usuario de la aplicación no tiene ese permiso, se crean UNA vez como
-- superusuario: psql -d <base> -c "CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;"
-- (ver README / docs de instalación).
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- unaccent() es STABLE (depende del diccionario) y por eso no se puede usar en un índice.
-- Esta función la fija a un diccionario concreto y la declara IMMUTABLE: es el truco estándar.
-- La API tiene que buscar con la MISMA expresión: f_unaccent(lower(name)) ILIKE '%texto%'.
CREATE FUNCTION "f_unaccent"(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- -----------------------------------------------------------------------------
-- Setting: una sola fila (id = 1) y valores válidos
-- -----------------------------------------------------------------------------
ALTER TABLE "settings" ADD CONSTRAINT "settings_single_row_check" CHECK ("id" = 1);
ALTER TABLE "settings" ADD CONSTRAINT "settings_price_rounding_step_check" CHECK ("price_rounding_step" >= 0);
ALTER TABLE "settings" ADD CONSTRAINT "settings_cutoff_minutes_check"
  CHECK ("business_day_cutoff_minutes" BETWEEN 0 AND 1439);

-- Fila inicial: así GET /api/settings nunca da 404. Los valores reales se cargan al instalar.
INSERT INTO "settings" ("id", "store_name", "price_rounding_step", "business_day_cutoff_minutes", "updated_at")
VALUES (1, 'Kiosco', 10.00, 360, CURRENT_TIMESTAMP);

-- -----------------------------------------------------------------------------
-- Categorías y subcategorías: nombres únicos sin distinguir mayúsculas, márgenes >= 0
-- -----------------------------------------------------------------------------
-- "Bebidas" y "bebidas" son la misma categoría.
CREATE UNIQUE INDEX "categories_name_ci" ON "categories" (lower("name"));
ALTER TABLE "categories" ADD CONSTRAINT "categories_margin_percent_check" CHECK ("margin_percent" >= 0);

-- Único dentro de la categoría. También sirve como índice de category_id (columna de adelante).
CREATE UNIQUE INDEX "subcategories_category_name_ci" ON "subcategories" ("category_id", lower("name"));
ALTER TABLE "subcategories" ADD CONSTRAINT "subcategories_margin_percent_check"
  CHECK ("margin_percent" IS NULL OR "margin_percent" >= 0);

-- -----------------------------------------------------------------------------
-- Productos
-- -----------------------------------------------------------------------------
ALTER TABLE "products" ADD CONSTRAINT "products_net_cost_price_check" CHECK ("net_cost_price" >= 0);
-- El costo final nunca es menor que el neto (neto + IVA).
ALTER TABLE "products" ADD CONSTRAINT "products_cost_price_check" CHECK ("cost_price" >= "net_cost_price");
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_percent_check"
  CHECK ("vat_rate_percent" >= 0 AND "vat_rate_percent" <= 100);
ALTER TABLE "products" ADD CONSTRAINT "products_margin_percent_check"
  CHECK ("margin_percent" IS NULL OR "margin_percent" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_sale_price_check" CHECK ("sale_price" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_min_stock_check" CHECK ("min_stock" >= 0);
ALTER TABLE "products" ADD CONSTRAINT "products_units_per_pack_check"
  CHECK ("units_per_pack" IS NULL OR "units_per_pack" > 0);
-- "Varios" no tiene costo ni stock (H-09, STK regla 5).
ALTER TABLE "products" ADD CONSTRAINT "products_miscellaneous_no_cost_no_stock_check"
  CHECK (NOT "is_miscellaneous" OR ("net_cost_price" = 0 AND "cost_price" = 0 AND "stock_quantity" = 0));

-- Un solo "Varios" en todo el sistema.
CREATE UNIQUE INDEX "products_single_miscellaneous" ON "products" ("is_miscellaneous") WHERE "is_miscellaneous";

-- Búsqueda por nombre del mostrador y de la lista: "contiene", sin mayúsculas ni acentos.
-- Un índice común (btree) no sirve para ILIKE '%texto%' (búsqueda en el medio del nombre);
-- el índice GIN de trigramas sí. Se justifica porque la búsqueda es "contiene" y tiene que
-- responder rápido mientras se tipea (NF-12). La consulta debe usar exactamente esta expresión.
CREATE INDEX "products_name_search_trgm" ON "products" USING GIN ((f_unaccent(lower("name"))) gin_trgm_ops);

-- Búsqueda por código de barras que EMPIEZA con (lista de productos): LIKE 'texto%'.
-- text_pattern_ops hace que el btree sirva para prefijos aunque la base no use collation "C".
-- (La búsqueda por código exacto usa el índice único products_barcode_key.)
CREATE INDEX "products_barcode_prefix" ON "products" ("barcode" text_pattern_ops) WHERE "barcode" IS NOT NULL;

-- Lista "Para reponer" (PA-26, H-30): activos, no "Varios", stock <= mínimo (también con mínimo 0).
CREATE INDEX "products_restock" ON "products" ("stock_quantity")
  WHERE "is_active" AND NOT "is_miscellaneous" AND "stock_quantity" <= "min_stock";

-- -----------------------------------------------------------------------------
-- Historial de stock
-- -----------------------------------------------------------------------------
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_quantity_nonzero_check" CHECK ("quantity" <> 0);
-- Es un ajuste si y solo si tiene motivo.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_adjustment_reason_check"
  CHECK (("type" = 'ADJUSTMENT') = ("adjustment_reason" IS NOT NULL));
-- Motivo "otro" exige nota.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_other_requires_note_check"
  CHECK ("adjustment_reason" IS DISTINCT FROM 'OTHER' OR "note" IS NOT NULL);
-- Ventas y compras apuntan a su línea de origen (las FK se agregan en las etapas 3 y 5).
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_item_check"
  CHECK ("type" NOT IN ('SALE', 'SALE_VOID') OR "sale_item_id" IS NOT NULL);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchase_item_check"
  CHECK ("type" NOT IN ('PURCHASE', 'PURCHASE_VOID') OR "purchase_item_id" IS NOT NULL);
-- Signo según el tipo: la venta y la anulación de compra restan; la anulación de venta y la compra suman.
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_type_sign_check" CHECK (
  ("type" NOT IN ('SALE', 'PURCHASE_VOID') OR "quantity" < 0)
  AND ("type" NOT IN ('SALE_VOID', 'PURCHASE') OR "quantity" > 0)
);
-- Signo según el motivo del ajuste (H-29 b): rotura, faltante y consumo propio restan; carga inicial suma;
-- conteo y "otro" aceptan cualquier signo (distinto de 0).
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reason_sign_check" CHECK (
  ("adjustment_reason" IS NULL OR "adjustment_reason" NOT IN ('BREAKAGE', 'MISSING', 'OWN_CONSUMPTION') OR "quantity" < 0)
  AND ("adjustment_reason" IS DISTINCT FROM 'INITIAL_LOAD' OR "quantity" > 0)
);
-- Conteo (H-28 b): lo contado es stock_after y no puede ser negativo. No hay columna "counted".
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_count_nonnegative_check"
  CHECK ("adjustment_reason" IS DISTINCT FROM 'COUNT_CORRECTION' OR "stock_after" >= 0);
-- Nota: que stock_after coincida con el stock anterior + quantity no se puede verificar con un CHECK
-- (depende de otras filas); lo garantiza el backend dentro de la transacción. Lo mismo para "unidades
-- enteras en productos por unidad": depende de otra tabla y lo valida el backend.

-- -----------------------------------------------------------------------------
-- Historial de precios
-- -----------------------------------------------------------------------------
-- Una compra o un aumento masivo tienen que decir de cuál vienen (las FK llegan en las etapas 5 y 6).
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_purchase_source_check"
  CHECK ("source" <> 'PURCHASE' OR "purchase_id" IS NOT NULL);
ALTER TABLE "price_changes" ADD CONSTRAINT "price_changes_bulk_source_check"
  CHECK ("source" <> 'BULK_UPDATE' OR "bulk_price_update_id" IS NOT NULL);
