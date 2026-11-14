import { syncPaths, type SyncEventSummary } from "@core/sync";
import { useResource } from "@/features/common/use-resource";
import { useScopedPath } from "./use-sync";

/** Cuántos movimientos esperan en «Por revisar»: solo el número (nada de los movimientos). Se vuelve a pedir cuando algo cambia datos. */
export function useReviewCount(): number {
  const count = useResource<SyncEventSummary>(useScopedPath(syncPaths.summary)).data?.proposed ?? 0;
  return Math.max(0, count);
}
