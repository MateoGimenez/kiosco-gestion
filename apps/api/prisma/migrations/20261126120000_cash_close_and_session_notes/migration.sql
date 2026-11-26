-- Etapa 4 (Caja): cierre de caja, notas de cierre y CHECK nuevos (docs/modelo-datos.md 2.11 a 2.13).
-- No se edita la migración de la etapa 3: esta la complementa.
-- CreateTable
CREATE TABLE "cash_session_notes" (
    "id" SERIAL NOT NULL,
    "cash_session_id" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_session_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_session_notes_cash_session_id_idx" ON "cash_session_notes"("cash_session_id");

-- CreateIndex
CREATE INDEX "cash_session_notes_user_id_idx" ON "cash_session_notes"("user_id");

-- AddForeignKey
ALTER TABLE "cash_session_notes" ADD CONSTRAINT "cash_session_notes_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_session_notes" ADD CONSTRAINT "cash_session_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- A mano (Prisma no declara CHECK ni índices parciales)

-- El efectivo esperado PUEDE ser negativo (H-53): por ejemplo, abrir con $0 y anular una venta en efectivo
-- de otro turno. Con el CHECK viejo el cierre fallaría y no se podría abrir otra caja.
ALTER TABLE "cash_sessions" DROP CONSTRAINT "cash_sessions_expected_cash_check";

-- La diferencia es siempre contado - esperado (si es NULL, no hay nada que comprobar).
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_difference_check"
  CHECK ("difference" IS NULL OR "difference" = "counted_cash" - "expected_cash");

-- La nota de cierre solo existe en cajas cerradas.
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_closing_note_check"
  CHECK ("status" = 'CLOSED' OR "closing_note" IS NULL);

-- Cada vínculo de un movimiento solo va con su motivo.
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_sale_link_check"
  CHECK ("sale_id" IS NULL OR "reason" = 'SALE_VOID_REFUND');
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_supplier_link_check"
  CHECK ("supplier_account_entry_id" IS NULL OR "reason" = 'SUPPLIER_PAYMENT');

-- Descripción obligatoria (CAJ-06).
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_description_check"
  CHECK (btrim("description") <> '');

-- Una sola devolución en efectivo por venta anulada.
CREATE UNIQUE INDEX "cash_movements_one_refund_per_sale" ON "cash_movements" ("sale_id")
  WHERE "reason" = 'SALE_VOID_REFUND';

-- Notas de cierre: no vacías. (Que la caja esté cerrada lo controla el backend.)
ALTER TABLE "cash_session_notes" ADD CONSTRAINT "cash_session_notes_note_check"
  CHECK (btrim("note") <> '');
