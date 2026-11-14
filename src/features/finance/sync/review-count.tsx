"use client";

/**
 * Cuántos movimientos esperan en «Por revisar» (el contador del Resumen, de la barra lateral y de la hoja «Más»). Una sola pregunta por
 * pantalla y por ámbito, en memoria: solo el número, nada de los movimientos. `refresh()` lo vuelve a pedir tras aprobar o descartar.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/api";
import { useScope } from "../../household/scope-store";
import { scopeKey } from "../../household/scope";
import { syncApi } from "../../../../core/sync";

interface ReviewCount {
  count: number;
  refresh: () => void;
}

const ReviewCountContext = createContext<ReviewCount>({ count: 0, refresh: () => undefined });

export function ReviewCountProvider({ pathname, children }: { pathname: string; children: ReactNode }) {
  const scope = useScope();
  const key = scopeKey(scope);
  const [count, setCount] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void syncApi(api)
      .summary({ signal: controller.signal, redirectOn401: false })
      .then((result) => {
        if (controller.signal.aborted) return;
        // «Ambos» no tiene lista propia: se cuenta lo personal. Un fallo (sin el FMS activado, sin red) no pinta nada.
        setCount(result.ok ? Math.max(0, result.data.proposed) : 0);
      });
    return () => controller.abort();
  }, [pathname, key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const value = useMemo(() => ({ count, refresh }), [count, refresh]);
  return <ReviewCountContext.Provider value={value}>{children}</ReviewCountContext.Provider>;
}

export const useReviewCount = (): ReviewCount => useContext(ReviewCountContext);

/** El número de movimientos por revisar junto al nombre de «Por revisar» en la navegación (nada si no hay). Lo lee el lector de pantalla como texto. */
export function NavReviewCount({ route }: { route: string }) {
  const { count } = useReviewCount();
  if (route !== "movimientos-por-revisar" || count <= 0) return null;
  return (
    <span className="nav-count">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="visually-hidden"> ({count})</span>
    </span>
  );
}
