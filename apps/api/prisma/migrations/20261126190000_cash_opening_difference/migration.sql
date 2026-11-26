-- Diferencia de apertura (decisión del dueño): se guarda al abrir, como foto fija, para poder filtrar y paginar
-- en la base sin recalcular. Las cajas ya existentes se completan acá con la misma regla.
ALTER TABLE "cash_sessions"
  ADD COLUMN "previous_cash_session_id" INTEGER,
  ADD COLUMN "opening_difference" DECIMAL(18,2);

ALTER TABLE "cash_sessions"
  ADD CONSTRAINT "cash_sessions_previous_cash_session_id_fkey"
  FOREIGN KEY ("previous_cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "cash_sessions_opening_difference_idx" ON "cash_sessions"("opening_difference");

-- Relleno: el cierre anterior es la última caja CERRADA con id menor (una sola caja abierta a la vez).
UPDATE "cash_sessions" s
SET "previous_cash_session_id" = p.id,
    "opening_difference" = s."opening_cash" - p."counted_cash"
FROM "cash_sessions" p
WHERE p.id = (
  SELECT MAX(q.id) FROM "cash_sessions" q
  WHERE q.id < s.id AND q.status = 'CLOSED' AND q.counted_cash IS NOT NULL
);
