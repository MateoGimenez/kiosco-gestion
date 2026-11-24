// Destino seguro para volver después de entrar: solo rutas internas de la app.
// Evita redirecciones abiertas ("//otro-sitio.com", "https://...", "/\otro-sitio.com").

/** Devuelve `from` si es una ruta interna válida (con su query string); si no, "/". */
export function safeInternalPath(from: unknown): string {
  if (typeof from !== 'string') return '/';
  if (!from.startsWith('/') || from.startsWith('//') || from.includes('\\')) return '/';
  // Sin caracteres de control (saltos de línea, tabulaciones) que algunos navegadores ignoran.
  if ([...from].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return '/';
  const path = from.split(/[?#]/)[0];
  if (path === '/login') return '/';
  return from;
}
