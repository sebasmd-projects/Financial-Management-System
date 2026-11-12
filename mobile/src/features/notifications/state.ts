import { useSyncExternalStore } from "react";
import { createMemoryStore } from "@/features/common/memory";
import type { PushState } from "./registration";

/** Estado de los avisos push de este teléfono (para el centro de avisos): solo en memoria. */
export const pushStateStore = createMemoryStore<PushState>("unknown");
export const usePushState = (): PushState => useSyncExternalStore(pushStateStore.subscribe, pushStateStore.get, pushStateStore.get);
