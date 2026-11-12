import { useSyncExternalStore } from "react";
import { createMemoryStore } from "./memory";

/** «Ocultar montos»: solo en memoria (se borra al bloquear). Sin guardar la preferencia en el teléfono. */
export const hiddenStore = createMemoryStore(false);
export const useHidden = (): boolean => useSyncExternalStore(hiddenStore.subscribe, hiddenStore.get, hiddenStore.get);
