import { useSyncExternalStore } from "react";
import { createMemoryStore } from "./memory";

/** Un contador en memoria: cuando algo cambia datos (guardar un movimiento, leer un aviso) las pantallas con listas lo notan y recargan. */
const version = createMemoryStore(0);

export const bumpData = (): void => version.set(version.get() + 1);
export const useDataVersion = (): number => useSyncExternalStore(version.subscribe, version.get, version.get);
