import { useCallback, useEffect, useState } from "react";
import { useFms } from "@/auth/use-session";
import { useDataVersion } from "./invalidate";

export type Failure = "network" | "server";
export interface Resource<T> {
  data: T | null;
  loading: boolean;
  failure: Failure | null;
  reload: () => void;
}

/**
 * Lee una ruta del FMS y la guarda SOLO en el estado del componente (memoria; nada de cachés ni de disco). Recarga si cambia la ruta,
 * si se pide `reload()` o si otra pantalla cambió datos (`bumpData`). `path = null` no pide nada.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const fms = useFms();
  const version = useDataVersion();
  const [state, setState] = useState<{ path: string | null; data: T | null; failure: Failure | null; done: boolean }>({ path: null, data: null, failure: null, done: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController();
    void fms.get<T>(path, { signal: controller.signal }).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setState({ path, data: result.data, failure: null, done: true });
      else setState((current) => ({ path, data: current.path === path ? current.data : null, failure: result.status === 0 ? "network" : "server", done: true }));
    });
    return () => controller.abort();
  }, [fms, path, attempt, version]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  if (path === null) return { data: null, loading: false, failure: null, reload };
  const fresh = state.path === path;
  return { data: fresh ? state.data : null, loading: !fresh || !state.done, failure: fresh ? state.failure : null, reload };
}
