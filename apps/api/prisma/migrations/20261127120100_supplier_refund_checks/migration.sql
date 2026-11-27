-- Devolución del proveedor (H-65 a, docs/api/proveedores.md 15.7), paso 2 de 2: se reemplazan cinco CHECK
-- (tres de supplier_account_entries y dos de cash_movements) con el MISMO nombre, para que acepten REFUND y
-- SUPPLIER_REFUND. Sin cambios de columnas ni de datos.
-- Lo que un CHECK no puede mirar (otra tabla): que un SUPPLIER_REFUND apunte a un REFUND con el mismo monto y que
-- todo REFUND con CASH_REGISTER tenga su ingreso de caja. Lo garantiza el backend en una sola transacción.

-- ---- supplier_account_entries ---------------------------------------------
-- Signo por tipo: la devolución SUMA (baja el saldo a favor), siempre con origen y sin compra (H-69 a).
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_amount_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_amount_check" CHECK (
  "amount" <> 0
  AND CASE "type"
    WHEN 'PURCHASE'      THEN "amount" > 0 AND "purchase_id" IS NOT NULL
    WHEN 'PURCHASE_VOID' THEN "amount" < 0 AND "purchase_id" IS NOT NULL
    WHEN 'PAYMENT'       THEN "amount" < 0 AND "payment_source" IS NOT NULL
    WHEN 'REFUND'        THEN "amount" > 0 AND "payment_source" IS NOT NULL AND "purchase_id" IS NULL
    ELSE "purchase_id" IS NULL  -- OPENING_BALANCE y ADJUSTMENT no se vinculan a una compra
  END
);
-- El origen de la plata solo existe en pagos y devoluciones.
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_payment_source_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_payment_source_check"
  CHECK ("payment_source" IS NULL OR "type" IN ('PAYMENT', 'REFUND'));
-- Idempotencia: pagos sueltos y devoluciones; la devolución SIEMPRE lleva su id (solo la crea la ruta 15).
-- El id viaja siempre con su huella (request_hash).
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_request_check";
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_request_check" CHECK (
  ("client_request_id" IS NULL OR "type" IN ('PAYMENT', 'REFUND'))
  AND (("client_request_id" IS NULL) = ("request_hash" IS NULL))
  AND ("type" <> 'REFUND' OR "client_request_id" IS NOT NULL)
);

-- ---- cash_movements ---------------------------------------------------------
-- Sentido de cada motivo (PA-29 + H-65): la devolución del proveedor es un INGRESO vinculado a la cuenta corriente.
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_reason_direction_check";
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reason_direction_check" CHECK (
  ("reason" <> 'SUPPLIER_PAYMENT' OR ("direction" = 'OUT' AND "supplier_account_entry_id" IS NOT NULL))
  AND ("reason" <> 'SUPPLIER_REFUND' OR ("direction" = 'IN' AND "supplier_account_entry_id" IS NOT NULL))
  AND ("reason" <> 'SALE_VOID_REFUND' OR ("direction" = 'OUT' AND "sale_id" IS NOT NULL))
  AND ("reason" NOT IN ('OWNER_WITHDRAWAL', 'EXPENSE') OR "direction" = 'OUT')
  AND ("reason" <> 'CASH_CONTRIBUTION' OR "direction" = 'IN')
);
-- El vínculo con la cuenta corriente solo va con sus dos motivos.
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_supplier_link_check";
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_supplier_link_check"
  CHECK ("supplier_account_entry_id" IS NULL OR "reason" IN ('SUPPLIER_PAYMENT', 'SUPPLIER_REFUND'));
