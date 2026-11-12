import { useSyncExternalStore } from "react";
import { createMemoryStore } from "@/features/common/memory";
import type { OpenTarget } from "./routing";

/**
 * Qué aviso abrió la persona al tocarlo. Vive en memoria: si la app estaba bloqueada, espera a que se desbloquee y entonces el
 * `(app)/_layout` navega (no hay ruta montada antes). Se borra al cerrar sesión (no al bloquear: así el toque no se pierde).
 */
export interface Pending {
  target: OpenTarget;
  /** `true` cuando el layout ya navegó al centro de avisos. */
  routed: boolean;
}

export const pendingStore = createMemoryStore<Pending | null>(null, { wipe: false });
export const usePending = (): Pending | null => useSyncExternalStore(pendingStore.subscribe, pendingStore.get, pendingStore.get);
export const openFromTap = (target: OpenTarget): void => pendingStore.set({ target, routed: false });
export const markRouted = (): void => {
  const current = pendingStore.get();
  if (current && !current.routed) pendingStore.set({ ...current, routed: true });
};
export const clearPending = (): void => pendingStore.set(null);
