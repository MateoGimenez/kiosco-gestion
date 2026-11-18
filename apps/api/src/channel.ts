// Puerta por la que entra un pedido: la local (mostrador y WiFi del local) o la remota (Tailscale).
// La clasificación real está en middleware/access.ts (ADR 003).
import type { UserRole } from '@kiosco/shared';

export type Channel = 'local' | 'remote';

/** Usuario de la sesión, releído de la base en cada pedido (nunca viaja en el JWT). */
export interface AuthUser {
  id: number;
  username: string;
  fullName: string;
  role: UserRole;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Por qué puerta entró el pedido. Se fija por la puerta, nunca por encabezados. */
    access: Channel;
    /** IP del socket (solo informativa para la auditoría y para clasificar la puerta local). */
    socketAddress: string | undefined;
    /** Usuario de la sesión, si el pedido trae una sesión válida. */
    user?: AuthUser;
    /** Vencimiento (fijo) de la sesión actual. */
    sessionExpiresAt?: Date;
  }
}
