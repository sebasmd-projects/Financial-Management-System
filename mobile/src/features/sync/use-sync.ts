import { useMemo } from "react";
import { syncApi } from "@core/sync";
import { useFms } from "@/auth/use-session";
import { scopedPath } from "@/features/scope/scope";
import { useScope } from "@/features/scope/store";
import { scopedSyncClient } from "./logic";

/** El cliente de `sync/*` con el ámbito activo. Un cambio de ámbito entrega otro cliente. */
export function useSyncApi() {
  const fms = useFms();
  const scope = useScope();
  return useMemo(() => syncApi(scopedSyncClient(fms, scope)), [fms, scope]);
}

/** Una ruta de lectura con el ámbito aplicado (las personales no se tocan). */
export function useScopedPath(path: string): string {
  const scope = useScope();
  return scopedPath(path, scope);
}
