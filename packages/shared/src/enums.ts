// Enums compartidos del modelo (docs/modelo-datos.md 2.22).
// Se definen como objeto constante + tipo, así sirven en tiempo de ejecución y de compilación.

/** Rol de un usuario (permisos: docs/requisitos.md, sección 3). */
export const USER_ROLES = ['OWNER', 'MANAGER', 'EMPLOYEE'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Alícuotas de IVA permitidas (ARCA). Se usa en la validación de compras y productos. */
export const VAT_RATES = ['0', '2.5', '5', '10.5', '21', '27'] as const;
export type VatRate = (typeof VAT_RATES)[number];
