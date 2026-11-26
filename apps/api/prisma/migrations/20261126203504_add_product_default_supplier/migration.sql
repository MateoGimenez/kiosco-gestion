-- AlterTable
ALTER TABLE "products" ADD COLUMN     "default_supplier_id" INTEGER;

-- CreateIndex
CREATE INDEX "products_default_supplier_id_idx" ON "products"("default_supplier_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_default_supplier_id_fkey" FOREIGN KEY ("default_supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano: el producto especial "Varios" no tiene proveedor habitual (docs/modelo-datos.md 2.7).
ALTER TABLE "products" ADD CONSTRAINT "products_misc_no_supplier_check"
  CHECK (NOT "is_miscellaneous" OR "default_supplier_id" IS NULL);
