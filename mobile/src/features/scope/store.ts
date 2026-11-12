import { useSyncExternalStore } from "react";
import { createMemoryStore } from "@/features/common/memory";
import { PERSONAL, type Household, type Scope } from "./scope";

/** El ámbito activo y los hogares de la persona: solo en memoria; al bloquear o cerrar sesión se vuelve a «Personal». */
export const scopeStore = createMemoryStore<Scope>(PERSONAL);
export const householdsStore = createMemoryStore<Household[]>([]);

export const useScope = (): Scope => useSyncExternalStore(scopeStore.subscribe, scopeStore.get, scopeStore.get);
export const useHouseholds = (): Household[] => useSyncExternalStore(householdsStore.subscribe, householdsStore.get, householdsStore.get);
