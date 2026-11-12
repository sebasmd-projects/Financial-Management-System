/**
 * Todo lo que la app guarda de la persona en memoria (ámbito, ojo de «ocultar montos», borrador del alta rápida, claves de
 * idempotencia) se registra aquí y se borra de una vez al bloquear o cerrar sesión (`runtime.ts` lo conecta a `session.onWipe`).
 * Nada de esto toca el disco.
 */
const wipers = new Set<() => void>();

/** Cada almacén en memoria registra cómo se vacía. Devuelve la baja (para las pruebas). */
export function onMemoryWipe(wiper: () => void): () => void {
  wipers.add(wiper);
  return () => wipers.delete(wiper);
}

export function wipeMemory(): void {
  wipers.forEach((wiper) => wiper());
}

/** Un almacén mínimo observable (`useSyncExternalStore`) con valor inicial y borrado registrado. */
export function createMemoryStore<T>(initial: T, options: { wipe?: boolean } = {}) {
  let value = initial;
  const listeners = new Set<() => void>();
  const store = {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      store.set(initial);
    },
  };
  if (options.wipe !== false) onMemoryWipe(store.reset);
  return store;
}
