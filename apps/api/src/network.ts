// Clasificación de red y de Host (ADR 003, puntos 2 y 5). Funciones puras, fáciles de probar.
// Nunca se usan `req.ip`, X-Forwarded-For ni encabezados de Tailscale para decidir nada.
import ipaddr from 'ipaddr.js';

export type ParsedCidr = [ipaddr.IPv4 | ipaddr.IPv6, number];

/**
 * Normaliza una dirección de socket: quita el sufijo de zona (`fe80::1%12`) y convierte
 * `::ffff:192.168.1.5` en `192.168.1.5`. Devuelve null si no se puede interpretar.
 */
export function normalizeIp(address: string | undefined | null): string | null {
  if (!address) return null;
  const withoutZone = address.split('%')[0] ?? '';
  if (!ipaddr.isValid(withoutZone)) return null;
  try {
    return ipaddr.process(withoutZone).toString();
  } catch {
    return null;
  }
}

/** Convierte los CIDR de la configuración (ya validados) en rangos comparables. */
export function parseCidrs(cidrs: readonly string[]): ParsedCidr[] {
  return cidrs.map((c) => ipaddr.parseCIDR(c));
}

/**
 * ¿La dirección está dentro de alguna de las redes? Compara con `match` de CIDR
 * (nunca con textos). Una dirección ilegible cuenta como "fuera".
 */
export function isLocalAddress(address: string | undefined | null, ranges: ParsedCidr[]): boolean {
  const normalized = normalizeIp(address);
  if (!normalized) return false;
  const ip = ipaddr.parse(normalized);
  return ranges.some(([range, bits]) => range.kind() === ip.kind() && ip.match(range, bits));
}

/** Nombre del `Host` sin puerto y sin corchetes de IPv6, en minúsculas. Null si no hay. */
export function hostnameOf(hostHeader: string | undefined): string | null {
  if (!hostHeader) return null;
  const value = hostHeader.trim().toLowerCase();
  if (value.startsWith('[')) {
    const end = value.indexOf(']');
    return end > 1 ? value.slice(1, end) : null;
  }
  // Una IPv6 sin corchetes (varios ":") se toma entera; si no, se quita el puerto.
  const colons = value.split(':').length - 1;
  return colons > 1 ? value : (value.split(':')[0] ?? null);
}

/**
 * IP informativa para la auditoría. Local: la del socket normalizada. Remota: el último valor
 * de X-Forwarded-For (el que agrega `tailscale serve`) si es una IP válida; si no, la del socket.
 * NUNCA se usa para decidir permisos.
 */
export function auditIp(
  channel: 'local' | 'remote',
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
): string | null {
  if (channel === 'remote' && forwardedFor) {
    const last = forwardedFor.split(',').at(-1)?.trim();
    const normalized = normalizeIp(last);
    if (normalized) return normalized;
  }
  return normalizeIp(socketAddress);
}
