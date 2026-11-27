-- Devolución del proveedor (H-65 a, docs/api/proveedores.md 15.7), paso 1 de 2: los valores nuevos de enum.
-- PostgreSQL no deja USAR un valor de enum recién agregado en la misma transacción (error 55P04), por eso los
-- CHECK que lo nombran van en la migración siguiente (..._supplier_refund_checks).

-- AlterEnum
ALTER TYPE "cash_movement_reason" ADD VALUE 'SUPPLIER_REFUND';

-- AlterEnum
ALTER TYPE "supplier_entry_type" ADD VALUE 'REFUND';
