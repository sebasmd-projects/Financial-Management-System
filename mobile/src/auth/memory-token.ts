/**
 * El token de sesión mientras la app está desbloqueada: solo en memoria. Sale al bloquear (si está guardado en el llavero),
 * al cerrar sesión y cuando el servidor lo invalida. Nada lo escribe en consola ni en disco desde aquí.
 */
let current: string | null = null;

export const memoryToken = {
  get: () => current,
  set(token: string) {
    current = token;
  },
  clear() {
    current = null;
  },
};
