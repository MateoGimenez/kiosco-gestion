// Aviso global de "la sesión ya no vale" (401 UNAUTHENTICATED en cualquier pedido).
// Lo emite el cliente de la API y lo escucha el AuthProvider, que vuelve al login.
type Listener = () => void;
const listeners = new Set<Listener>();

export function emitUnauthorized(): void {
  for (const listener of [...listeners]) listener();
}

/** Registra un oyente; devuelve la función para darlo de baja. */
export function subscribeUnauthorized(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
