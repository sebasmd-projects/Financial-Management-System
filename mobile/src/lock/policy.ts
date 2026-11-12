/** Cuánto tiempo en segundo plano antes de pedir de nuevo la huella: 60 s (docs/design-spec.md §3.17). */
export const LOCK_AFTER_MS = 60_000;

/**
 * ¿Hay que bloquear al volver al primer plano? `backgroundedAt` es la hora (ms) en que pasó a segundo plano. Si el reloj del
 * teléfono se atrasó (`now < backgroundedAt`) no se puede saber cuánto pasó: se bloquea.
 */
export function shouldLock(backgroundedAt: number | null, now: number, timeoutMs: number = LOCK_AFTER_MS): boolean {
  if (backgroundedAt === null) return false;
  if (now < backgroundedAt) return true;
  return now - backgroundedAt >= timeoutMs;
}

/** ¿Tapar la pantalla con el velo opaco? Cuando la app pasa a segundo plano o queda «inactiva» (selector de aplicaciones incluido). */
export function shouldCover(appState: string): boolean {
  return appState === "background" || appState === "inactive";
}
