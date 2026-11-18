// Esquemas Zod de login, sesión y usuarios (docs/api/auth-usuarios.md, sección 2).
// El backend valida con estos esquemas y el frontend los usa en formularios y para tipar.
import { z } from 'zod';
import { USER_ROLES } from '../enums';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_PATTERN,
} from './constants';

/** Largo en bytes UTF-8 (shared no tiene TextEncoder en sus tipos: corre en Node y en el navegador). */
export function utf8Bytes(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const code = char.codePointAt(0)!;
    bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  }
  return bytes;
}

export const UserRoleSchema = z.enum(USER_ROLES);

/** Puerta por la que entró una sesión (el script `SCRIPT` no tiene sesión). */
export const ACCESS_CHANNELS = ['LOCAL', 'REMOTE'] as const;
export const AccessChannelSchema = z.enum(ACCESS_CHANNELS);
export type AccessChannel = z.infer<typeof AccessChannelSchema>;

/** Nombre de usuario: sin espacios en los extremos, en minúsculas, [a-z0-9._-] de 3 a 30. */
export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_PATTERN, 'Usá de 3 a 30 letras sin acento, números, punto, guion o guion bajo.');

export const FullNameSchema = z.string().trim().min(1, 'Ingresá el nombre.').max(80);

/** Contraseña al crear o resetear. Sin `trim`: los espacios cuentan. */
export const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Tiene que tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`)
  .refine((v) => utf8Bytes(v) <= PASSWORD_MAX_BYTES, {
    message: `Es demasiado larga (máximo ${PASSWORD_MAX_BYTES} bytes).`,
  });

/** `:id` de la ruta: entero positivo que entra en un Int de PostgreSQL. */
export const UserIdParamSchema = z.object({
  id: z
    .string()
    .regex(/^[1-9]\d{0,9}$/, 'Tiene que ser un número entero positivo.')
    .transform(Number)
    .refine((n) => n <= 2_147_483_647, 'Tiene que ser un número entero positivo.'),
});

// --- Objetos de respuesta -------------------------------------------------------

export const SessionUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  fullName: z.string(),
  role: UserRoleSchema,
});
export type SessionUser = z.infer<typeof SessionUserSchema>;

export const SessionResponseSchema = z.object({
  user: SessionUserSchema,
  access: AccessChannelSchema,
  expiresAt: z.string(),
});
export type SessionResponse = z.infer<typeof SessionResponseSchema>;

/** Usuario visto por el dueño. Nunca incluye passwordHash ni tokenVersion. */
export const UserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  fullName: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const UserListResponseSchema = z.object({ items: z.array(UserSchema) });
export type UserListResponse = z.infer<typeof UserListResponseSchema>;

// --- Requests (todos estrictos: un campo desconocido es 400) --------------------

export const LoginRequestSchema = z.strictObject({
  // Sin validar el formato: un nombre raro da 401, no 400.
  username: z.string().trim().toLowerCase().min(1).max(USERNAME_MAX_LENGTH),
  password: z
    .string()
    .min(1)
    .refine((v) => utf8Bytes(v) <= PASSWORD_MAX_BYTES, { message: 'Es demasiado larga.' }),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const CreateUserRequestSchema = z.strictObject({
  username: UsernameSchema,
  fullName: FullNameSchema,
  role: UserRoleSchema,
  password: PasswordSchema,
});
export type CreateUserRequest = z.infer<typeof CreateUserRequestSchema>;

export const UpdateUserRequestSchema = z
  .strictObject({
    username: UsernameSchema.optional(),
    fullName: FullNameSchema.optional(),
    role: UserRoleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Mandá al menos un campo para cambiar.',
  });
export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;

export const ResetPasswordRequestSchema = z.strictObject({ newPassword: PasswordSchema });
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const UserListQuerySchema = z.strictObject({
  isActive: z.enum(['true', 'false']).optional(),
  role: UserRoleSchema.optional(),
});
export type UserListQuery = z.infer<typeof UserListQuerySchema>;
