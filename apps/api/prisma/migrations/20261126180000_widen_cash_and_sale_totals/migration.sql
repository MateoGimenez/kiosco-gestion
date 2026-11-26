-- Totales y acumulados más anchos: suman muchas filas, así que no pueden desbordar con importes válidos
-- (los importes de entrada tienen tope de 9 enteros). Ensanchar numeric no pierde datos.
ALTER TABLE "cash_sessions"
  ALTER COLUMN "expected_cash" TYPE DECIMAL(18,2),
  ALTER COLUMN "difference" TYPE DECIMAL(18,2);

ALTER TABLE "sales"
  ALTER COLUMN "subtotal" TYPE DECIMAL(18,2),
  ALTER COLUMN "discount_amount" TYPE DECIMAL(18,2),
  ALTER COLUMN "surcharge_amount" TYPE DECIMAL(18,2),
  ALTER COLUMN "total" TYPE DECIMAL(18,2);
