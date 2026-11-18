// Puerta por la que entra un pedido: la local (mostrador y WiFi del local) o la remota (Tailscale).
// La clasificación real la define el ADR 003 (pendiente).
export type Channel = 'local' | 'remote';

declare module 'express-serve-static-core' {
  interface Request {
    /** Por qué puerta entró el pedido. Se fija por la puerta, nunca por encabezados. */
    access: Channel;
  }
}
