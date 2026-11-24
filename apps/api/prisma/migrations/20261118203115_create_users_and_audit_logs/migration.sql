-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('OWNER', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "access_channel" AS ENUM ('LOCAL', 'REMOTE', 'SCRIPT');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "full_name" VARCHAR(100) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(200),
    "details" JSONB,
    "channel" "access_channel" NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- =============================================================================
-- Restricciones a mano (Prisma no las declara)
-- =============================================================================

-- El usuario va siempre en minúsculas y con el formato de la API (3 a 30 caracteres: a-z, 0-9, ".", "_", "-").
-- Así el UNIQUE normal alcanza para que "Maria" y "maria" no convivan (no hace falta citext).
ALTER TABLE "users" ADD CONSTRAINT "users_username_format_check"
  CHECK ("username" = lower("username") AND "username" ~ '^[a-z0-9._-]{3,30}$');

-- Contador de sesiones nunca negativo.
ALTER TABLE "users" ADD CONSTRAINT "users_token_version_check" CHECK ("token_version" >= 0);

-- =============================================================================
-- Auditoría de solo agregar filas
-- =============================================================================

-- Impide UPDATE y DELETE sobre audit_logs, aun si alguien se conecta directo a la base.
-- No bloquea TRUNCATE (los tests de integración lo usan para limpiar). Para proteger también el
-- TRUNCATE en producción, la defensa es quitar permisos al usuario de la app (ver seguridad).
CREATE FUNCTION "audit_logs_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs es de solo agregar filas: no se permite % ', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_logs_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION "audit_logs_append_only"();
